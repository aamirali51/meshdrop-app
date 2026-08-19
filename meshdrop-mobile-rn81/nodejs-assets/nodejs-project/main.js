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
//
// Direct P2P transfers, pairing, drop codes, and folder sync run natively
// over Bare Worklet with udx-native prebuild support.

const path = require('path')
const fs = require('fs')

// Boot probe: confirms the worklet bundle actually executes. Logs go to the
// system log via liblog with the `bare` identifier (logcat -s bare:*).
console.error('MESHDROP worklet boot: BareKit=' + typeof BareKit + ' IPC=' + !!(typeof BareKit !== 'undefined' && BareKit.IPC))

const IPC = (typeof BareKit !== 'undefined' && BareKit.IPC) ? BareKit.IPC : null

function send(msg) {
  if (!IPC) return
  try {
    const payload = JSON.stringify(msg) + '\n'
    IPC.write(typeof Buffer !== 'undefined' ? Buffer.from(payload) : payload)
  } catch {}
}

// bare-module loads modules asynchronously; a resolution failure surfaces as
// an unhandled rejection that aborts the worklet. Report it over IPC instead.
process.on('unhandledRejection', (err) => {
  console.error('MESHDROP unhandledRejection: ' + String((err && err.stack) || err))
  try {
    send({
      type: 'engine',
      status: 'error',
      message: 'engine load: ' + String((err && err.stack) || err)
    })
  } catch {}
})

// Step-by-step load diagnostics: report each top-level dependency so a
// failure tells us exactly which module the bundler missed.
const DIAG_DEPS = ['path', 'fs', 'hyperswarm', 'corestore', 'hyperbee', 'protomux', 'compact-encoding', 'hypercore-crypto']
for (const dep of DIAG_DEPS) {
  try {
    require(dep)
    send({ type: 'engine', status: 'debug', message: 'loaded ' + dep })
  } catch (err) {
    send({ type: 'engine', status: 'error', message: 'FAILED ' + dep + ': ' + String((err && err.message) || err) })
  }
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
    const baseDir = (typeof BareKit !== 'undefined' && BareKit.worklet && BareKit.worklet.dataDir)
      ? BareKit.worklet.dataDir
      : path.join(__dirname, 'data')

    storageDir = path.join(baseDir, 'mesh_store')
    downloadsDir = path.join(baseDir, 'downloads')

    engine = new MeshEngine({
      storageDir,
      downloadsDir,
      deviceName: 'MeshDrop Mobile',
      autoAcceptOffers: true,
      autoTrustLAN: false,
      lanDiscovery: false // DHT pairing only on mobile for now
    })

    // Forward engine events to the UI.
    const EVENTS = [
      'peer:connected',
      'peer:disconnected',
      'trust:paired',
      'transfer:offer',
      'transfer:queued',
      'transfer:started',
      'transfer:progress',
      'transfer:completed',
      'transfer:failed',
      'transfer:cancelled',
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
      engine.on(evt, (data) => send({ type: 'event', event: evt, data }))
    }

    await engine.start()
    send({ type: 'engine', status: 'ready', identity: engine.getIdentity() })
  } catch (err) {
    send({ type: 'engine', status: 'error', message: String((err && err.message) || err) })
  }
}

// ─── RPC ───────────────────────────────────────────────────────────────────

function call(method, params = {}) {
  return Promise.resolve().then(() => {
    switch (method) {
    case 'getIdentity':
      return engine.getIdentity()
    case 'getStatus':
      return engine.getStatus()
    case 'getPaths':
      return { storageDir, downloadsDir }
    case 'listDevices':
      return engine.listDevices()
    case 'pairWithCode':
      return engine.pairWithCode(params.code)
    case 'createDropShare':
      return engine.createDropShare(params)
    case 'listPendingShares':
      return engine.listPendingShares()
    case 'claimDropCode':
      return engine.claimDropCode(params.code)
    case 'cancelShare':
      return engine.cancelPendingShare({ id: params.id })
    case 'listTransfers':
      return engine.listTransfers()
    case 'acceptTransfer':
      return engine.acceptTransfer(params.id)
    case 'declineTransfer':
      return engine.declineTransfer(params.id)
    case 'cancelTransfer':
      return engine.cancelTransfer(params.id)
    case 'retryTransfer':
      return engine.retryTransfer(params.id)
    case 'clearTransfers':
      return engine.clearTransfers()
    case 'offerFile':
      return engine.offerFile(params.peerId, params.filePath)
    case 'addSyncLibrary':
    case 'createSyncLibrary':
      return engine.addSyncLibrary({
        path: params.path || params.localPath,
        peerId: params.peerId,
        name: params.name,
        mode: params.mode
      })
    case 'listSyncLibraries':
      return engine.listSyncLibraries()
    case 'removeSyncLibrary':
    case 'deleteSyncLibrary':
      return engine.removeSyncLibrary(params.id)
    case 'pauseSyncLibrary':
      return engine.pauseSyncLibrary(params.id)
    case 'resumeSyncLibrary':
      return engine.resumeSyncLibrary(params.id)
    case 'setSyncLibraryPaused':
      return params.paused
        ? engine.pauseSyncLibrary(params.id)
        : engine.resumeSyncLibrary(params.id)
    case 'syncLibrary':
    case 'triggerSync':
      return engine.syncLibrary(params.id)
    case 'acceptSyncInvite':
      return engine.acceptSyncInvite(params)
    case 'declineSyncInvite':
      return engine.declineSyncInvite(params)
    case 'listPendingSyncInvites':
    case 'listSyncInvites':
      return engine.listPendingSyncInvites()
    default:
      throw new Error('Unknown method: ' + method)
    }
  })
}

if (IPC) {
  let buffer = ''
  IPC.on('data', (chunk) => {
    try {
      const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      buffer += str
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        let msg
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        if (!msg || msg.id === undefined) continue
        call(msg.method, msg.params)
          .then((result) => send({ type: 'response', id: msg.id, result }))
          .catch((err) => send({ type: 'response', id: msg.id, error: String((err && err.message) || err) }))
      }
    } catch {}
  })
}

boot()

