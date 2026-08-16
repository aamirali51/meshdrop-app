import { EVENTS, PROTOCOL_VERSION, isProtocolCompatible } from '@/types/protocol'
import type { MethodName, EventName, WireMessage, RequestMessage } from '@/types/protocol'

const WORKER_SPECIFIER = '/workers/main.js'

type PendingRequest = {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type QueuedCall = {
  method: MethodName
  params: unknown
  resolve: (result: unknown) => void
  reject: (error: Error) => void
}

const pending = new Map<string, PendingRequest>()
const eventListeners = new Map<string, Set<(data: unknown) => void>>()

let cleanup: (() => void) | null = null
let started = false
let ready = false
let nextId = 1
const queue: QueuedCall[] = []

function generateId(): string {
  return (nextId++).toString(36)
}

function parseMessage(raw: unknown): WireMessage | null {
  try {
    if (!raw) return null
    if (
      typeof raw === 'object' &&
      raw !== null &&
      'type' in raw &&
      typeof (raw as Record<string, unknown>).type === 'string'
    ) {
      const r = raw as Record<string, unknown>
      if (r.type === 'response' || r.type === 'event' || r.type === 'request')
        return raw as WireMessage
    }
    let parsed: unknown = null
    if (typeof raw === 'string') {
      parsed = JSON.parse(raw)
    } else if (raw instanceof Uint8Array) {
      parsed = JSON.parse(new TextDecoder().decode(raw))
    } else if (raw instanceof ArrayBuffer) {
      parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(raw)))
    } else if (
      typeof raw === 'object' &&
      raw !== null &&
      (raw as Record<string, unknown>).type === 'Buffer' &&
      Array.isArray((raw as Record<string, unknown>).data)
    ) {
      const bytes = new Uint8Array((raw as { data: number[] }).data)
      parsed = JSON.parse(new TextDecoder().decode(bytes))
    } else {
      parsed = JSON.parse(JSON.stringify(raw))
    }
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed)
    }
    return parsed as WireMessage
  } catch {
    return null
  }
}

function encodeMessage(msg: RequestMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ ...msg, v: PROTOCOL_VERSION }))
}

function processQueue(): void {
  while (queue.length > 0) {
    const item = queue.shift()!
    doCall(item.method, item.params).then(item.resolve).catch(item.reject)
  }
}

const isBridgeAvailable = typeof window !== 'undefined' && Boolean(window.bridge)

const NOISY_METHODS = new Set([
  'diagnostics.get',
  'devices.list',
  'sync.list',
  'files.listPending',
  'history.list',
  'notifications.list',
  'connection.status'
])

const NOISY_EVENTS = new Set([
  'sync.scan',
  'sync.up_to_date',
  'device.online',
  'device.offline',
  'device.updated',
  'connection.changed'
])

async function doCall(method: MethodName, params?: unknown): Promise<unknown> {
  if (!method || typeof method !== 'string') {
    return Promise.reject(new Error(`Invalid IPC method: ${String(method)}`))
  }
  const id = generateId()
  const isNoisy = NOISY_METHODS.has(method)
  const ts = new Date().toISOString().slice(11, 23)
  if (!isNoisy) {
    console.log(`[IPC ${ts}] >> ${id} ${method}`, params !== undefined ? params : '')
  }

  if (!isBridgeAvailable) {
    // No fabricated data: the P2P engine only exists inside Electron for now.
    console.warn(
      `[IPC ${ts}] window.bridge unavailable (non-Electron environment). Method: ${method}`
    )
    return Promise.reject(new Error('MeshDrop P2P engine is only available in the desktop app'))
  }

  // Timeouts account for relayed fallback connections: when direct UDP
  // hole-punching is blocked, handshakes traverse a DHT relay and can take
  // several seconds longer than a direct LAN/DHT connection.
  const timeoutMs =
    method.startsWith('transfers.start') || method.startsWith('transfers.resume')
      ? 60000
      : method.endsWith('.list') ||
          method.endsWith('.status') ||
          method.endsWith('.get') ||
          method.endsWith('.getIdentity')
        ? 20000
        : 30000

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      console.log(`[IPC ${new Date().toISOString().slice(11, 23)}] !! ${id} TIMEOUT ${method}`)
      reject(new Error(`Request timed out: ${method}`))
    }, timeoutMs)

    pending.set(id, {
      resolve: (result: unknown) => {
        if (!isNoisy) {
          const ts2 = new Date().toISOString().slice(11, 23)
          console.log(`[IPC ${ts2}] << ${id} ${method}`, result !== undefined ? result : '')
        }
        resolve(result)
      },
      reject: (error: Error) => {
        console.log(
          `[IPC ${new Date().toISOString().slice(11, 23)}] !! ${id} ERROR ${method}: ${error.message}`
        )
        reject(error)
      },
      timer
    })

    const msg: RequestMessage = { type: 'request', id, method, params }
    window.bridge.writeWorkerIPC(WORKER_SPECIFIER, encodeMessage(msg)).catch((err) => {
      pending.delete(id)
      clearTimeout(timer)
      console.log(
        `[IPC ${new Date().toISOString().slice(11, 23)}] !! ${id} WRITE FAILED ${method}: ${err.message}`
      )
      reject(err)
    })
  })
}

