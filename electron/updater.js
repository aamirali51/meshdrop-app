'use strict'

// Auto-updater module.
//
// Two backends share ONE IPC surface (updater:check / updater:download /
// updater:quitAndInstall + updater:status broadcasts), so the renderer never
// cares which one is active:
//
//   - Installed (NSIS) builds use electron-updater against a GitHub Releases
//     feed (GH_UPDATE_OWNER / GH_UPDATE_REPO env vars; latest.yml assets are
//     produced by electron-builder on publish).
//
//   - Portable single-file builds CANNOT self-replace while running, so
//     electron-updater cannot update them. The portable backend implements
//     the full flow itself: detect (GitHub latest release) -> download with
//     progress -> integrity check (published sha256/sha512 if present, else
//     size + PE-header sanity) -> swap + relaunch via a detached .cmd helper
//     that waits for the app to exit, replaces the exe in place, and starts
//     it again. The exe keeps its original path, so shortcuts keep working.

const { app, ipcMain, shell } = require('electron')
const fs = (() => {
  try {
    return require('original-fs')
  } catch {
    return require('fs')
  }
})()
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const { Readable, Transform } = require('stream')
const { pipeline } = require('stream/promises')
const {
  compareVersions,
  createPortableSwapScript,
  createFolderSwapScript,
  verifyPortableSignature
} = require('./updater-util.js')
const portable = require('./portable.js')
const { extractZip } = require('./zip.js')

// GitHub Releases feed. CI sets GH_UPDATE_OWNER / GH_UPDATE_REPO explicitly;
// packaged builds launched normally have no such env vars, so fall back to
// package.json#repository. Without a feed the updater honestly reports
// "unconfigured" instead of erroring against a bogus endpoint.
function repoFromUrl(url) {
  const m = String(url || '').match(/(?:github\.com[:/])([^/]+)\/([^/]+?)(?:\.git)?$/)
  return m ? { owner: m[1], repo: m[2] } : null
}
const repo = repoFromUrl(require('../package.json').repository?.url)
const GH_OWNER = process.env.GH_UPDATE_OWNER || repo?.owner || ''
const GH_REPO = process.env.GH_UPDATE_REPO || repo?.repo || ''
const isFeedConfigured = Boolean(GH_OWNER && GH_REPO)

// Portable build detection: the single-file SFX stub (PORTABLE_EXECUTABLE_FILE)
// or folder mode (a `.portable` marker / `data/` sibling next to the real exe).
// The NSIS-installed build is neither and keeps the electron-updater path.
const isPortableBuild =
  process.platform === 'win32' &&
  app.isPackaged &&
  (Boolean(process.env.PORTABLE_EXECUTABLE_FILE) || portable.isFolderPortable())
const portableExePath = process.env.PORTABLE_EXECUTABLE_FILE || ''

let autoUpdater = null
try {
  autoUpdater = require('electron-updater').autoUpdater
} catch (err) {
  console.warn('[Main] Warning: electron-updater module could not be required:', err?.message)
}

let updateChannel = 'beta'
let downloadedUpdatePath = null
let portableDownloadedPath = null
let downloadStartedAt = 0
let version = ''
let currentSendToAll = () => {}

function broadcastUpdateStatus(sendToAll, data) {
  sendToAll('updater:status', data)
}

// ─── Portable backend ────────────────────────────────────────────────────────

let portableLatest = null // { version, assetUrl, assetName, assetSize }
let portableFetchPromise = null

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'meshdrop-updater' }
  })
  if (!res.ok) throw new Error(`Update feed error (HTTP ${res.status})`)
  return res.json()
}

