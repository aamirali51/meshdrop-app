// Store-free APK updater for MeshDrop Mobile.
//
// The app is NOT published to an app store. Updates ship as rebuilt APKs hosted
// (with a small latest.json manifest) on the GitHub Releases of the repo. On
// launch (and resume) we fetch the manifest, compare its versionCode against
// the running build, and if a newer version exists hand the downloaded APK to
// the Android system installer — no browser, no manual file management.
//
// Integrity is enforced two ways: the manifest sha256 is verified after the
// download, and Android itself refuses to install an APK whose signing key
// does not match the installed app (which is why the same release keystore must
// sign every release).
//
// This module keeps a tiny module-level store (mirroring src/store.ts) so the
// "Update available" UI can subscribe without introducing React context.

import { NativeModules, Platform } from 'react-native'
import RNFS from 'react-native-fs'

// The app source repo is private, so update ARTIFACTS live on the public
// `meshdrop-releases` repo. The `releases/latest/download/<asset>` path
// resolves to the newest release's asset, so no tag has to be hardcoded.
// Change these two constants if the mobile releases ever move to a new host.
export const UPDATE_OWNER = 'aamirali51'
export const UPDATE_REPO = 'meshdrop-releases'
export const UPDATE_MANIFEST_URL = `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest/download/latest.json`

export type UpdateInfo = {
  versionCode: number
  versionName: string
  url: string
  size?: number
  sha256?: string
  notes?: string
}

export type UpdatePhase = 'idle' | 'available' | 'downloading' | 'ready' | 'error'

export type UpdateState = {
  phase: UpdatePhase
  info: UpdateInfo | null
  progress: number // 0..100
  error: string
  // Running build version, for the header pill / Settings row.
  versionName: string | null
}

// All MeshDropUpdater methods are declared with a React Promise
// (see MeshDropUpdaterModule.kt), so they must be awaited — a trailing
// callback is never invoked, which hung the version read and the check.
type UpdaterNative = {
  getVersionCode?: () => Promise<number>
  getVersionName?: () => Promise<string>
  canInstallPackages?: () => Promise<boolean>
  openInstallSettings?: () => Promise<boolean>
  installApk?: (path: string) => Promise<boolean>
}

const native = (NativeModules.MeshDropUpdater ?? {}) as UpdaterNative

let state: UpdateState = {
  phase: 'idle',
  info: null,
  progress: 0,
  error: '',
  versionName: null,
}
const listeners = new Set<(s: UpdateState) => void>()

function setState(next: Partial<UpdateState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l(state))
}

export function getUpdateState(): UpdateState {
  return state
}

/** Subscribe to updater state. Returns an unsubscribe function. */
export function subscribeUpdate(fn: (s: UpdateState) => void): () => void {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}

export function isUpdaterSupported(): boolean {
  return Platform.OS === 'android' && !!native.getVersionCode && !!native.installApk
}

// A dead native bridge (or a missing method) must not hang the version read
// forever — that left the Settings version row stuck on "—".
const NATIVE_TIMEOUT_MS = 5000

