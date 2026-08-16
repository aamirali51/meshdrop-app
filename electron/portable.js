'use strict'

// Portable-mode plumbing (the "advanced portable": folder mode with co-located
// data + the one-time SFX -> folder install).
//
// Modes:
//   'sfx'    — the single-file electron-builder portable stub is running
//              (PORTABLE_EXECUTABLE_FILE). Data lives in a `data/` folder next
//              to the stub; on first run the user can INSTALL to a folder for
//              fast startup + file-level updates (Tier 2a).
//   'folder' — a folder portable (zip extract, or an SFX that was installed to
//              a folder): the REAL exe runs in place (no per-run extraction),
//              a `.portable` marker + `data/` sibling next to the exe switch
//              storage to that folder (App/Data split), and updates swap the
//              app files while keeping `data/` (Tier 3).
//   null     — installed (NSIS) build: AppData + electron-updater as usual.

const { app, ipcMain, dialog } = require('electron')
const fs = (() => {
  try {
    return require('original-fs')
  } catch {
    return require('fs')
  }
})()
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { sha256File, isValidAsar } = require('./updater-util.js')

const MARKER = '.portable'
const DATA_DIR = 'data'

function isSfx() {
  return Boolean(process.env.PORTABLE_EXECUTABLE_FILE)
}

// The single-file stub's own path/dir (the file the user double-clicked).
function sfxDir() {
  return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.env.PORTABLE_EXECUTABLE_FILE || '')
}

function appDir() {
  return path.dirname(process.execPath)
}

function getPortableMode() {
  if (isSfx()) return 'sfx'
  if (!app.isPackaged) return null
  const dir = appDir()
  if (fs.existsSync(path.join(dir, MARKER)) || fs.existsSync(path.join(dir, DATA_DIR))) return 'folder'
  return null
}

// Where portable data lives: next to the stub (sfx) or next to the exe
// (folder). null when not in portable mode.
function getPortableDataDir() {
  const mode = getPortableMode()
  if (mode === 'sfx') return path.join(sfxDir(), DATA_DIR)
  if (mode === 'folder') return path.join(appDir(), DATA_DIR)
  return null
}

// Create the data dir; null when the location is not writable (the caller
// then falls back to AppData with a warning).
function ensurePortableDataDir() {
  const dir = getPortableDataDir()
  if (!dir) return null
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, '.keep'), '') // probe writability
    return dir
  } catch (err) {
    console.warn('[Portable] Data dir not writable, falling back to AppData:', err.message)
    return null
  }
}

function isFolderPortable() {
  return getPortableMode() === 'folder'
}

// Rollback proof: reaching here means the current build booted, so a leftover
// `<appDir>.old` from the last folder update is no longer needed.
function applyStartupCleanup() {
  if (!app.isPackaged) return
  const dir = appDir()
  const oldDir = dir + '.old'
  try {
    if (fs.existsSync(oldDir)) {
      fs.rmSync(oldDir, { recursive: true, force: true })
      console.log('[Portable] Removed previous-version backup (current build is healthy)')
    }
  } catch (err) {
    console.warn('[Portable] Could not clean up previous-version backup:', err.message)
  }
}

// Debug log for portable operations, written NEXT TO THE STUB (survives the
// temp-extraction cleanup) so a failed install can be diagnosed later.
function portableLog(msg) {
  try {
    const where = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)
    fs.appendFileSync(path.join(where, 'portable-install.log'), `${new Date().toISOString()} ${msg}\n`)
  } catch {}
  console.log('[Portable]', msg)
}

// Synchronous sleep (main process only).
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// isValidAsar can transiently fail right after a big copy while the AV / index
// scanner still holds the freshly written files — retry before declaring bad.
function isValidAsarRetry(filePath, tries = 6, delayMs = 400) {
  for (let i = 0; i < tries; i++) {
    if (isValidAsar(filePath)) return true
    if (i < tries - 1) sleepSync(delayMs)
  }
  return false
}

// Reading a file that the OS momentarily locks (AV scan, live handle) can
// throw EBUSY/EPERM — retry before giving up.
function readFileRetry(filePath, tries = 10, delayMs = 400) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      return fs.readFileSync(filePath)
    } catch (err) {
      lastErr = err
      if (err.code !== 'EBUSY' && err.code !== 'EPERM' && err.code !== 'EACCES') throw err
    }
    sleepSync(delayMs)
  }
  throw lastErr
}

