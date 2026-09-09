import { EVENTS, PROTOCOL_VERSION, isProtocolCompatible } from '@/types/protocol'
import type { EventName, MethodName, WireMessage } from '@/types/protocol'

// HTTP/WS transport for the standalone meshdrop-host (Phase 2 web mode).
//
// Protocol frames travel exactly like Electron's bridge channel, but over the
// host's token-authed localhost API:
//   call()  → POST /rpc with { type:'request', v, id, method, params } and the
//             X-MeshDrop-Token header; the HTTP response body IS the protocol
//             response frame.
//   on()    → protocol event frames pushed by the host's broadcaster over
//             GET /events?t=<token> (WebSocket). The broadcaster sends every
//             event to every client, so a reconnect needs no re-subscription.
//
// The class is deliberately free of window/document access: lib/ipc.ts picks
// the browser defaults, while the Phase-2 acceptance script injects Node's
// global fetch/WebSocket (or the ws package) and drives a spawned host.

export const SESSION_EXPIRED_MESSAGE = 'Session expired — reopen MeshDrop from its launcher'

// ─── Web-session glue (browser only; the Node acceptance script injects its
// own baseUrl/token instead) ────────────────────────────────────────────────
// The launcher hands the session over as ?t= in the launch URL. Read once,
// persist for the life of the tab (sessionStorage dies with the tab, so a
// refresh keeps the session but a new tab re-requires the launcher URL), and
// strip it from the address bar.
export const SESSION_TOKEN_KEY = 'meshdrop_token'

/** Pure read of the session token: URL ?t= first, then sessionStorage. */
export function readSessionToken(): string {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return ''
  try {
    const url = new URL(window.location.href)
    const t = url.searchParams.get('t')
    if (t) return t
  } catch {
    /* malformed URL — fall through */
  }
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Read + persist + strip ?t= from the address bar. */
export function consumeUrlToken(): string {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return ''
  let token = ''
  try {
    const url = new URL(window.location.href)
    token = url.searchParams.get('t') ?? ''
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token)
    } else {
      token = sessionStorage.getItem(SESSION_TOKEN_KEY) ?? ''
    }
    if (url.searchParams.has('t')) {
      url.searchParams.delete('t')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    }
  } catch {
    try {
      token = sessionStorage.getItem(SESSION_TOKEN_KEY) ?? ''
    } catch {
      token = ''
    }
  }
  return token
}

/** Origin of the serving host (the page IS served by the host in web mode). */
export function locationBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  try {
    return `${window.location.protocol}//${window.location.host}`
  } catch {
    return ''
  }
}

export interface TransportSocket {
  onopen: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onerror: ((ev: unknown) => void) | null
  onclose: ((ev: unknown) => void) | null
  close: () => void
}

export interface HttpTransportOptions {
  /** Origin of the host API, e.g. "http://127.0.0.1:41990". */
  baseUrl: string
  /** Launcher-issued session token (URL ?t= or sessionStorage). */
  token: string
  fetchImpl?: typeof fetch
  /** Factory returning a socket with the minimal onopen/onmessage/… surface. */
  socketFactory?: (url: string) => TransportSocket
  log?: (...args: unknown[]) => void
  /** F06: connection-state feed for the UI — true when the WS is open, false
   * while it is down/reconnecting. Only the browser transport reports; the
   * Electron path has no HTTP transport. */
  onStatusChange?: (up: boolean) => void
}

type QueuedCall = {
  method: MethodName
  params: unknown
  resolve: (result: unknown) => void
  reject: (error: Error) => void
}

// Same chatter-suppression sets as the Electron bridge path in lib/ipc.ts.
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
  'connection.changed',
  'transfer.progress'
])

function defaultSocketFactory(url: string): TransportSocket {
  // Node >= 22 and browsers both expose a global WebSocket; it satisfies the
  // minimal socket surface structurally once cast (DOM Event vs unknown).
  const WS = (globalThis as { WebSocket?: new (u: string) => TransportSocket }).WebSocket
  if (!WS) throw new Error('No WebSocket implementation available')
  return new WS(url) as unknown as TransportSocket
}

function defaultFetch(): typeof fetch {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis)
  throw new Error('No fetch implementation available')
}

