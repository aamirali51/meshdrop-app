import type {
  Bridge,
  DialogResult,
  PortableInstallResult,
  PortableStatus,
  UpdateStatusData
} from '@/types/bridge'
import { SESSION_EXPIRED_MESSAGE, locationBaseUrl, readSessionToken } from './httpTransport'

// capabilities.ts — the ONE place that answers "what can this environment do?"
//
// Every renderer feature that touches OS integration (dialogs, shell, tray,
// updates, window chrome, deep links) asks this module instead of reaching for
// window.bridge. Detection happens once at load:
//   - mode 'electron' → window.bridge exists (preload) — native behavior,
//     100% unchanged.
//   - mode 'web'      → plain browser page served by the meshdrop-host. The
//     engine lives in the host; every native surface is either emulated over
//     the host's browser-bridge HTTP endpoints (/import, /fs/drives, /fs/list,
//     /files/download) or hidden.

const isElectronEnv =
  typeof window !== 'undefined' && typeof (window as { bridge?: unknown }).bridge !== 'undefined'
    ? Boolean((window as { bridge?: Bridge }).bridge)
    : false

export type MeshDropMode = 'electron' | 'web'

export const mode: MeshDropMode = isElectronEnv ? 'electron' : 'web'
export const isElectron = mode === 'electron'
export const isWeb = mode === 'web'

const bridge: Bridge | undefined = isElectronEnv ? (window as { bridge: Bridge }).bridge : undefined

export const platform: string | undefined = isElectronEnv ? bridge?.platform : undefined
export const isMac = isElectron && platform === 'darwin'

/** True when the browser page holds a session token for the host. */
export function hasSessionToken(): boolean {
  return isElectron || readSessionToken().length > 0
}

/**
 * What this environment can do. Electron: everything, exactly as today.
 * Web: the subset a plain browser + host pair can serve.
 */
export const capabilities = {
  mode,
  platform,
  isElectron,
  isWeb,

  /** OS-native open/save dialogs. */
  nativeDialogs: isElectron,
  /** Choosing a folder the engine can actually read (native dialog or host picker). */
  engineFolderPicker: true,
  /** Clipboard writes. */
  clipboard: true,
  /** Opening external URLs. */
  shellOpen: true,
  /** Revealing a file in the OS file manager. */
  showInFolder: isElectron,
  /** OTA updates UI + flow. */
  updates: isElectron,
  /** Portable-mode (single-file/folder) install UI. */
  portable: isElectron,
  /** OS boot integration (launch at startup). */
  autostart: isElectron,
  /** Explorer/finder context-menu integration. */
  contextMenu: isElectron,
  /** System tray + minimize-to-tray. */
  tray: isElectron,
  /** Custom window chrome (frameless desktop frame). */
  windowControls: isElectron && platform !== 'darwin',
  /** Incoming link/code handling (OS protocol handler / ?code= launch URL). */
  deepLinks: true
} as const

// ─── Web-mode HTTP helpers ──────────────────────────────────────────────────

function webFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      'X-MeshDrop-Token': readSessionToken()
    }
  })
}

/** Staging upload (POST /import) via XHR — see fileToPath for why not fetch. */
function httpUpload(url: string, file: File): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('X-MeshDrop-Token', readSessionToken())
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText })
    xhr.onerror = () => reject(new Error('Import upload failed — is the host still running?'))
    xhr.send(file)
  })
}

/** Host-origin download URL (token travels as ?t= — the same channel the WS
 * upgrade uses, since an <a download> cannot attach headers). */
export function downloadUrl(id: string): string {
  const base = locationBaseUrl()
  return `${base}/files/download?id=${encodeURIComponent(id)}&t=${encodeURIComponent(readSessionToken())}`
}

export interface HostVersionInfo {
  engineVersion?: string
  protocolVersion?: string
}

/** Live engine/protocol versions from the host (/version) — web-mode About. */
export async function hostVersionInfo(): Promise<HostVersionInfo> {
  const res = await webFetch(`${locationBaseUrl()}/version`)
  if (res.status === 403) throw new Error(SESSION_EXPIRED_MESSAGE)
  if (!res.ok) throw new Error(`Cannot reach MeshDrop host (HTTP ${res.status})`)
  const info = (await res.json()) as HostVersionInfo
  return info
}