function getVersionInfo(): Promise<{ versionCode: number; versionName: string }> {
  return new Promise((resolve, reject) => {
    if (!isUpdaterSupported()) return reject(new Error('Updater unsupported on this platform'))
    const timer = setTimeout(
      () => reject(new Error('Updater native call timed out')),
      NATIVE_TIMEOUT_MS
    )
    Promise.all([native.getVersionCode!(), native.getVersionName!()])
      .then(([code, name]) => {
        clearTimeout(timer)
        resolve({ versionCode: Number(code) || 0, versionName: String(name ?? '') })
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

/** Read the running app version once (used for the header pill / Settings). */
export async function refreshVersion(): Promise<string | null> {
  try {
    const v = await getVersionInfo()
    setState({ versionName: v.versionName })
    return v.versionName
  } catch {
    return null
  }
}

async function fetchManifest(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(UPDATE_MANIFEST_URL)
    if (!res.ok) {
      // Not silently "up to date": a failed feed fetch must be visible in the
      // logs, or an unreachable host looks identical to "no update".
      console.warn(`[updater] manifest fetch failed: HTTP ${res.status} (${UPDATE_MANIFEST_URL})`)
      return null
    }
    const data = await res.json()
    const versionCode = Number(data?.versionCode) || 0
    const versionName = String(data?.versionName ?? '')
    const url = String(data?.url ?? '')
    if (!versionCode || !versionName || !url) {
      console.warn('[updater] manifest missing required fields:', JSON.stringify(data))
      return null
    }
    return {
      versionCode,
      versionName,
      url,
      size: data?.size ? Number(data.size) : undefined,
      sha256: data?.sha256 ? String(data.sha256) : undefined,
      notes: data?.notes ? String(data.notes) : undefined,
    }
  } catch (err) {
    console.warn('[updater] manifest fetch threw:', String((err as Error)?.message || err))
    return null
  }
}

/**
 * Compare the hosted manifest against the running build. Returns the update if
 * a newer version exists, otherwise null. Never throws — a failed check just
 * means "no update" so it is safe to fire on every launch/resume.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isUpdaterSupported()) return null
  try {
    const info = await fetchManifest()
    if (!info) {
      setState({ phase: 'idle', info: null })
      return null
    }
    const local = await getVersionInfo()
    if (info.versionCode > local.versionCode) {
      setState({ phase: 'available', info })
      return info
    }
    setState({ phase: 'idle', info: null })
    return null
  } catch (err) {
    console.log('[updater] check failed:', String((err as Error)?.message || err))
    return null
  }
}

/** Download the APK to Downloads (cache as fallback) and verify its sha256. */
export async function downloadUpdate(
  info: UpdateInfo,
  onProgress?: (pct: number) => void
): Promise<string> {
  if (state.phase === 'downloading') return Promise.reject(new Error('Download already in progress'))
  setState({ phase: 'downloading', progress: 0 })
  const dest = `${
    RNFS.DownloadDirectoryPath || RNFS.CachesDirectoryPath
  }/meshdrop-${info.versionName}.apk`

  return new Promise<string>((resolve, reject) => {
    const job = RNFS.downloadFile({
      fromUrl: info.url,
      toFile: dest,
      progress: (r) => {
        const total = r.contentLength || 0
        const pct = total > 0 ? Math.round((r.bytesWritten / total) * 100) : 0
        setState({ progress: pct })
        onProgress?.(pct)
      },
    })
    job.promise
      .then(async () => {
        if (info.sha256) {
          const actual = await RNFS.hash(dest, 'sha256')
          if (actual.toLowerCase() !== info.sha256.toLowerCase()) {
            setState({ phase: 'error', error: 'Checksum mismatch — download may be corrupted' })
            return reject(new Error('sha256 mismatch'))
          }
        }
        setState({ phase: 'ready', progress: 100 })
        resolve(dest)
      })
      .catch((err) => {
        setState({ phase: 'error', error: String(err?.message || err) })
        reject(err)
      })
  })
}

/** Hand a downloaded APK to the system installer (ACTION_VIEW). */
export async function installApk(path: string): Promise<void> {
  if (!isUpdaterSupported()) throw new Error('Updater unsupported on this platform')
  await native.installApk!(path)
}

/** Whether the user has granted "install unknown apps" for MeshDrop. */
export async function canInstallPackages(): Promise<boolean> {
  if (!isUpdaterSupported()) return false
  return !!(await native.canInstallPackages?.())
}

/** Deep-link to the "Allow install unknown apps" setting. */
export async function openInstallSettings(): Promise<void> {
  if (!isUpdaterSupported()) return
  await native.openInstallSettings?.()
}

/** User chose "Later" — clear the prompt until the next launch/resume. */
export function dismissUpdate(): void {
  setState({ phase: 'idle', info: null })
}