function formatLogArg(v: unknown): string {
  if (v === undefined || v === null) return String(v)
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

function parseFrame(raw: unknown): WireMessage | null {
  try {
    let parsed: unknown = raw
    if (typeof raw === 'string') {
      parsed = JSON.parse(raw)
    } else if (raw instanceof ArrayBuffer) {
      parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(raw)))
    } else {
      return null
    }
    if (parsed && typeof parsed === 'object') {
      const r = parsed as Record<string, unknown>
      if (r.type === 'response' || r.type === 'event') return parsed as WireMessage
    }
    return null
  } catch {
    return null
  }
}

export class HttpTransport {
  private readonly baseUrl: string
  private readonly token: string
  private readonly fetchImpl: typeof fetch
  private readonly socketFactory: (url: string) => TransportSocket
  private readonly log: (...args: unknown[]) => void
  private readonly onStatusChange?: (up: boolean) => void

  private listeners = new Map<string, Set<(data: unknown) => void>>()
  private queue: QueuedCall[] = []
  private nextId = 1

  private started = false
  private ready = false
  private destroyed = false
  private sessionExpired = false
  private readyPromise: Promise<void> | null = null

  private ws: TransportSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelayMs = 1000
  private forceFlushTimer: ReturnType<typeof setTimeout> | null = null
  // worker.ready delivery per socket open: the HOST broadcasts a genuine frame
  // when its engine boots, but a browser connecting to an ALREADY-RUNNING host
  // never sees it — pages (e.g. useDevices) wait on it to refresh. Emit a
  // synthetic one after a short grace window, never twice per open, and prefer
  // the genuine frame (it carries the identity payload).
  private syntheticReadyTimer: ReturnType<typeof setTimeout> | null = null
  private readyDelivered = false

  constructor(opts: HttpTransportOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.token = opts.token
    this.fetchImpl = opts.fetchImpl ?? defaultFetch()
    this.socketFactory = opts.socketFactory ?? defaultSocketFactory
    this.log = opts.log ?? ((...args: unknown[]) => console.log(...args))
    this.onStatusChange = opts.onStatusChange
  }

  private generateId(): string {
    return (this.nextId++).toString(36)
  }

  private ts(): string {
    return new Date().toISOString().slice(11, 23)
  }