// ─── File pickers ──────────────────────────────────────────────────────────
// Electron: native dialogs return real absolute paths the engine reads
// directly. Web: the file lives in the BROWSER, so each picked/dropped file is
// streamed to the host's staging area via POST /import first — the returned
// path is then fed into the exact same transfers.start / files.createCode /
// watch.createRoom calls, unchanged. One implementation for picked AND
// dropped files: fileToPath().

/** Electron: real path; web: imported into host staging. */
export async function fileToPath(file: File): Promise<string> {
  if (isElectronEnv && bridge?.getPathForFile) {
    const p = bridge.getPathForFile(file)
    if (!p) throw new Error('Could not resolve the dropped file path')
    return p
  }
  // fetch() cannot upload a streaming body to the host from Chrome
  // (ERR_ALPN_NEGOTIATION_FAILED — Chromium network-layer quirk on duplex
  // requests against plain-HTTP/1.1 localhost). XHR sends the File with a
  // known Content-Length; disk-backed files still stream from disk.
  const { status, body } = await httpUpload(
    `${locationBaseUrl()}/import?name=${encodeURIComponent(file.name)}&size=${encodeURIComponent(
      String(file.size)
    )}`,
    file
  )
  if (status === 403) throw new Error(SESSION_EXPIRED_MESSAGE)
  if (status === 413) throw new Error('File exceeds the host import limit')
  if (status !== 200 && status !== 201) {
    let detail = ''
    try {
      detail = (JSON.parse(body) as { error?: string }).error || ''
    } catch {
      /* keep generic message */
    }
    throw new Error(detail || `Import failed (HTTP ${status})`)
  }
  const staged = JSON.parse(body) as { path: string }
  return staged.path
}

export type PickedFile = DialogResult

async function importFiles(files: File[]): Promise<PickedFile[]> {
  const picked: PickedFile[] = []
  for (const f of files) {
    picked.push({
      filePath: await fileToPath(f),
      filename: f.name,
      fileSize: f.size
    })
  }
  return picked
}

/** Shared by dropzones AND pickers: File[] → engine-readable paths.
 * Mirrors Electron's drop mapping: files that fail to resolve are skipped
 * (dropped silently), and only an all-failed drop rejects. */
export async function resolveDrop(files: Iterable<File>): Promise<PickedFile[]> {
  const picked: PickedFile[] = []
  let firstErr: Error | null = null
  for (const f of Array.from(files)) {
    try {
      picked.push({
        filePath: await fileToPath(f),
        filename: f.name,
        fileSize: f.size
      })
    } catch (err) {
      if (!firstErr) firstErr = err as Error
    }
  }
  if (!picked.length && firstErr) throw firstErr
  return picked
}

/** Web-mode file input. Resolves null when the user cancels. */
function inputPickFiles(multiple: boolean): Promise<PickedFile[] | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (multiple) input.multiple = true
    input.style.display = 'none'
    document.body.appendChild(input)

    let settled = false
    // Once the dialog has handed us a selection, the staging upload that
    // follows owns the outcome. It can take far longer than any fixed window
    // (a 4K file runs to tens of GB), so nothing about focus may cancel a
    // pick that already produced files.
    let sawChange = false
    const cleanup = () => {
      window.removeEventListener('focus', onWindowFocus)
      input.remove()
    }
    const finish = (result: PickedFile[] | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }
    const fail = (err: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }
    const onWindowFocus = () => {
      // Focus returns when the dialog closes. Without a change event the user
      // cancelled; the short delay lets a change event that is already in
      // flight land first. Browsers that fire `cancel` never need this path.
      window.setTimeout(() => {
        if (sawChange) return
        finish(null)
      }, 400)
    }
    input.addEventListener('change', () => {
      sawChange = true
      const files = Array.from(input.files || [])
      if (!files.length) {
        finish(null)
        return
      }
      importFiles(files).then((picked) => finish(picked.length ? picked : null), fail)
    })
    input.addEventListener('cancel', () => finish(null))
    window.addEventListener('focus', onWindowFocus)
    // Browsers only open the dialog from a user gesture.
    input.click()
  })
}

/** One file (native dialog / single-selection browser input). */
export async function pickFile(): Promise<PickedFile | null> {
  if (isElectronEnv) return bridge?.openFileDialog() ?? null
  const picked = await inputPickFiles(false)
  return picked && picked.length > 0 ? picked[0] : null
}

