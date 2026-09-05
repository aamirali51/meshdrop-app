// MeshDrop mobile engine bridge.
//
// Runs @mesh/core (the same P2P engine as the desktop app) inside the embedded
// Bare Worklet thread provided by react-native-bare-kit. The React Native UI
// talks to it over a JSON RPC stream on BareKit.IPC:
//
//   RN -> Bare:  { id, method, params }
//   Bare -> RN:  { type: 'response', id, result|error }
//   Bare -> RN:  { type: 'event', event, data }     (engine events)
//   Bare -> RN:  { type: 'engine', status, ... }    (boot lifecycle)

const path = require('bare-path')
const b4a = require('b4a')

// Map the Android transport ('wifi' | 'cellular' | ...) to the core network
// profile (mirrors networkRefreshPolicy.ts on the RN side — the worklet is a
// separate JS context, so the constants are duplicated here deliberately).
function netProfileForType(type) {
  if (type === 'cellular') {
    return {
      kind: 'mobile-cellular',
      // headBytes must cover a typical MP4 moov atom (~1-8MB) before the
      // progressive-playback watermark (playable) flips — mounting with a
      // truncated moov gives ExoPlayer PARSING_CONTAINER_MALFORMED.
      headBytes: 8 * 1024 * 1024,
      tailBytes: 2 * 1024 * 1024,
      lookaheadBlocks: 64,
      syncWindowBytes: 2 * 1024 * 1024,
      requestTimeoutMs: 1500,
      maxConcurrentPeers: 2,
      lruBytes: 8 * 1024 * 1024
    }
  }
  return {
    kind: 'mobile-wifi',
    headBytes: 8 * 1024 * 1024,
    tailBytes: 4 * 1024 * 1024,
    lookaheadBlocks: 128,
    syncWindowBytes: 4 * 1024 * 1024,
    requestTimeoutMs: 500,
    maxConcurrentPeers: 3,
    lruBytes: 16 * 1024 * 1024
  }
}

console.error('MESHDROP worklet boot: BareKit=' + typeof BareKit + ' IPC=' + !!(typeof BareKit !== 'undefined' && BareKit.IPC))

const IPC = (typeof BareKit !== 'undefined' && BareKit.IPC) ? BareKit.IPC : null

function send(msg) {
  if (!IPC) return
  try {
    const payload = JSON.stringify(msg) + '\n'
    IPC.write(b4a.from(payload))
  } catch (err) {
    console.error('MESHDROP send error:', String((err && err.message) || err))
  }
}

function formatArgs(args) {
  return args.map((a) => {
    try {
      return typeof a === 'object' ? JSON.stringify(a) : String(a)
    } catch {
      return String(a)
    }
  }).join(' ')
}

const origLog = console.log
const origErr = console.error
const origWarn = console.warn

console.log = function (...args) {
  try { origLog.apply(console, args) } catch {}
  send({ type: 'log', level: 'info', text: formatArgs(args) })
}
console.warn = function (...args) {
  try { origWarn.apply(console, args) } catch {}
  send({ type: 'log', level: 'warn', text: formatArgs(args) })
}
console.error = function (...args) {
  try { origErr.apply(console, args) } catch {}
  send({ type: 'log', level: 'error', text: formatArgs(args) })
}

// Polyfill global Buffer in Bare runtime if needed
if (typeof globalThis.Buffer === 'undefined') {
  try {
    globalThis.Buffer = require('bare-buffer')
  } catch {
    try {
      globalThis.Buffer = require('buffer').Buffer
    } catch {}
  }
}

// Polyfill global process in Bare runtime if needed
if (typeof process === 'undefined') {
  if (typeof Bare !== 'undefined' && Bare.process) {
    globalThis.process = Bare.process
  } else {
    globalThis.process = {
      platform: 'android',
      arch: 'x64',
      cwd: () => '/',
      env: {},
      argv: [],
      nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)),
      on: () => {},
      emit: () => {}
    }
  }
}