  private flushQueue(): void {
    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      this.doCall(item.method, item.params).then(item.resolve).catch(item.reject)
    }
  }

  private rejectQueueAll(error: Error): void {
    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      item.reject(error)
    }
  }

  // Same per-method budget as the Electron path: large staging/claim calls get
  // 180 s, list/status/get probes 20 s, everything else 60 s.
  private timeoutFor(method: MethodName): number {
    const m = String(method)
    return m.startsWith('transfers.start') ||
      m.startsWith('transfers.resume') ||
      m.startsWith('files.createCode') ||
      m.startsWith('files.claimCode')
      ? 180000
      : m.endsWith('.list') ||
          m.endsWith('.status') ||
          m.endsWith('.get') ||
          m.endsWith('.getIdentity')
        ? 20000
        : 60000
  }

  private async doCall(method: MethodName, params?: unknown): Promise<unknown> {
    if (this.sessionExpired) {
      return Promise.reject(new Error(SESSION_EXPIRED_MESSAGE))
    }
    const m = String(method)
    const id = this.generateId()
    const isNoisy = NOISY_METHODS.has(m)
    if (!isNoisy) {
      this.log(`[IPC ${this.ts()}] >> ${id} ${m}`, ...(params !== undefined ? [formatLogArg(params)] : []))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutFor(method))
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MeshDrop-Token': this.token
        },
        body: JSON.stringify({ type: 'request', v: PROTOCOL_VERSION, id, method: m, params }),
        signal: controller.signal
      })
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        this.log(`[IPC ${this.ts()}] !! ${id} TIMEOUT ${m}`)
        return Promise.reject(new Error(`Request timed out: ${m}`))
      }
      const msg = (err as Error)?.message || String(err)
      this.log(`[IPC ${this.ts()}] !! ${id} NETWORK ${m}: ${msg}`)
      return Promise.reject(new Error(`Request failed: ${m} (${msg})`))
    } finally {
      clearTimeout(timer)
    }

    if (res.status === 403) {
      this.markSessionExpired()
      return Promise.reject(new Error(SESSION_EXPIRED_MESSAGE))
    }
    if (!res.ok) {
      const msg = `RPC failed (HTTP ${res.status}): ${m}`
      this.log(`[IPC ${this.ts()}] !! ${id} HTTP ${res.status} ${m}`)
      return Promise.reject(new Error(msg))
    }

    let frame: WireMessage | null = null
    try {
      frame = parseFrame(await res.text())
    } catch {
      frame = null
    }
    if (!frame || frame.type !== 'response') {
      return Promise.reject(new Error(`Malformed reply for ${m}`))
    }
    if (frame.error) {
      this.log(`[IPC ${this.ts()}] !! ${id} ERROR ${m}: ${frame.error}`)
      return Promise.reject(new Error(String(frame.error)))
    }
    if (!isNoisy) {
      this.log(`[IPC ${this.ts()}] << ${id} ${m}`, frame.result !== undefined ? formatLogArg(frame.result) : '')
    }
    return frame.result
  }

  private markSessionExpired(): void {
    if (this.sessionExpired) return
    this.sessionExpired = true
    this.log(`[IPC ${this.ts()}] !! SESSION EXPIRED — ${SESSION_EXPIRED_MESSAGE}`)
    this.closeSocket()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.rejectQueueAll(new Error(SESSION_EXPIRED_MESSAGE))
  }

  private emitLocal(event: EventName, data: unknown): void {
    const listeners = this.listeners.get(String(event))
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(data)
        } catch {
          /* swallow */
        }
      }
    }
  }

  private handleFrame(raw: unknown): void {
    const ts = this.ts()
    const msg = parseFrame(raw)
    if (!msg) {
      this.log(`[IPC ${ts}] ?? UNPARSEABLE`, formatLogArg(raw))
      return
    }
    if (!isProtocolCompatible(msg)) {
      this.log(`[IPC ${ts}] ?? UNSUPPORTED PROTOCOL VERSION ${String(msg.v)}`)
      return
    }
    if (msg.type !== 'event') return
    const event = String(msg.event)
    const isWorkerReady = event === (EVENTS.WORKER_READY as string)
    if (isWorkerReady) {
      if (!this.readyDelivered) {
        // Genuine frame won the race — cancel the pending synthetic.
        if (this.syntheticReadyTimer) {
          clearTimeout(this.syntheticReadyTimer)
          this.syntheticReadyTimer = null
        }
        this.readyDelivered = true
      } else {
        return // already delivered this open (synthetic or genuine) — no dups
      }
    }
    if (!NOISY_EVENTS.has(event)) {
      this.log(`[IPC ${ts}] >> EVENT ${event}`, formatLogArg(msg.data))
    }
    this.emitLocal(event, msg.data)
  }

  private connectSocket(): void {
    if (this.destroyed || this.sessionExpired || this.ws) return
    const wsUrl = `${this.baseUrl.replace(/^http/, 'ws')}/events?t=${encodeURIComponent(this.token)}`
    let socket: TransportSocket
    try {
      socket = this.socketFactory(wsUrl)
    } catch (err) {
      this.log(`[IPC ${this.ts()}] !! WS CONSTRUCT FAILED: ${(err as Error)?.message || String(err)}`)
      return
    }
    this.ws = socket

    socket.onopen = () => {
      this.reconnectDelayMs = 1000
      const wasReady = this.ready
      if (!wasReady) {
        this.ready = true
        this.flushQueue()
        if (this.forceFlushTimer) {
          clearTimeout(this.forceFlushTimer)
          this.forceFlushTimer = null
        }
      }
      this.readyDelivered = false
      this.syntheticReadyTimer = setTimeout(() => {
        this.syntheticReadyTimer = null
        if (!this.readyDelivered) {
          this.readyDelivered = true
          this.emitLocal(EVENTS.WORKER_READY as EventName, {})
        }
      }, 1500)
      this.onStatusChange?.(true)
    }
    socket.onmessage = (ev) => {
      if (typeof ev?.data === 'string' || ev?.data instanceof ArrayBuffer) this.handleFrame(ev.data)
    }
    socket.onerror = () => {
      // onclose drives the reconnect; a failed auth surfaces on HTTP calls.
    }
    socket.onclose = () => {
      this.ws = null
      if (this.destroyed || this.sessionExpired) return
      if (!this.ready) {
        // First connect never succeeded: keep waiting on the force-flush timer;
        // subsequent opens flush the queue.
        this.log(`[IPC ${this.ts()}] !! WS closed before ready — retrying in ${this.reconnectDelayMs} ms`)
      }
      this.onStatusChange?.(false)
      this.reconnectTimer = setTimeout(() => this.connectSocket(), this.reconnectDelayMs)
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 15000)
    }
  }

  private closeSocket(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.syntheticReadyTimer) {
      clearTimeout(this.syntheticReadyTimer)
      this.syntheticReadyTimer = null
    }
    if (this.ws) {
      const socket = this.ws
      this.ws = null
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      try {
        socket.close()
      } catch {
        /* already closed */
      }
    }
  }

  private async ensureVersion(): Promise<void> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}/version`, {
        headers: { 'X-MeshDrop-Token': this.token },
        signal: controller.signal
      })
    } catch (err) {
      throw new Error(`Cannot reach MeshDrop host: ${(err as Error)?.message || String(err)}`)
    } finally {
      clearTimeout(timer)
    }
    if (res.status === 403) {
      this.markSessionExpired()
      throw new Error(SESSION_EXPIRED_MESSAGE)
    }
    if (!res.ok) throw new Error(`Cannot reach MeshDrop host (HTTP ${res.status})`)
    try {
      const info = (await res.json()) as { engineVersion?: string; protocolVersion?: string }
      if (info.protocolVersion && info.protocolVersion !== PROTOCOL_VERSION) {
        this.log(
          `[IPC ${this.ts()}] !! PROTOCOL DRIFT — host ${info.protocolVersion} vs app ${PROTOCOL_VERSION}`
        )
      }
    } catch {
      // A malformed version body is not fatal; /rpc will surface real errors.
    }
  }

  /** Resolves when the host API answers /version and the WS is open. */
  ensureReady(): Promise<void> {
    if (this.destroyed) return Promise.reject(new Error('Transport destroyed'))
    if (this.readyPromise) return this.readyPromise
    this.started = true
    this.readyPromise = (async () => {
      await this.ensureVersion()
      this.connectSocket()
      // Mirror the Electron path's last-resort flush: if the WS never opens
      // (host event port closed?), queued calls should fail on their own
      // per-call timeouts rather than hang forever.
      if (!this.ready) {
        this.forceFlushTimer = setTimeout(() => {
          if (!this.ready && !this.destroyed) {
            this.ready = true
            this.flushQueue()
          }
        }, 60000)
      }
    })()
    return this.readyPromise
  }

  call(method: MethodName, params?: unknown): Promise<unknown> {
    if (!method || typeof method !== 'string') {
      return Promise.reject(new Error(`Invalid IPC method: ${String(method)}`))
    }
    if (this.sessionExpired) {
      return Promise.reject(new Error(SESSION_EXPIRED_MESSAGE))
    }
    if (this.destroyed) {
      return Promise.reject(new Error('Transport destroyed'))
    }
    if (!this.ready) {
      return new Promise((resolve, reject) => {
        this.queue.push({ method, params, resolve, reject })
        void this.ensureReady().catch(() => {
          // ensureReady failures surface per-call (queue flush / timeouts).
        })
      })
    }
    return this.doCall(method, params)
  }

  on(event: EventName, callback: (data: unknown) => void): () => void {
    const key = String(event)
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key)!.add(callback)
    return () => {
      this.listeners.get(key)?.delete(callback)
    }
  }

  off(event: EventName, callback: (data: unknown) => void): void {
    this.listeners.get(String(event))?.delete(callback)
  }

  destroy(): void {
    this.destroyed = true
    this.closeSocket()
    this.listeners.clear()
    this.rejectQueueAll(new Error('Transport destroyed'))
    this.readyPromise = null
    this.started = false
    this.ready = false
  }
}