/** Multiple files. */
export async function pickFiles(): Promise<PickedFile[] | null> {
  if (isElectronEnv) return bridge?.openFilesDialog() ?? null
  return inputPickFiles(true)
}

/**
 * A folder the engine can read. Electron: native OS dialog (desktop app only).
 * Web: the in-app FolderPickerModal, which walks the HOST's real drives
 * (/fs/drives + /fs/list) and returns the absolute path chosen there. A
 * browser page never asks the host to open an OS dialog — the host exposes no
 * such endpoint (see bridge.js), so this is the only folder path in web mode.
 */
export async function pickFolder(defaultPath?: string): Promise<string | null> {
  if (isElectronEnv) return bridge?.openFolderDialog() ?? null
  const { pickHostFolder } = await import('@/components/FolderPickerModal')
  return pickHostFolder()
}

// ─── Shell / clipboard ──────────────────────────────────────────────────────

/** https: anywhere; http: loopback only (host gateway URLs). */
export function openExternal(url: string): Promise<void> {
  if (isElectronEnv) return bridge?.openExternal(url) ?? Promise.resolve()
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return Promise.resolve()
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsed.hostname)
  if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && loopback)) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  return Promise.resolve()
}

export async function openPath(filePath: string): Promise<{ error?: string; success?: boolean }> {
  if (isElectronEnv) {
    const res = await bridge?.openPath(filePath)
    return res ?? { error: 'Could not open path' }
  }
  return { error: 'Opening folders is only available in the desktop app' }
}

export function showItemInFolder(filePath: string): void {
  if (isElectronEnv) bridge?.showItemInFolder(filePath)
}