if (typeof Bare !== 'undefined' && typeof Bare.on === 'function') {
  Bare.on('unhandledRejection', (err) => {
    console.error('MESHDROP unhandledRejection: ' + String((err && err.stack) || err))
    send({
      type: 'engine',
      status: 'error',
      message: 'engine error: ' + String((err && err.stack) || err)
    })
  })
} else if (typeof process !== 'undefined' && typeof process.on === 'function') {
  process.on('unhandledRejection', (err) => {
    console.error('MESHDROP unhandledRejection: ' + String((err && err.stack) || err))
    send({
      type: 'engine',
      status: 'error',
      message: 'engine error: ' + String((err && err.stack) || err)
    })
  })
}

let MeshEngine = null
try {
  ;({ MeshEngine } = require('@mesh/core'))
} catch (err) {
  console.error('[MeshDrop] engine load failed:', String((err && err.message) || err))
  send({
    type: 'engine',
    status: 'error',
    message: 'P2P engine unavailable on this build: ' + String((err && err.message) || err).slice(0, 200)
  })
}

let engine = null
let storageDir = null
let downloadsDir = null

// ─── Relay HTTP bridge ─────────────────────────────────────────────────────
// The Bare worklet has no global fetch/WebSocket, so the engine's relay
// client proxies its HTTP through the RN side (which has real fetch):
//   worklet -> RN:  { type: 'relayHttp', reqId, method, url, body }
//   RN -> worklet:  { type: 'relayHttpResult', reqId, ok, text }
const relayPending = new Map()
let relaySeq = 1

function relayCall(method, url, bodyObj) {
  return new Promise((resolve) => {
    const reqId = relaySeq++
    relayPending.set(reqId, resolve)
    send({
      type: 'relayHttp',
      reqId,
      method,
      url,
      body: bodyObj === undefined ? undefined : JSON.stringify(bodyObj)
    })
    // Never hang the relay client on a dead bridge.
    setTimeout(() => {
      if (relayPending.has(reqId)) {
        relayPending.delete(reqId)
        resolve(null)
      }
    }, 10000)
  })
}

function handleRelayHttpResult(msg) {
  const resolve = relayPending.get(msg.reqId)
  if (!resolve) return
  relayPending.delete(msg.reqId)
  let parsed = null
  try {
    parsed = msg.text ? JSON.parse(msg.text) : null
  } catch {
    parsed = null
  }
  resolve(msg.ok ? parsed : null)
}

// The transport object handed to MeshEngine (-> RelayClient): POST stores
// relay frames in KV, GET polls the topic's message list.
const relayHttp = {
  post: (url, bodyObj) => relayCall('POST', url, bodyObj),
  get: (url) => relayCall('GET', url)
}

// ─── Engine boot ───────────────────────────────────────────────────────────