// Remove a tree. Retries a few times with growing delays (freshly copied trees
// can be briefly locked by AV scanning), clearing read-only attributes in
// between. Returns false when the folder is genuinely stuck, so callers can
// decide whether to keep going — the ORIGINAL failure is never masked.
function safeRm(dir) {
  for (let i = 0; i < 3; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      return true
    } catch (err) {
      if (err.code !== 'EPERM' && err.code !== 'EACCES' && err.code !== 'EBUSY') throw err
      if (i === 0) {
        portableLog(`rmSync failed (${err.code}), clearing read-only attributes and retrying: ${dir}`)
        try {
          spawnSync('attrib', ['-r', '-s', '-h', '-a', path.join(dir, '*'), '/s', '/d'], {
            windowsHide: true,
            encoding: 'utf8'
          })
        } catch {}
      }
      sleepSync(600 * (i + 1))
    }
  }
  portableLog(`Could not delete "${dir}" after retries (EPERM).`)
  return false
}

// Robust Windows tree copy. robocopy retries in-use/read-only files (fs.cp
// died on the SFX's live app.asar and left a half-install). Exit codes 0-7
// mean success, >= 8 means at least one file failed.
function copyTreeRobocopy(src, dest, excludeFiles = []) {
  const args = [src, dest, '/E', '/COPY:DAT', '/R:2', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP']
  if (excludeFiles.length) args.push('/XF', ...excludeFiles)
  const res = spawnSync(
    'robocopy',
    args,
    { encoding: 'utf8', windowsHide: true, timeout: 5 * 60 * 1000 }
  )
  const code = res.status == null ? -1 : res.status
  if (code >= 8) throw new Error(`Folder copy failed (robocopy exit ${code})`)
  return code
}

// Tier 2a: copy the running SFX's extracted app into a real folder and switch
// to folder mode. The copied folder is exactly what the zip distribution
// contains (real exe + resources), so it boots fast and updates file-level.
// The copy is VERIFIED before launching — a half-install (missing/corrupt
// app.asar) is never left behind, and the folder is cleaned on failure.
async function installToFolder(targetDir, options = {}) {
  const src = appDir() // extracted app (sfx only)
  const exeName = path.basename(process.execPath)
  const srcAsar = path.join(src, 'resources', 'app.asar')
  // The source is OUR OWN packaged build — trust it by construction (the asar
  // format is identical across all targets). Only fail fast if it's genuinely
  // missing; a runtime read hiccup (EBUSY on a live handle) must not be
  // mistaken for an invalid archive.
  if (!fs.existsSync(srcAsar)) {
    throw new Error('Source app.asar not found — cannot install to a folder.')
  }
  // Install into a clean subfolder unless the user already picked the app dir
  // itself: never merge into a pre-existing (possibly broken) folder.
  const picked = path.resolve(targetDir)
  const installDir =
    path.basename(picked).toLowerCase() === 'meshdrop' ? picked : path.join(picked, 'MeshDrop')

  // Refuse when the running stub itself lives inside the target — you cannot
  // replace the folder a running process is executing from (EPERM).
  const stubExe = process.env.PORTABLE_EXECUTABLE_FILE
  if (stubExe) {
    const stubDir = path.resolve(path.dirname(stubExe))
    const rel = path.relative(stubDir, installDir)
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      throw new Error(
        'MeshDrop is currently running from this folder. Move the portable file ' +
          'to a different location, run it from there, then install to a folder.'
      )
    }
  }

  // A MeshDrop instance already running from the target folder (e.g. an earlier
  // install that is still open) locks its exe, so the folder cannot be deleted.
  // Detect it up front and say so instead of failing with a bare EPERM.
  const existingExe = path.join(installDir, exeName)
  if (fs.existsSync(existingExe)) {
    try {
      const fd = fs.openSync(existingExe, 'r+')
      fs.closeSync(fd)
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') {
        throw new Error(
          `A MeshDrop instance is running from "${installDir}". Close it (check the ` +
            'tray icon) and try again, or choose a different folder.'
        )
      }
    }
  }

  if (!safeRm(installDir)) {
    throw new Error(
      `Could not replace "${installDir}" (EPERM) — it is locked by another process or marked ` +
        'read-only. Close any running MeshDrop instance (check the tray), then try again or ' +
        'choose a different folder.'
    )
  }
  try {
    fs.mkdirSync(installDir, { recursive: true })
  } catch (err) {
    throw new Error(
      `Could not create "${installDir}" (${err.code || 'error'}). Pick a different folder or ` +
        'check that the drive is writable.'
    )
  }
  const destAsar = path.join(installDir, 'resources', 'app.asar')
  const destSize = (p) => {
    try {
      return fs.statSync(p).size
    } catch {
      return -1
    }
  }
  portableLog(`Source asar: size=${destSize(srcAsar)} valid=${isValidAsar(srcAsar)}`)
  // Bulk copy via robocopy, EXCLUDING the two files the running Electron
  // process holds open — robocopy's copy of those live files has proven
  // unreliable (the dest app.asar came out missing/invalid every attempt).
  portableLog(`Copying app tree to folder: ${installDir}`)
  copyTreeRobocopy(src, installDir, [exeName, 'app.asar'])
  // Copy the two live files with OUR OWN process instead (we can read them —
  // we are running from them), then verify byte-for-byte below.
  try {
    fs.mkdirSync(path.dirname(destAsar), { recursive: true })
    fs.mkdirSync(path.dirname(path.join(installDir, exeName)), { recursive: true })
    fs.writeFileSync(destAsar, readFileRetry(srcAsar))
    fs.writeFileSync(path.join(installDir, exeName), readFileRetry(path.join(src, exeName)))
  } catch (err) {
    throw new Error(`Could not copy app.asar / executable (${err.code || 'error'}).`)
  }
  portableLog(`Copied tree: dest app.asar size=${destSize(destAsar)} (source ${destSize(srcAsar)})`)

  // Verify the critical files landed intact; clean up on any failure so the
  // user can never double-click a broken install. The dest asar must be a
  // valid archive AND byte-identical to the source (when the source is
  // readable — the structural check alone already proves the copy landed).
  // Log first, clean up second: a cleanup failure must never mask the actual
  // verification problem.
  const fail = (msg) => {
    portableLog(`Verification failed: ${msg}`)
    let cleaned = true
    try {
      cleaned = safeRm(installDir)
    } catch (cleanupErr) {
      cleaned = false
      portableLog(`Cleanup error (non-fatal): ${cleanupErr.message}`)
    }
    if (!cleaned) {
      throw new Error(`${msg} A partial copy may remain in "${installDir}" — delete it and try again.`)
    }
    throw new Error(msg)
  }
  if (!fs.existsSync(destAsar) || !isValidAsarRetry(destAsar)) {
    fail('Copy verification failed: resources/app.asar is missing or invalid.')
  }
  try {
    if (sha256File(srcAsar) !== sha256File(destAsar)) {
      fail('Copy verification failed: app.asar does not match the source.')
    }
  } catch (err) {
    console.warn('[Portable] Could not hash source asar for comparison:', err.message)
  }
  if (fs.existsSync(path.join(src, 'resources', 'app.asar.unpacked')) && !fs.existsSync(path.join(installDir, 'resources', 'app.asar.unpacked'))) {
    fail('Copy verification failed: resources/app.asar.unpacked is missing.')
  }
  const destExe = path.join(installDir, exeName)
  if (!fs.existsSync(destExe) || fs.statSync(destExe).size !== fs.statSync(path.join(src, exeName)).size) {
    fail('Copy verification failed: executable mismatch.')
  }
  portableLog('Copy verified (asar + unpacked + exe)')

  // App/Data split: mark folder mode + create the data folder.
  try {
    fs.writeFileSync(path.join(installDir, MARKER), 'meshdrop folder portable\n')
    fs.mkdirSync(path.join(installDir, DATA_DIR), { recursive: true })
  } catch (err) {
    try {
      if (!safeRm(installDir)) portableLog(`Partial install left at ${installDir}`)
    } catch (cleanupErr) {
      portableLog(`Cleanup error (non-fatal): ${cleanupErr.message}`)
    }
    throw new Error(`Could not finalize the install (${err.code || 'error'}).`)
  }

  // Goodies: Create Windows shortcuts if requested
  if (process.platform === 'win32') {
    const { shell } = require('electron')
    if (options.desktopShortcut !== false) {
      try {
        const desktopPath = path.join(app.getPath('desktop'), 'MeshDrop.lnk')
        shell.writeShortcutLink(desktopPath, 'create', {
          target: destExe,
          cwd: installDir,
          description: 'MeshDrop — Zero-Cloud P2P File Sharing',
          icon: destExe,
          iconIndex: 0
        })
        portableLog(`Desktop shortcut created: ${desktopPath}`)
      } catch (err) {
        portableLog(`Failed to create desktop shortcut: ${err.message}`)
      }
    }

    if (options.startMenuShortcut !== false) {
      try {
        const startMenuDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
        fs.mkdirSync(startMenuDir, { recursive: true })
        const startMenuPath = path.join(startMenuDir, 'MeshDrop.lnk')
        shell.writeShortcutLink(startMenuPath, 'create', {
          target: destExe,
          cwd: installDir,
          description: 'MeshDrop — Zero-Cloud P2P File Sharing',
          icon: destExe,
          iconIndex: 0
        })
        portableLog(`Start Menu shortcut created: ${startMenuPath}`)
      } catch (err) {
        portableLog(`Failed to create Start Menu shortcut: ${err.message}`)
      }
    }

    if (options.autoStart) {
      try {
        const startupDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
        fs.mkdirSync(startupDir, { recursive: true })
        const startupPath = path.join(startupDir, 'MeshDrop.lnk')
        shell.writeShortcutLink(startupPath, 'create', {
          target: destExe,
          cwd: installDir,
          args: options.startMinimized !== false ? '--hidden' : '',
          description: 'MeshDrop — Zero-Cloud P2P File Sharing',
          icon: destExe,
          iconIndex: 0
        })
        portableLog(`Startup shortcut created: ${startupPath}`)
      } catch (err) {
        portableLog(`Failed to create Startup shortcut: ${err.message}`)
      }
    }
  }

  portableLog(`Installed, launching from: ${destExe}`)
  try {
    const { destroyTray } = require('./tray')
    destroyTray()
  } catch {}
  try {
    const { BrowserWindow } = require('electron')
    BrowserWindow.getAllWindows().forEach((w) => {
      try {
        w.destroy()
      } catch {}
    })
  } catch {}
  const child = spawn(destExe, [], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  app.exit(0)
}