/** Electron bridge + navigator.clipboard with a legacy textarea fallback. */
export async function writeClipboard(text: string): Promise<void> {
  if (isElectronEnv) {
    await bridge?.writeClipboard({ text })
    return
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return
    }
    throw new Error('no async clipboard')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

// ─── App version (About page) ───────────────────────────────────────────────

/** Packaged app version (Electron pkg()); '' in a bare browser. */
export function appVersion(): string {
  try {
    if (!isElectronEnv) return ''
    const v = bridge?.pkg?.()?.version
    return typeof v === 'string' && v ? v : ''
  } catch {
    return ''
  }
}

// ─── Deep links / quick send / tray (event subscriptions) ──────────────────

export interface DeepLinkData {
  url?: string
  code?: string | null
  kind?: string
}

export interface QuickSendData {
  peerId?: string | null
  files: { filePath: string; filename: string; fileSize: number; isDirectory?: boolean }[]
}

/** Electron: OS protocol-handler links. Web: a launch URL's ?code= param. */
export function onDeepLink(callback: (data: DeepLinkData) => void): () => void {
  if (isElectronEnv) return bridge?.onDeepLink(callback) ?? (() => {})
  webDeepLinkListeners.add(callback)
  maybeQueueWebDeepLink()
  return () => {
    webDeepLinkListeners.delete(callback)
  }
}

// Web deep links (?code= in the launch URL). The parameter is read once and
// stripped on the FIRST subscription; delivery is queued until the session
// transport is ready (the WS/RPC session a claim needs) and then fanned out to
// EVERY subscriber — multiple hooks route different code families (DROP →
// receive modal, SITE → visit), so one code must reach them all, and it must
// never fire before boot-time subscribers are registered or before the
// transport can answer the claim.
const webDeepLinkListeners = new Set<(data: DeepLinkData) => void>()
let webDeepLinkPending: DeepLinkData | null = null
let webDeepLinkScheduled = false

function readWebDeepLinkOnce(): DeepLinkData | null {
  if (webDeepLinkPending) return webDeepLinkPending
  try {
    const url = new URL(window.location.href)
    const raw = url.searchParams.get('code')
    if (!raw) return null
    url.searchParams.delete('code')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    webDeepLinkPending = {
      url: window.location.href,
      code: decodeURIComponent(raw),
      kind: 'url'
    }
  } catch {
    /* malformed URL — no code */
  }
  return webDeepLinkPending
}

function maybeQueueWebDeepLink(): void {
  if (webDeepLinkScheduled || !readWebDeepLinkOnce()) return
  webDeepLinkScheduled = true
  // Wait for the session transport (like the Electron path waits for the
  // worker's ready event), then deliver on a macrotask so every subscriber
  // that mounts during bootstrap has registered. A ready-failure must not
  // strand the code silently: still deliver once the queue settles.
  void import('@/lib/ipc')
    .then((m) => m.ensureReady().catch(() => {}))
    .then(() => {
      window.setTimeout(() => {
        const pending = webDeepLinkPending
        webDeepLinkPending = null
        if (!pending) return
        for (const cb of [...webDeepLinkListeners]) {
          try {
            cb(pending)
          } catch {
            /* subscriber errors must not escape */
          }
        }
      }, 0)
    })
}

export function onQuickSend(callback: (data: QuickSendData) => void): () => void {
  if (isElectronEnv) return bridge?.onQuickSend?.(callback) ?? (() => {})
  return () => {}
}

export function onTrayHidden(callback: () => void): () => void {
  if (isElectronEnv) return bridge?.onTrayHidden?.(callback) ?? (() => {})
  return () => {}
}

// ─── Window chrome (frameless desktop frame) ────────────────────────────────

export function windowMinimize(): void {
  bridge?.minimizeWindow()
}
export function windowToggleMaximize(): void {
  bridge?.toggleMaximizeWindow()
}
export function windowClose(): void {
  bridge?.closeWindow()
}
export function isWindowMaximized(): Promise<boolean> {
  if (!isElectronEnv) return Promise.resolve(false)
  return bridge?.isWindowMaximized() ?? Promise.resolve(false)
}
export function onWindowMaximized(callback: (maximized: boolean) => void): () => void {
  if (!isElectronEnv) return () => {}
  return bridge?.onWindowMaximized(callback) ?? (() => {})
}

// ─── Updater / portable (Electron-only surfaces; web stubs are unreachable
// because the UI sections are hidden behind capabilities.updates/portable) ──

export async function checkForUpdates(): Promise<{ status: string; message: string; version?: string }> {
  if (!isElectronEnv) throw new Error('Updates are only available in the desktop app')
  return bridge?.checkForUpdates() ?? { status: 'error', message: 'Update check unavailable' }
}
export async function downloadUpdate(): Promise<{ status: string; message: string }> {
  if (!isElectronEnv) throw new Error('Updates are only available in the desktop app')
  return bridge?.downloadUpdate() ?? { status: 'error', message: 'Update download unavailable' }
}
export async function quitAndInstall(): Promise<void> {
  if (!isElectronEnv) throw new Error('Updates are only available in the desktop app')
  return bridge?.quitAndInstall()
}
export async function restartAndInstall(): Promise<void> {
  if (!isElectronEnv) throw new Error('Updates are only available in the desktop app')
  return bridge?.restartAndInstall()
}
export function setUpdateChannel(channel: 'stable' | 'beta' | 'nightly' | 'dev'): Promise<string> {
  if (!isElectronEnv) return Promise.resolve(channel)
  return bridge?.setUpdateChannel(channel) ?? Promise.resolve(channel)
}
export function onUpdateStatus(callback: (data: UpdateStatusData) => void): () => void {
  if (!isElectronEnv) return () => {}
  return bridge?.onUpdateStatus(callback) ?? (() => {})
}
export function onUpdateDownloaded(
  callback: (data: { version?: string; message?: string }) => void
): () => void {
  if (!isElectronEnv) return () => {}
  return bridge?.onUpdateDownloaded(callback) ?? (() => {})
}
export function portableStatus(): Promise<PortableStatus | null> {
  if (!isElectronEnv) return Promise.resolve(null)
  return bridge?.portableStatus() ?? Promise.resolve(null)
}
export async function portablePickFolder(): Promise<string | null> {
  if (!isElectronEnv) return null
  return bridge?.portablePickFolder() ?? null
}
export async function portableInstall(options?: {
  targetDir?: string
  desktopShortcut?: boolean
  startMenuShortcut?: boolean
  autoStart?: boolean
}): Promise<PortableInstallResult> {
  if (!isElectronEnv) return { ok: false, error: 'Portable mode is only available in the desktop app' }
  return bridge?.portableInstall(options) ?? { ok: false, error: 'Install unavailable' }
}
export async function setContextMenuEnabled(enabled: boolean): Promise<boolean> {
  if (!isElectronEnv) return enabled
  return bridge?.setContextMenuEnabled?.(enabled) ?? enabled
}