async function ensureReady(): Promise<void> {
  if (started) return
  started = true

  if (!isBridgeAvailable) {
    ready = true
    processQueue()
    return
  }

  startBridge()
  await window.bridge.startWorker(WORKER_SPECIFIER)

  setTimeout(() => {
    if (!ready) {
      console.log(
        `[IPC ${new Date().toISOString().slice(11, 23)}] Native Electron IPC ready = true`
      )
      ready = true
      processQueue()
    }
  }, 1000)
}

let bridgeStarted = false
function startBridge(): void {
  if (bridgeStarted || cleanup || !isBridgeAvailable) return
  bridgeStarted = true

  cleanup = () => {
    if (window.bridge?.onWorkerIPC) {
      window.bridge.onWorkerIPC(WORKER_SPECIFIER, () => {})
    }
  }

  window.bridge.onWorkerIPC(WORKER_SPECIFIER, (raw: unknown) => {
    const ts = new Date().toISOString().slice(11, 23)
    const msg = parseMessage(raw)
    if (!msg) {
      console.log(`[IPC ${ts}] ?? UNPARSEABLE`, raw)
      return
    }
    if (!isProtocolCompatible(msg)) {
      console.warn(`[IPC ${ts}] ?? UNSUPPORTED PROTOCOL VERSION`, msg.v)
      return
    }

    if (msg.type === 'response') {
      const req = pending.get(msg.id)
      if (!req) return
      pending.delete(msg.id)
      clearTimeout(req.timer)
      if (msg.error) {
        console.log(`[IPC ${ts}] !! ${msg.id} ERROR`, msg.error)
        req.reject(new Error(msg.error))
      } else {
        req.resolve(msg.result)
      }
    } else if (msg.type === 'event') {
      if (!NOISY_EVENTS.has(msg.event)) {
        console.log(`[IPC ${ts}] >> EVENT ${msg.event}`, msg.data !== undefined ? msg.data : '')
      }
      if ((msg.event as string) === (EVENTS.WORKER_READY as string) && !ready) {
        ready = true
        processQueue()
      }
      const listeners = eventListeners.get(msg.event)
      if (listeners) {
        for (const cb of listeners) {
          try {
            cb(msg.data)
          } catch {
            /* swallow */
          }
        }
      }
    }
  })
}

export async function call(method: MethodName, params?: unknown): Promise<unknown> {
  if (!ready) {
    return new Promise((resolve, reject) => {
      queue.push({ method, params, resolve, reject })
      ensureReady()
    })
  }
  return doCall(method, params)
}

export function on(event: EventName, callback: (data: unknown) => void): () => void {
  startBridge()

  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set())
  }

  eventListeners.get(event)!.add(callback)

  return () => {
    eventListeners.get(event)?.delete(callback)
  }
}

export function off(event: EventName, callback: (data: unknown) => void): void {
  eventListeners.get(event)?.delete(callback)
}

export function destroy(): void {
  for (const [, req] of pending) {
    clearTimeout(req.timer)
    req.reject(new Error('Bridge destroyed'))
  }
  pending.clear()
  eventListeners.clear()
  queue.length = 0
  if (cleanup) {
    cleanup()
    cleanup = null
  }
  started = false
  ready = false
}