// Resolve the latest release + its portable asset from GitHub. Single-flight
// so the startup auto-check and a manual check never race the API.
async function portableFetchLatest(force = false) {
  if (!force && portableLatest) return portableLatest
  if (portableFetchPromise) return portableFetchPromise
  portableFetchPromise = (async () => {
    let release
    if (updateChannel === 'stable') {
      release = await fetchJson(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/latest`
      )
    } else {
      const allReleases = await fetchJson(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases`
      )
      release = Array.isArray(allReleases) ? allReleases[0] : null
      if (!release) throw new Error('No releases found on GitHub')
    }
    const assets = Array.isArray(release.assets) ? release.assets : []
    // Folder portable updates from the ZIP (the app folder); the single-file
    // portable updates from the `*-portable.exe`. Both must ship `.sig` files.
    let asset
    if (portable.isFolderPortable()) {
      asset =
        assets.find((a) => /\.zip$/i.test(a.name) && /win/i.test(a.name)) ||
        assets.find((a) => /\.zip$/i.test(a.name))
      if (!asset) throw new Error('Latest release has no Windows zip (folder portable) asset')
    } else {
      asset =
        assets.find((a) => /portable\.exe$/i.test(a.name)) ||
        assets.find((a) => /\.exe$/i.test(a.name) && !/setup/i.test(a.name))
      if (!asset) throw new Error('Latest release has no portable build asset')
    }
    const nameVersion = (asset.name || '').match(/(\d+\.\d+(?:\.\d+)?)/)
    portableLatest = {
      version:
        String(release.tag_name || '').replace(/^v/i, '') || (nameVersion ? nameVersion[1] : asset.name),
      assetUrl: asset.browser_download_url,
      assetName: asset.name,
      assetSize: asset.size || 0
    }
    return portableLatest
  })().finally(() => {
    portableFetchPromise = null
  })
  return portableFetchPromise
}

async function portableCheckForUpdates(force = false) {
  if (!isFeedConfigured) {
    return { status: 'unconfigured', message: 'Updates are not configured for this build.' }
  }
  const latest = await portableFetchLatest(force)
  if (compareVersions(latest.version, version) <= 0) {
    return { status: 'up_to_date', version, message: 'Application is already up to date.' }
  }
  return {
    status: 'update_available',
    version: latest.version,
    message: `Update v${latest.version} is available!`
  }
}

// Fetch the `<asset>.sig` companion (ed25519 signature over the exe bytes).
// Releases MUST publish it; unsigned updates are refused (fail-closed).
async function fetchSignatureHex(assetUrl) {
  const res = await fetch(assetUrl + '.sig', {
    headers: { 'User-Agent': 'meshdrop-updater' }
  })
  if (!res.ok) return null
  const token = (await res.text()).trim()
  return /^[0-9a-f]{128}$/i.test(token) ? token.toLowerCase() : null
}

async function portableDownloadUpdate(sendToAll) {
  if (!isFeedConfigured) {
    return { status: 'unconfigured', message: 'Updates are not configured for this build.' }
  }
  const latest = await portableFetchLatest(false)
  if (compareVersions(latest.version, version) <= 0) {
    return { status: 'up_to_date', version, message: 'Application is already up to date.' }
  }

  // Stage on the SAME VOLUME as the app so the swap's `move` works (a move
  // across drives fails): beside the portable exe for sfx, beside the app
  // folder for folder mode. Folder mode downloads the signed ZIP and extracts
  // it here; sfx stages the single exe.
  const folderMode = portable.isFolderPortable()
  const appDirPath = path.dirname(process.execPath)
  const stagingDir = folderMode
    ? path.join(path.dirname(appDirPath), path.basename(appDirPath) + '.update')
    : path.join(path.dirname(portableExePath), '.meshdrop-update')
  fs.rmSync(stagingDir, { recursive: true, force: true })
  fs.mkdirSync(stagingDir, { recursive: true })
  const dest = folderMode
    ? path.join(stagingDir, 'update.zip')
    : path.join(stagingDir, latest.assetName || `meshdrop-${latest.version}-portable.exe`)
  const part = dest + '.part'
  fs.rmSync(part, { force: true })

  broadcastUpdateStatus(sendToAll, {
    status: 'downloading',
    percent: 0,
    bytesPerSecond: 0,
    transferred: 0,
    total: latest.assetSize,
    message: 'Downloading update... 0%'
  })

  const res = await fetch(latest.assetUrl, { headers: { 'User-Agent': 'meshdrop-updater' } })
  if (!res.ok || !res.body) throw new Error(`Update download failed (HTTP ${res.status})`)
  const total = Number(res.headers.get('content-length')) || latest.assetSize || 0
  let transferred = 0
  let lastReport = 0
  downloadStartedAt = Date.now()

  const counter = new Transform({
    transform(chunk, enc, cb) {
      transferred += chunk.length
      const now = Date.now()
      const percent = total ? Math.min(100, Math.round((transferred / total) * 100)) : 0
      // Throttle IPC chatter to ~5/s; always report the final chunk.
      if (now - lastReport > 200 || percent >= 100) {
        lastReport = now
        const elapsed = Math.max(1, (now - downloadStartedAt) / 1000)
        broadcastUpdateStatus(sendToAll, {
          status: 'downloading',
          percent,
          bytesPerSecond: Math.round(transferred / elapsed),
          transferred,
          total,
          message: `Downloading update... ${percent}%`
        })
      }
      cb(null, chunk)
    }
  })

  await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(part))

  // Integrity is MANDATORY: the artifact must carry a valid ed25519 signature
  // from the release key. No signature (or a mismatched one) means the update
  // is refused — a checksum over the same HTTPS channel would not stop a MITM,
  // and size/PE checks only catch corruption, not tampering.
  const signatureHex = await fetchSignatureHex(latest.assetUrl)
  if (!signatureHex) {
    fs.rmSync(part, { force: true })
    throw new Error(
      'Update is not signed (missing .sig asset). Publish the signature with the release.'
    )
  }
  if (!verifyPortableSignature(part, signatureHex)) {
    fs.rmSync(part, { force: true })
    throw new Error('Update signature verification FAILED — refusing to install.')
  }
  const verified = true

  fs.renameSync(part, dest)
  if (folderMode) {
    // Extract the signed zip into the staging dir, then drop the archive.
    extractZip(dest, stagingDir)
    fs.rmSync(dest, { force: true })
  }
  portableDownloadedPath = folderMode ? stagingDir : dest
  downloadedUpdatePath = portableDownloadedPath
  console.log(
    `[AutoUpdater] Portable update downloaded + signature verified: ${portableDownloadedPath}`
  )
  const message = `Update v${latest.version} ready! Restart to install.`
  broadcastUpdateStatus(sendToAll, { status: 'downloaded', version: latest.version, message })
  sendToAll('updater:downloaded', { version: latest.version, message, verified })
  return { status: 'downloaded', version: latest.version, message }
}

