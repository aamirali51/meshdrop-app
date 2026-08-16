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

// ─── Engine boot ───────────────────────────────────────────────────────────

async function boot() {
  if (!MeshEngine) return
  try {
    let baseDir = (typeof Bare !== 'undefined' && Bare.argv && Bare.argv[0]) || (typeof process !== 'undefined' && process.argv && process.argv[0])
    let customDownloads = (typeof Bare !== 'undefined' && Bare.argv && Bare.argv[1]) || (typeof process !== 'undefined' && process.argv && process.argv[1])
    if (!baseDir || baseDir.startsWith('/app.bundle')) {
      baseDir = '/data/user/0/com.meshdropmobile/files'
    }
    if (baseDir.endsWith('/engine') || baseDir.endsWith('\\engine')) {
      baseDir = path.dirname(baseDir)
    }

    storageDir = path.join(baseDir, 'mesh_store')
    downloadsDir = customDownloads || '/storage/emulated/0/Download'

    engine = new MeshEngine({
      storageDir,
      downloadsDir,
      deviceName: 'MeshDrop Mobile',
      autoAcceptOffers: false,
      autoTrustLAN: true,
      // The Bare worklet cannot create raw UDP sockets — LAN discovery is
      // unavailable there, so disable it (DHT discovery still works).
      lanDiscovery: false
    })

    // Forward engine events to the UI.
    const EVENTS = [
      'peer:connected',
      'peer:disconnected',
      'trust:paired',
      'trust:untrusted',
      'trust:revoked',
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
      'sync:phase'
    ]
    for (const evt of EVENTS) {
      engine.on(evt, (data) => {
        console.log(`[engine event] ${evt}:`, JSON.stringify(data || {}).slice(0, 150))
        send({ type: 'event', event: evt, data })
      })
    }

    await engine.start()
    send({ type: 'engine', status: 'ready', identity: engine.getIdentity() })
  } catch (err) {
    send({ type: 'engine', status: 'error', message: String((err && err.message) || err) })
  }
}

// ─── RPC Dispatch ──────────────────────────────────────────────────────────

function call(method, params) {
  return Promise.resolve().then(() => {
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
    case 'setLANDiscovery':
      // LAN discovery cannot run inside the Bare worklet (no raw UDP
      // sockets), so this is intentionally a persisted-only non-op.
      return { supported: false, lanDiscovery: false }
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
    case 'pairWithCode': {
      console.log('[engine] RPC pairWithCode received code:', params && params.code)
      return engine.pairWithCode(params.code)
    }
    case 'createDropCode':
    case 'createDropShare': {
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
      return engine.listPendingShares()
    case 'claimDropCode':
      return engine.claimDropCode(params.code)
    case 'cancelCode':
    case 'cancelDropCode':
    case 'cancelShare':
    case 'cancelDropShare':
      return engine.cancelPendingShare({ id: params?.id, code: params?.code })
    case 'listTransfers':
      return engine.listTransfers()
    case 'getStorageStats':
      return engine.getStorageStats()
    case 'clearTransferLog':
      return engine.clearTransferLog()
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
      return engine.clearTransfers()
    case 'sendOffer':
    case 'sendTransfer':
    case 'offerFile':
      return engine.offerFile(params.recipientPeerId || params.peerId, params.filePath)
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