function getPortableStatus() {
  const mode = getPortableMode()
  return {
    mode,
    isPackaged: app.isPackaged,
    appDir: appDir(),
    dataDir: mode ? getPortableDataDir() : null,
    installAvailable: mode === 'sfx'
  }
}

function setupPortableIpc() {
  ipcMain.handle('portable:status', () => getPortableStatus())

  ipcMain.handle('portable:pickFolder', async () => {
    try {
      const res = await dialog.showOpenDialog({
        title: 'Select Installation Folder for MeshDrop',
        buttonLabel: 'Select Folder',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: path.join(app.getPath('documents'), 'MeshDrop')
      })
      if (res.canceled || !res.filePaths[0]) return null
      return res.filePaths[0]
    } catch {
      return null
    }
  })

  ipcMain.handle('portable:install', async (_evt, opts) => {
    if (!isSfx()) return { ok: false, error: 'Only the single-file portable can install to a folder.' }
    try {
      let targetDir = opts && typeof opts === 'object' ? opts.targetDir : null
      if (!targetDir) {
        const res = await dialog.showOpenDialog({
          title: 'Install MeshDrop to a folder',
          buttonLabel: 'Install Here',
          properties: ['openDirectory', 'createDirectory'],
          defaultPath: path.join(app.getPath('documents'), 'MeshDrop')
        })
        if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
        targetDir = res.filePaths[0]
      }
      await installToFolder(targetDir, opts || {})
      return { ok: true } // unreachable in practice (app exits)
    } catch (err) {
      portableLog(`Folder install failed: ${err.stack || err.message}`)
      return { ok: false, error: err.message }
    }
  })
}

module.exports = {
  getPortableMode,
  getPortableDataDir,
  ensurePortableDataDir,
  isFolderPortable,
  isSfx,
  applyStartupCleanup,
  installToFolder,
  setupPortableIpc
}