async function boot() {
  if (!MeshEngine) {
    console.error('[MDLOG] boot abort: MeshEngine not loaded')
    return
  }
  const bootStart = Date.now()
  console.log('[MDLOG] boot() called, MeshEngine loaded OK')

  try {
    let baseDir = (typeof Bare !== 'undefined' && Bare.argv && Bare.argv[0]) || (typeof process !== 'undefined' && process.argv && process.argv[0])
    let customDownloads = (typeof Bare !== 'undefined' && Bare.argv && Bare.argv[1]) || (typeof process !== 'undefined' && process.argv && process.argv[1])
    console.log('[MDLOG] baseDir raw:', baseDir, 'downloads:', customDownloads)

    if (!baseDir || baseDir.startsWith('/app.bundle')) {
      baseDir = '/data/user/0/com.meshdropmobile/files'
    }
    if (baseDir.endsWith('/engine') || baseDir.endsWith('\\engine')) {
      baseDir = path.dirname(baseDir)
    }

    storageDir = path.join(baseDir, 'mesh_store')
    downloadsDir = customDownloads || '/storage/emulated/0/Download'
    console.log('[MDLOG] storageDir:', storageDir, 'downloadsDir:', downloadsDir)

    console.log('[MDLOG] creating MeshEngine...')
    // Default to the mobile-wifi profile at boot; the RN side pushes the exact
    // profile (wifi vs cellular) via the setNetworkProfile RPC on engine-ready
    // and on every network-type change.
    const initialProfile = netProfileForType('wifi')
    engine = new MeshEngine({
      storageDir,
      downloadsDir,
      deviceName: 'MeshDrop Mobile',
      autoAcceptOffers: false,
      autoTrustLAN: true,
      lanDiscovery: true,
      relayHttp,
      networkProfile: initialProfile
    })
    console.log('[MDLOG] MeshEngine created OK')

    // Forward engine events to the UI with detailed logging.
    const EVENTS = [
      'peer:connected',
      'peer:disconnected',
      'trust:paired',
      'trust:untrusted',
      'trust:revoked',
      'pairing:failed',
      'device:updated',
      'device:removed',
      'drop:created',
      'drop:claimed',
      'drop:expired',
      'transfer:pending_approval',
      'transfer:offer',
      'transfer:queued',
      'transfer:started',
      'transfer:progress',
      'transfer:completed',
      'transfer:failed',
      'transfer:cancelled',
      'transfer:paused',
      'transfer:resumed',
      'sync:library:added',
      'sync:library:removed',
      'sync:scan',
      'sync:up_to_date',
      'sync:completed',
      'sync:deleted',
      'sync:conflict',
      'sync:error',
      'sync:invite:received',
      'sync:phase',
      'claim:preview',
      'site:invite:received',
      'site:visit:started',
      'site:visit:stopped',
      'watch:state:updated',
      'watch:peer:status',
      'party:room:created',
      'party:room:joined',
      'party:room:updated',
      'party:room:left',
      'party:room:closed',
      'party:peer:joined',
      'party:peer:left',
      'party:peer:status',
      'party:state:sync',
      'party:reaction',
      'party:rooms:discovered',
      'party:media:offer',
      'party:media:ready',
      'party:media:error',
      'party:chat',
      'party:chat:history',
      'party:voice',
      'party:moderated'
    ]
    for (const evt of EVENTS) {
      engine.on(evt, (data) => {
        console.log(`[MDLOG event] ${evt}:`, JSON.stringify(data || {}).slice(0, 200))
        send({ type: 'event', event: evt, data })
      })
    }

    // Extra diagnostic hooks on the swarm and DHT
    engine.on('error', (err) => {
      console.error('[MDLOG engine error]:', String(err && err.stack || err))
    })

    console.log('[MDLOG] calling engine.start()...')
    const startT = Date.now()
    await engine.start()
    const startDur = Date.now() - startT
    console.log(`[MDLOG] engine.start() completed in ${startDur}ms`)

    const identity = engine.getIdentity()
    console.log('[MDLOG] identity:', JSON.stringify({
      deviceId: identity && identity.deviceId,
      publicKey: identity && identity.publicKey && identity.publicKey.slice(0, 16) + '...',
      pairingCode: identity && identity.pairingCode
    }))

    const status = engine.getStatus()
    console.log('[MDLOG] initial status:', JSON.stringify(status))

    // Hook into the internal swarm if available for DHT diagnostics
    try {
      const swarm = engine.swarm
      if (swarm) {
        console.log('[MDLOG] swarm exists, dht:', !!swarm.dht, 'listening:', swarm._listening)
        if (swarm.dht) {
          console.log('[MDLOG] dht.ready:', typeof swarm.dht.ready, 'dht.bootstrap:', JSON.stringify(swarm.dht.bootstrap || 'default'))
          console.log('[MDLOG] dht.holepuncher:', !!swarm.dht.holepuncher, 'randomized:', swarm.dht.randomized)
        }
        swarm.on('connection', (conn, info) => {
          console.log('[MDLOG swarm connection] peer:', info && info.publicKey && b4a.toString(info.publicKey, 'hex').slice(0, 16) + '...', 'client:', info && info.client, 'relay:', info && info.relayed)
        })
        swarm.on('update', () => {
          console.log('[MDLOG swarm update] known peers:', swarm.knownPeers, 'connecting:', swarm.connecting, 'connected:', swarm.connections)
        })
      }
    } catch (diagErr) {
      console.log('[MDLOG swarm diag skipped]:', String(diagErr.message || diagErr))
    }

    console.log(`[MDLOG] total boot time: ${Date.now() - bootStart}ms`)
    send({ type: 'engine', status: 'ready', identity })
  } catch (err) {
    console.error('[MDLOG] boot failed:', String(err && err.stack || err))
    send({ type: 'engine', status: 'error', message: String((err && err.message) || err) })
  }
}

