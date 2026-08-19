'use strict'

// Engine bridge: owns the MeshEngine instance inside the Electron main
// process and streams its events to the renderer over the legacy
// 'pear:worker:ipc:' channel.
//
// The old architecture ran the P2P engine in a separate Bare worker process
// (PearRuntime + FramedStream pipe) and forwarded its events to the renderer
// verbatim. The engine now lives in-process (@mesh/core); the renderer's
// protocol contract is preserved by re-encoding MeshEngine events as the
// worker-protocol events the UI already subscribes to.

const { MeshEngine } = require('@mesh/core')
const os = require('os')
const { EVENTS, createEvent } = require('../src/shared/protocol.js')

// The renderer's IPC client (renderer/src/lib/ipc.ts) addresses the engine
// through this identifier. It is only a channel name now — no worker exists.
const WORKER_SPECIFIER = '/workers/main.js'

// Signature of the machine's active network interfaces (non-internal IPv4s).
// A change means the OS moved to another network: the engine's DHT node and
// sockets are bound to the old interface, so only a swarm rebuild re-announces
// this device on the new one.
function networkSignature() {
  try {
    const ifaces = os.networkInterfaces()
    const parts = []
    for (const [name, addrs] of Object.entries(ifaces)) {
      for (const a of addrs || []) {
        if (a && a.family === 'IPv4' && !a.internal && a.address) parts.push(`${name}:${a.address}`)
      }
    }
    return parts.sort().join('|')
  } catch {
    return null
  }
}

