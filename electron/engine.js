'use strict'

// Engine bridge: owns the MeshEngine instance inside the Electron main
// process and streams its events to the renderer over the legacy
// 'pear:worker:ipc:' channel.
//
// The old architecture ran the P2P engine in a separate Bare worker process
// (PearRuntime + FramedStream pipe) and forwarded its events to the renderer
// verbatim. The engine now lives in-process (@meshdrop-go/core); the renderer's
// protocol contract is preserved by re-encoding MeshEngine events as the
// worker-protocol events the UI already subscribes to.

const { MeshEngine } = require('@meshdrop-go/core')
const os = require('os')
const { EVENTS, createEvent } = require('../src/shared/protocol.js')
const { subscribeEngineEvents } = require('../src/shared/engine-events.js')

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
  // Desktop runs on LAN/Wi-Fi with no tight memory budget: the largest head/
  // tail windows, widest sync-stream byte cap, and unlimited peer fan-in.
  const engine = new MeshEngine({
    storageDir,
    downloadsDir,
    deviceName,
    autoAcceptOffers: false,
    networkProfile: {
      kind: 'desktop',
      headBytes: 4 * 1024 * 1024,
      tailBytes: 2 * 1024 * 1024,
      lookaheadBlocks: 256,
      syncWindowBytes: 8 * 1024 * 1024,
      requestTimeoutMs: 500,
      maxConcurrentPeers: Infinity,
      lruBytes: 64 * 1024 * 1024
    }
  })
  let started = false
  let startPromise = null
  let networkPollStarted = false

  // Final framing for this transport: a protocol event becomes a Buffer of
  // JSON pushed over the legacy worker channel. The translation table and its
  // sync-suppression gate live in ../src/shared/engine-events.js (shared with
  // the standalone host), so this sink is the only Electron-specific piece.
  const sink = {
    send(event, data) {
      sendToAll('pear:worker:ipc:' + WORKER_SPECIFIER, Buffer.from(createEvent(event, data)))
    }
  }

  // Map @meshdrop-go/core events to the worker-protocol events the renderer consumes.
  // Site-visit side effects (gateway token rotation, persisted notification)
  // stay Electron-specific and are injected as hooks.
  function wireEvents() {
    subscribeEngineEvents({
      engine,
      sink,
      hooks: {
        onVisitStarted: (data) => {
          try {
            const { resetToken } = require('./sites-gateway')
            resetToken()
          } catch {}
          try {
            if (engine.notificationStore) {
              engine.notificationStore.addNotification(
                'Shared Folder',
                `"${data.name || data.code || 'A folder'}" is now available`,
                'info'
              )
            }
          } catch {}
        },
        onVisitStopped: () => {
          try {
            const { resetToken } = require('./sites-gateway')
            resetToken()
          } catch {}
        },
        onEngineError: (err, kind) => {
          console.error(
            `[Main:${getLabel()}] Engine error:`,
            kind === 'coded' ? err.message || err : err
          )
        }
      }
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
      sink.send(EVENTS.WORKER_READY, {
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