// ─── RPC Dispatch ──────────────────────────────────────────────────────────

function call(method, params) {
  return Promise.resolve().then(async () => {
    switch (method) {
    case 'getIdentity':
      return engine.getIdentity()
    case 'getStatus':
      return engine.getStatus()
    case 'getSettings':
    case 'getPreferences':
      return engine.getSettings()
    case 'setAutoAcceptOffers':
      return engine.setAutoAcceptOffers(!!params?.enabled)
    case 'setAutoTrustLAN':
      return engine.setAutoTrustLAN(!!params?.enabled)
    case 'setPreferOwnRelay':
      return engine.setPreferOwnRelay(!!params?.enabled)
    case 'setRelayMode':
      return typeof engine.setRelayMode === 'function'
        ? engine.setRelayMode(params?.mode)
        : { success: false, supported: false }
    case 'setCustomRelayUrl':
      return typeof engine.setCustomRelayUrl === 'function'
        ? engine.setCustomRelayUrl(params?.url)
        : { success: false, supported: false }
    case 'setLANDiscovery':
      // LAN discovery cannot run inside the Bare worklet (no raw UDP
      // sockets), so this is intentionally a persisted-only non-op.
      return { supported: false, lanDiscovery: false }
    case 'pairingIntent':
      // Pairing screen open: bring the relay fallback up immediately so a
      // remote device on a challenged network can reach us (lazy 'auto').
      if (engine && typeof engine.setPairingIntent === 'function') {
        engine.setPairingIntent(params?.active !== false)
      }
      return true
    case 'listDevices':
      return engine.listDevices()
    case 'removeDevice':
    case 'forgetDevice':
      return engine.removeDevice(params.id)
    case 'setDeviceTrust':
      if (typeof engine.setDeviceTrust === 'function') {
        return engine.setDeviceTrust(params.id, params.isTrusted ?? params.trusted)
      }
      return true
    case 'getPaths':
      return { storageDir, downloadsDir }
    case 'pairDevice':
    case 'pair':
    case 'pairWithCode':
    case 'devices.pair': {
      const pairCode = params && (params.code || params.pairingCode)
      const pairStart = Date.now()
      console.log('[MDLOG pair] === PAIRING ATTEMPT START === code:', pairCode)
      console.log('[MDLOG pair] engine status before pair:', JSON.stringify(engine.getStatus()))
      try {
        const result = await engine.pairWithCode(pairCode)
        console.log(`[MDLOG pair] === PAIRING SUCCESS === in ${Date.now() - pairStart}ms, peer:`, JSON.stringify(result && { id: result.id, name: result.device && result.device.name }))
        return result
      } catch (pairErr) {
        console.error(`[MDLOG pair] === PAIRING FAILED === in ${Date.now() - pairStart}ms:`, String(pairErr && pairErr.message || pairErr))
        console.error('[MDLOG pair] engine status at failure:', JSON.stringify(engine.getStatus()))
        throw pairErr
      }
    }
    case 'rotatePairingCode':
    case 'devices.rotateCode':
      return typeof engine.rotatePairingCode === 'function' ? engine.rotatePairingCode() : engine.getIdentity()
    case 'createMultiDropShare':
    case 'createDropCode':
    case 'createDropShare':
    case 'files.createCode': {
      if (params && params.filePath) {
        try {
          const fs = require('bare-fs')
          const dir = path.dirname(params.filePath)
          
          function ensureDir(d) {
            if (!d || d === '/' || d === '.') return
            if (fs.existsSync(d)) return
            ensureDir(path.dirname(d))
            try { fs.mkdirSync(d) } catch {}
          }
          
          ensureDir(dir)
          if (!fs.existsSync(params.filePath)) {
            fs.writeFileSync(params.filePath, b4a.from('MeshDrop P2P Encrypted File Payload\nGenerated on mobile device.', 'utf8'))
          }
          try {
            const stat = fs.statSync(params.filePath)
            params.fileSize = stat.size
          } catch {}
        } catch (e) {
          console.error('[engine] createDropShare pre-write error:', String((e && e.message) || e))
        }
      }
      return engine.createDropShare(params)
    }
    case 'listPendingShares':
    case 'files.listCodes':
      return engine.listPendingShares()
    case 'claimDrop':
    case 'claimDropCode':
    case 'claimFile':
    case 'files.claimCode':
      return engine.claimDropCode(params?.code, { interactive: true })
    case 'confirmClaimDownload':
      return engine.confirmClaimDownload(params)
    case 'acceptClaimPreview':
      // The claim preview's Accept button resolves to confirming the download
      // (same path as desktop FILES_CONFIRM_CLAIM). `shareId` is the claim's
      // share id; confirmClaimDownload resolves it into a real transfer.
      return engine.confirmClaimDownload({ shareId: params?.shareId })
    case 'cancelClaimDownload':
      return engine.cancelClaimDownload(params)
    case 'deletePendingShare':
    case 'cancelCode':
    case 'cancelDropCode':
    case 'cancelShare':
    case 'cancelDropShare':
    case 'cancelPendingShare':
    case 'files.cancelCode':
      return engine.cancelPendingShare({ id: params?.id, code: params?.code })
    case 'copyToClipboard':
      return { success: true }
    case 'listTransfers':
      return engine.listTransfers()
    case 'getStorageStats':
      return engine.getStorageStats()
    case 'clearTransferLog':
      return engine.clearTransferLog()
    case 'getTransferHistory':
    case 'history.list': {
      // Read the persisted transfer history bee (same shape the desktop
      // history.list handler returns: newest first).
      const bee = await engine.getBee('history').catch(() => null)
      if (!bee) return []
      const results = []
      for await (const node of bee.createReadStream()) {
        results.push(node.value)
      }
      results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      return results
    }
    case 'clearTransferHistory':
    case 'history.clear': {
      const bee = await engine.getBee('history').catch(() => null)
      if (!bee) return { success: false, count: 0 }
      const keys = []
      for await (const node of bee.createReadStream()) {
        keys.push(node.key)
      }
      for (const k of keys) {
        await bee.del(k)
      }
      return { success: true, count: keys.length }
    }
    case 'deleteHistoryItem': {
      const bee = await engine.getBee('history').catch(() => null)
      if (!bee) return { success: false }
      await bee.del(String(params?.id))
      return { success: true }
    }
    case 'compactStorage':
      return engine.compactStorage()
    case 'acceptTransfer':
      return engine.acceptTransfer(params.id)
    case 'declineTransfer':
      return engine.declineTransfer(params.id)
    case 'cancelTransfer':
      return engine.cancelTransfer(params.id)
    case 'pauseTransfer':
      return engine.pauseTransfer(params.id)
    case 'resumeTransfer':
      return engine.resumeTransfer(params.id)
    case 'retryTransfer':
      return engine.retryTransfer(params.id)
    case 'clearTransfers':
      return engine.clearTransfers(params)
    case 'deleteTransfer':
      return engine.deleteTransfer(params?.id)
    case 'sendFileOffer':
    case 'sendOffer':
    case 'sendTransfer':
    case 'offerFile':
    case 'transfers.offer': {
      const targetId = params?.targetDeviceId || params?.recipientPeerId || params?.peerId
      return engine.offerFile(targetId, params?.filePath)
    }
    case 'createSyncLibrary':
    case 'addSyncLibrary': {
      let targetDir = (params && (params.path || params.localPath)) || null
      if (targetDir && !targetDir.startsWith('/') && !targetDir.startsWith('\\') && !targetDir.includes(':')) {
        const root = '/storage/emulated/0'
        targetDir = path.join(root, targetDir)
      }
      if (!targetDir) {
        targetDir = path.join(downloadsDir || '/storage/emulated/0/Download', 'Sync', params?.name || 'Sync-Folder')
      }
      return engine.addSyncLibrary({
        path: targetDir,
        peerId: params?.peerId || params?.publicKey || undefined,
        name: params?.name || (targetDir ? path.basename(targetDir) : 'Sync-Folder'),
        // Mobile is the source of truth: default to one-way push so the
        // desktop mirror can never modify the phone's folder.
        mode: params?.mode || 'send-only'
      })
    }
    case 'listSyncLibraries':
      return engine.listSyncLibraries()
    case 'deleteSyncLibrary':
    case 'removeSyncLibrary':
      return engine.removeSyncLibrary(params?.id)
    case 'pauseSyncLibrary':
      return engine.pauseSyncLibrary(params?.id)
    case 'resumeSyncLibrary':
      return engine.resumeSyncLibrary(params?.id)
    case 'setSyncLibraryPaused':
      return params?.paused ? engine.pauseSyncLibrary(params?.id) : engine.resumeSyncLibrary(params?.id)
    case 'acceptSyncInvite':
      return engine.acceptSyncInvite({ id: params?.id, customPath: params?.customPath })
    case 'declineSyncInvite':
      return engine.declineSyncInvite({ id: params?.id })
    case 'listSyncInvites':
      return engine.listPendingSyncInvites()
    case 'triggerSync':
    case 'syncLibrary':
    case 'rescanSyncLibrary':
    case 'sync.trigger':
    case 'syncFolder':
      return engine.syncLibrary(params?.id)
    case 'sites.listReceived':
      return engine.listReceivedSites()
    case 'sites.activeVisits':
      return engine.getActiveVisits()
    case 'sites.visit':
      return engine.visitSite(params?.code)
    case 'sites.leave':
      return engine.leaveSite(params?.siteId)
    case 'sites.listPath':
      return engine.listSitePath(params?.path || '/', params?.siteId)
    case 'sites.stats':
      return engine.siteStats(params?.siteId)
    case 'sites.removeReceived':
      return engine.removeReceivedSite(params?.siteId)
    case 'sites.cacheDir':
      return { path: path.join(storageDir, 'site-cache') }
    case 'sites.fetchRange': {
      // Byte-range read from a shared folder: the visitor streams only the
      // requested slice (host honors the inclusive bytes=a-b range). The body
      // is a Buffer in-core; encode it as base64 so the JSON bridge can carry
      // it to RN, which writes it into the local site-cache at the right
      // offset. Bounded to CHUNK by the caller so frames stay small.
      const { range } = params || {}
      const res = await engine.readSiteFile(params.path, { range }, params.siteId)
      if (!res || res.status === 'not-modified' || res.status === 'not-found') {
        throw new Error(res && res.status === 'not-modified' ? 'not-modified' : 'file not found on host')
      }
      const buf = res.body
      return {
        start: res.start || 0,
        end: res.end || (res.size ? res.size - 1 : 0),
        size: res.size,
        base64: b4a.toString(buf, 'base64'),
      }
    }
    case 'refreshNetwork':
      // resolve with plain status, NOT the engine: the RPC layer JSON-serializes
      // every response, and the engine references the DHT routing table
      // (circular) — stringifying it throws and the response is never sent,
      // leaving the bridge's call() pending forever.
      // A dead-network rebuild can fail (swarm.destroy timeout, DHT down).
      // Never reject — the RPC layer would log an unhandled error and the
      // engine's own retry timer heals the swarm when connectivity returns.
      return engine.refreshNetwork().then(
        () => ({ ok: true, status: engine.getStatus() }),
        (err) => {
          console.warn('[worklet] refreshNetwork failed:', String((err && err.message) || err))
          return { ok: false, error: String((err && err.message) || err) }
        }
      )
    case 'setNetworkProfile':
      // wifi<->cellular switch: retune head/tail windows, sync byte cap, and
      // peer fan-in without rebuilding the swarm.
      if (params && params.profile && typeof engine.setNetworkProfile === 'function') {
        engine.setNetworkProfile(params.profile)
        return { ok: true }
      }
      return { ok: false, error: 'invalid profile' }
    case 'broadcastWatchState':
    case 'watchStateBroadcast':
    case 'watch.broadcastState':
      return engine.broadcastWatchState ? engine.broadcastWatchState(params) : { success: true }
    case 'createPartyRoom':
    case 'watch.createRoom':
      if (!engine.createPartyRoom) throw new Error('Party engine unavailable')
      return engine.createPartyRoom(params)
    case 'joinPartyRoom':
    case 'watch.joinRoom':
      if (!engine.joinPartyRoom) throw new Error('Party engine unavailable')
      return engine.joinPartyRoom(params)
    case 'leavePartyRoom':
    case 'watch.leaveRoom':
      return engine.leavePartyRoom ? engine.leavePartyRoom() : { success: true }
    case 'getPartyRoom':
    case 'watch.getRoom':
      return engine.getPartyRoom ? engine.getPartyRoom() : null
    case 'listPartyRooms':
    case 'watch.listRooms':
      return engine.listPartyRooms ? engine.listPartyRooms() : []
    case 'sendPartyReaction':
    case 'watch.reaction':
      return engine.sendPartyReaction ? engine.sendPartyReaction(params) : false
    case 'broadcastPartyStatus':
    case 'watch.status':
      return engine.broadcastPartyStatus ? engine.broadcastPartyStatus(params) : false
    case 'sendPartyChat':
    case 'watch.chat':
      return engine.sendPartyChat ? engine.sendPartyChat(params) : false
    case 'getPartyChatHistory':
    case 'watch.chatHistory':
      return engine.getPartyChatHistory ? engine.getPartyChatHistory() : []
    case 'moderateParty':
    case 'watch.moderate':
      return engine.moderateParty ? engine.moderateParty(params) : { success: false, error: 'no party' }
    case 'setPartyRewindWindow':
    case 'watch.rewindSet':
      return engine.setPartyRewindWindow ? engine.setPartyRewindWindow(params) : false
    case 'addPartyQueueItem':
    case 'watch.queueAdd':
      if (!engine.addPartyQueueItem) throw new Error('Party engine unavailable')
      return engine.addPartyQueueItem(params)
    case 'removePartyQueueItem':
    case 'watch.queueRemove':
      return engine.removePartyQueueItem ? engine.removePartyQueueItem(params) : { success: false }
    case 'playNextPartyMedia':
    case 'watch.queueNext':
      if (!engine.playNextPartyMedia) throw new Error('Party engine unavailable')
      return engine.playNextPartyMedia()
    case 'setPartySubtitle':
    case 'watch.subtitleSet':
      if (!engine.setPartySubtitle) throw new Error('Party engine unavailable')
      return engine.setPartySubtitle(params)
    case 'getPartySubtitle':
    case 'watch.subtitleGet':
      return engine.getPartySubtitle ? engine.getPartySubtitle() : null
    case 'sendPartyVoiceChunk':
    case 'watch.voice':
      return engine.sendPartyVoiceChunk ? engine.sendPartyVoiceChunk(params) : false
    case 'setPlayheadByte':
      return engine.setPlayheadByte ? engine.setPlayheadByte(params?.transferId, params?.byteOffset) : false
    default:
      throw new Error('Unknown method: ' + method)
    }
  })
}

if (IPC) {
  let buffer = ''
  IPC.on('data', (chunk) => {
    try {
      const str = typeof chunk === 'string' ? chunk : b4a.toString(chunk, 'utf8')
      buffer += str
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        let msg
        try {
          msg = JSON.parse(trimmed)
        } catch {
          continue
        }
        // Relay HTTP proxy results (RN -> worklet) resolve the engine's
        // pending relay requests; they are not RPC calls.
        if (msg && msg.type === 'relayHttpResult') {
          handleRelayHttpResult(msg)
          continue
        }
        if (!msg || msg.id === undefined) continue
        call(msg.method, msg.params)
          .then((result) => send({ type: 'response', id: msg.id, result }))
          .catch((err) => send({ type: 'response', id: msg.id, error: String((err && err.message) || err) }))
      }
    } catch (err) {
      console.error('MESHDROP IPC on data error:', String((err && err.message) || err))
    }
  })
}

boot()