function createEngineBridge({ storageDir, downloadsDir, deviceName, sendToAll, getLabel }) {
  const engine = new MeshEngine({ storageDir, downloadsDir, deviceName, autoAcceptOffers: false })
  let started = false
  let startPromise = null
  let networkPollStarted = false

  function forward(event, data) {
    const isSync = !!(data && (data.isSync || data.source === 'sync'))
    if (isSync && (event === EVENTS.TRANSFER_OFFER_RECEIVED || event === EVENTS.TRANSFER_QUEUED || event === EVENTS.TRANSFER_STARTED || event === EVENTS.TRANSFER_COMPLETED)) {
      return
    }
    sendToAll('pear:worker:ipc:' + WORKER_SPECIFIER, Buffer.from(createEvent(event, data)))
  }

  // Map @mesh/core events to the worker-protocol events the renderer consumes.
  function wireEvents() {
    engine.on('peer:connected', (device) => {
      forward(EVENTS.DEVICE_PAIRED, device)
      forward(EVENTS.PEER_CONNECTED, device)
      forward(EVENTS.DEVICE_ONLINE, device)
      forward(EVENTS.DEVICE_UPDATED, device)
      forward(EVENTS.CONNECTION_CHANGED, engine.getStatus())
    })
    engine.on('peer:disconnected', ({ id }) => {
      forward(EVENTS.PEER_DISCONNECTED, { id })
      forward(EVENTS.DEVICE_OFFLINE, { id })
      forward(EVENTS.DEVICE_UPDATED, { id })
      forward(EVENTS.CONNECTION_CHANGED, engine.getStatus())
    })
    engine.on('trust:paired', ({ peer }) => {
      forward(EVENTS.DEVICE_PAIRED, peer)
      forward(EVENTS.DEVICE_UPDATED, peer)
    })
    engine.on('trust:revoked', (data) => {
      // A remote host deleted this device. Forward so the renderer can surface
      // "you were removed" instead of the peer discovering it on next reconnect.
      forward(EVENTS.DEVICE_REMOVED, data)
    })
    engine.on('device:removed', (data) => {
      forward(EVENTS.DEVICE_REMOVED, data)
    })
    engine.on('transfer:offer', (offer) => forward(EVENTS.TRANSFER_OFFER_RECEIVED, offer))
    engine.on('transfer:queued', (t) => forward(EVENTS.TRANSFER_QUEUED, t))
    engine.on('transfer:started', (t) => forward(EVENTS.TRANSFER_STARTED, t))
    engine.on('transfer:progress', (d) => forward(EVENTS.TRANSFER_PROGRESS, d))
    engine.on('transfer:paused', (t) => forward(EVENTS.TRANSFER_PAUSED, t))
    engine.on('transfer:resumed', (t) => forward(EVENTS.TRANSFER_RESUMED, t))
    engine.on('transfer:cancelled', (t) => forward(EVENTS.TRANSFER_CANCELLED, t))
    engine.on('transfer:completed', (t) => forward(EVENTS.TRANSFER_COMPLETED, t))
    engine.on('transfer:failed', (t) => forward(EVENTS.TRANSFER_FAILED, t))
    engine.on('sync:library:added', (d) => forward(EVENTS.SYNC_LIBRARY_ADDED, d))
    engine.on('sync:library:removed', (d) => forward(EVENTS.SYNC_LIBRARY_REMOVED, d))
    engine.on('sync:scan', (d) => forward(EVENTS.SYNC_SCAN, d))
    engine.on('sync:up_to_date', (d) => forward(EVENTS.SYNC_UP_TO_DATE, d))
    engine.on('sync:completed', (d) => forward(EVENTS.SYNC_COMPLETED, d))
    engine.on('sync:deleted', (d) => forward(EVENTS.SYNC_DELETED, d))
    engine.on('sync:conflict', (d) => forward(EVENTS.SYNC_CONFLICT, d))
    engine.on('sync:error', (d) => forward(EVENTS.SYNC_ERROR, d))
    engine.on('sync:invite:received', (d) => forward(EVENTS.SYNC_INVITE_RECEIVED, d))
    engine.on('sync:phase', (d) => forward(EVENTS.SYNC_PHASE, d))
    engine.on('notification:received', (n) => forward(EVENTS.NOTIFICATION_RECEIVED, n))
    engine.on('error', (err) => {
      if (err && err.code && err.code !== 'claim_rejected') {
        console.error(`[Main:${getLabel()}] Engine error:`, err.message || err)
        return
      }
      if (err && err.code === 'claim_rejected') {
        // The renderer toasts drop-claim failures (expired / already used).
        forward(EVENTS.PENDING_SHARE_CLAIM_FAILED, err)
        return
      }
      console.error(`[Main:${getLabel()}] Engine error:`, err)
    })
  }

  // Start the engine exactly once; concurrent callers share the same promise.
  function start() {
    if (startPromise) return startPromise
    startPromise = (async () => {
      await engine.start()
      started = true
      wireEvents()
      const identity = engine.getIdentity()
      console.log(
        `[Main:${getLabel()}] Engine ready (${identity.deviceId} code ${identity.pairingCode})`
      )
      forward(EVENTS.WORKER_READY, {
        identity: { ...engine.deviceIdentity, pairingCode: identity.pairingCode }
      })
      // Watch for interface changes (Wi-Fi → ethernet, router swap, VPN):
      // rebuild the swarm so this device stays findable on the new network.
      if (!networkPollStarted) {
        networkPollStarted = true
        let lastSig = networkSignature()
        setInterval(() => {
          if (!started) return
          const sig = networkSignature()
          if (sig && lastSig && sig !== lastSig) {
            console.log(`[Main:${getLabel()}] Network interface changed — rebuilding swarm`)
            engine.refreshNetwork().catch((err) => {
              console.warn(`[Main:${getLabel()}] refreshNetwork failed:`, err.message)
            })
          }
          lastSig = sig
        }, 10000).unref()
      }
    })().catch((err) => {
      startPromise = null
      console.error(`[Main:${getLabel()}] Engine failed to start:`, err)
      throw err
    })
    return startPromise
  }

  function isStarted() {
    return started
  }

  async function stop() {
    started = false
    if (engine) await engine.stop()
  }

  return { engine, start, stop, isStarted }
}

module.exports = { createEngineBridge, WORKER_SPECIFIER }