// Spawn a detached helper that applies the downloaded update once this process
// exits, then relaunches. Folder mode swaps the app directory (keeping
// `data/`); sfx swaps the single exe. The helper survives app.quit().
function portableQuitAndInstall() {
  const updatePath = portableDownloadedPath || downloadedUpdatePath
  if (!updatePath || !fs.existsSync(updatePath)) {
    broadcastUpdateStatus(currentSendToAll, {
      status: 'error',
      message: 'No downloaded update to install.'
    })
    return
  }
  if (portable.isFolderPortable()) {
    const appDirPath = path.dirname(process.execPath)
    const scriptPath = path.join(
      path.dirname(appDirPath),
      `meshdrop-folder-swap-${process.pid}.cmd`
    )
    fs.writeFileSync(
      scriptPath,
      createFolderSwapScript({
        pid: process.pid,
        appDir: appDirPath,
        updateDir: updatePath,
        exeName: path.basename(process.execPath)
      }),
      'utf8'
    )
    console.log(`[AutoUpdater] Folder swap helper: ${scriptPath}`)
    const child = spawn('cmd.exe', ['/c', scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.unref()
    app.quit()
    return
  }
  const newExe = updatePath
  const curExe = portableExePath || process.execPath
  const scriptPath = path.join(os.tmpdir(), 'meshdrop-update', `meshdrop-swap-${process.pid}.cmd`)
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true })
  fs.writeFileSync(scriptPath, createPortableSwapScript({ pid: process.pid, newExe, curExe }), 'utf8')
  console.log(`[AutoUpdater] Portable swap helper: ${scriptPath}`)
  const child = spawn('cmd.exe', ['/c', scriptPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  child.unref()
  app.quit()
}

// ─── Shared installer exit ───────────────────────────────────────────────────

function runInstallerAndQuit() {
  if (isPortableBuild) {
    portableQuitAndInstall()
    return
  }

  if (autoUpdater) {
    try {
      console.log('[AutoUpdater] Executing autoUpdater.quitAndInstall(false, true)')
      autoUpdater.quitAndInstall(false, true)
      return
    } catch (err) {
      console.warn('[AutoUpdater] autoUpdater.quitAndInstall failed:', err.message)
    }
  }

  if (downloadedUpdatePath && fs.existsSync(downloadedUpdatePath)) {
    try {
      console.log('[AutoUpdater] Opening installer via shell:', downloadedUpdatePath)
      shell.openPath(downloadedUpdatePath)
      app.quit()
      return
    } catch (err) {
      console.error('[AutoUpdater] Failed to open installer via shell:', err.message)
    }
  }

  app.quit()
}

// ─── Wiring ──────────────────────────────────────────────────────────────────

function setupPortableUpdater({ sendToAll, enabled, getAutoUpdate }) {
  if (!isFeedConfigured) {
    console.warn(
      '[AutoUpdater] GitHub update feed not configured — set GH_UPDATE_OWNER and GH_UPDATE_REPO'
    )
  }

  ipcMain.handle('updater:check', async () => {
    broadcastUpdateStatus(sendToAll, { status: 'checking', message: 'Checking for updates...' })
    try {
      const result = await portableCheckForUpdates(true) // manual checks always re-query
      broadcastUpdateStatus(sendToAll, result)
      return result
    } catch (err) {
      const fail = { status: 'error', message: err?.message || 'Check for updates failed.' }
      broadcastUpdateStatus(sendToAll, fail)
      return fail
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      return await portableDownloadUpdate(sendToAll)
    } catch (err) {
      const fail = { status: 'error', message: err?.message || 'Download failed.' }
      broadcastUpdateStatus(sendToAll, fail)
      return fail
    }
  })

  ipcMain.handle('updater:quitAndInstall', () => {
    runInstallerAndQuit()
  })
  ipcMain.handle('updater:restartAndInstall', () => {
    runInstallerAndQuit()
  })
  ipcMain.handle('app:afterUpdate', () => {
    runInstallerAndQuit()
  })

  // Channels are an electron-updater (NSIS) concept; report a stable default.
  ipcMain.handle('updater:getChannel', () => 'stable')
  ipcMain.handle('updater:setChannel', (evt, channel) => channel)

  // Auto flow on startup: detect, download in the background, then let the
  // renderer prompt "Restart now". Never force-quit mid-session. The download
  // only happens automatically when the user has "Auto-download updates" on.
  if (enabled && isFeedConfigured && app.isPackaged) {
    app.whenReady().then(() => {
      // Rollback proof: reaching this code means the current exe booted, so a
      // leftover <exe>.old from the last update swap is no longer needed.
      try {
        const backupExe = portableExePath ? portableExePath + '.old' : ''
        if (backupExe && fs.existsSync(backupExe)) {
          fs.rmSync(backupExe, { force: true })
          console.log('[AutoUpdater] Removed previous-version backup (current build is healthy)')
        }
      } catch (err) {
        console.warn('[AutoUpdater] Could not clean up previous-version backup:', err.message)
      }

      setTimeout(async () => {
        try {
          const result = await portableCheckForUpdates()
          broadcastUpdateStatus(sendToAll, result)
          const autoDownload = (await getAutoUpdate?.()) !== false
          if (result.status === 'update_available' && autoDownload) {
            console.log('[AutoUpdater] Portable update detected, downloading in background...')
            await portableDownloadUpdate(sendToAll)
          }
        } catch (err) {
          console.warn('[AutoUpdater] Background portable update failed:', err?.message || err)
        }
      }, 5000)
    })
  } else {
    console.log(
      `[AutoUpdater] Background update check skipped (${
        enabled ? 'feed unconfigured or dev/unpackaged' : 'disabled via --no-updates'
      })`
    )
  }
}

function setupUpdater({ sendToAll, version: appVersion, appName, enabled = true, getAutoUpdate }) {
  currentSendToAll = sendToAll
  version = appVersion

  if (isPortableBuild && app.isPackaged) {
    console.log('[AutoUpdater] Portable build detected — using the portable self-update flow')
    setupPortableUpdater({ sendToAll, enabled, getAutoUpdate })
    return
  }

  if (autoUpdater) {
    if (isFeedConfigured) {
      autoUpdater.setFeedURL({ provider: 'github', owner: GH_OWNER, repo: GH_REPO })
    } else {
      console.warn(
        '[AutoUpdater] GitHub update feed not configured — set GH_UPDATE_OWNER and GH_UPDATE_REPO'
      )
    }
    // NOTE: feed comes from setFeedURL above; autoDownload makes the
    // background check download silently with no user interaction.
    autoUpdater.autoDownload = true
    autoUpdater.allowPrerelease = true
    autoUpdater.allowDowngrade = false

    autoUpdater.on('checking-for-update', () => {
      console.log('[AutoUpdater] Checking for updates...')
      broadcastUpdateStatus(sendToAll, { status: 'checking', message: 'Checking for updates...' })
    })

    autoUpdater.on('update-available', (info) => {
      console.log('[AutoUpdater] Update available:', info.version)
      broadcastUpdateStatus(sendToAll, {
        status: 'update_available',
        version: info.version,
        releaseNotes: info.releaseNotes,
        message: `Update v${info.version} is available. Downloading in background...`
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      console.log('[AutoUpdater] Up to date:', info?.version || version)
      broadcastUpdateStatus(sendToAll, {
        status: 'up_to_date',
        version: info?.version || version,
        message: 'Application is already up to date.'
      })
    })

    autoUpdater.on('error', (err) => {
      console.error('[AutoUpdater] Error:', err?.message || err)
      broadcastUpdateStatus(sendToAll, {
        status: 'error',
        message: err?.message || 'Failed to check for updates'
      })
    })

    autoUpdater.on('download-progress', (progressObj) => {
      const percent = Math.round(progressObj.percent || 0)
      const speed = progressObj.bytesPerSecond || 0
      const transferred = progressObj.transferred || 0
      const total = progressObj.total || 0
      broadcastUpdateStatus(sendToAll, {
        status: 'downloading',
        percent,
        bytesPerSecond: speed,
        transferred,
        total,
        message: `Downloading update... ${percent}%`
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[AutoUpdater] Update downloaded:', info.version)
      downloadedUpdatePath = info?.downloadedFile || null
      broadcastUpdateStatus(sendToAll, {
        status: 'downloaded',
        version: info.version,
        message: `Update v${info.version} ready! Restart to install.`
      })
      // Non-intrusive renderer notification (UPDATE_DOWNLOADED): the UI shows
      // a toast with a "Restart Now" action — no blocking native dialog.
      sendToAll('updater:downloaded', {
        version: info.version,
        message: `Update v${info.version} ready! Restart to install.`
      })
    })
  }

  // Background update check on startup: non-blocking, silent background
  // download (autoDownload). Only meaningful in a packaged build with a
  // configured feed; --no-updates disables it entirely.
  if (enabled && isFeedConfigured && app.isPackaged && autoUpdater) {
    app.whenReady().then(() => {
      setTimeout(() => {
        console.log('[AutoUpdater] Background update check...')
        autoUpdater.checkForUpdates().catch((err) => {
          console.warn('[AutoUpdater] Background check failed:', err?.message || err)
        })
      }, 5000)
    })
  } else {
    console.log(
      `[AutoUpdater] Background update check skipped (${
        enabled ? 'feed unconfigured or dev/unpackaged' : 'disabled via --no-updates'
      })`
    )
  }

  ipcMain.handle('updater:check', async () => {
    if (!autoUpdater || !isFeedConfigured) {
      return { status: 'unconfigured', message: 'Updates are not configured for this build.' }
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result) {
        return { status: 'up_to_date', message: 'Application is already up to date.' }
      }
      const info = result.updateInfo
      if (info && info.version !== version) {
        return {
          status: 'update_available',
          version: info.version,
          message: `Update v${info.version} is available!`
        }
      }
      return { status: 'up_to_date', message: 'Application is already up to date.' }
    } catch (err) {
      console.error('[Main] Manual update check error:', err?.message)
      return { status: 'error', message: err?.message || 'Check for updates failed.' }
    }
  })

  ipcMain.handle('updater:download', async () => {
    if (!autoUpdater || !isFeedConfigured) {
      return { status: 'error', message: 'Updates are not configured for this build.' }
    }
    try {
      await autoUpdater.downloadUpdate()
      return { status: 'downloading', message: 'Download started...' }
    } catch (err) {
      return { status: 'error', message: err?.message || 'Download failed.' }
    }
  })

  ipcMain.handle('updater:quitAndInstall', () => {
    runInstallerAndQuit()
  })

  // RESTART_AND_INSTALL: renderer-triggered install (the toast's
  // "Restart Now" action and the Settings page button).
  ipcMain.handle('updater:restartAndInstall', () => {
    runInstallerAndQuit()
  })

  ipcMain.handle('updater:getChannel', () => updateChannel)

  ipcMain.handle('updater:setChannel', (evt, channel) => {
    if (['stable', 'beta', 'nightly'].includes(channel)) {
      updateChannel = channel
      if (autoUpdater) {
        autoUpdater.allowPrerelease = channel !== 'stable'
        if (channel === 'nightly') {
          autoUpdater.channel = 'nightly'
        } else if (channel === 'beta') {
          autoUpdater.channel = 'beta'
        } else {
          autoUpdater.channel = 'latest'
        }
      }
    }
    return updateChannel
  })

  ipcMain.handle('app:afterUpdate', () => {
    runInstallerAndQuit()
  })
}

module.exports = { setupUpdater }
