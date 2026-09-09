'use strict'

// Electron-side face of the shared WebDAV/stream server (Phase 1b).
//
// The HTTP server core (routes, token gate, 206 range streaming, coverage
// gates, /p2p DAV verbs) now lives in
// src/shared/localservers/stream-server.js, consumed identically by the
// desktop app and the headless host. This file keeps ONLY what is genuinely
// Electron/desktop-scoped:
//   - wiring config into one shared server instance (home P2PDrive root,
//     in-memory token, engine binding),
//   - the Windows "Drive" OS integration (drive-letter mount via net
//     use/subst, Explorer Network Shortcut) — deliberately NOT offered by the
//     headless host (see PHASE1B-REPORT.md, drive.mount/unmount exclusion),
//   - mount/permission/catalog state getters main.js still calls.
// All exported names are unchanged so electron/main.js behavior is identical.

const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const os = require('os')
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

const {
  createStreamServer,
  mintStreamUrl,
  resolveTransferStreamPath
} = require('../src/shared/localservers/stream-server.js')

const DEFAULT_PORT = 41983
const DEFAULT_DRIVE_LETTER = 'Z'

let boundEngine = null
let isMounted = false
let currentDriveLetter = DEFAULT_DRIVE_LETTER
let permissions = {
  accessMode: 'all',
  allowedDeviceIds: []
}

let cachedTransfers = []
let cachedSharedFiles = []
let onFileCreatedCallback = null

function setFileCreatedCallback(cb) {
  onFileCreatedCallback = cb
}

function getSyncRootDir() {
  const syncDir = path.join(os.homedir(), 'P2PDrive')
  if (!fs.existsSync(syncDir)) {
    fs.mkdirSync(syncDir, { recursive: true })
  }
  return syncDir
}

// One shared server instance for this process. No tokenProvider: the server
// mints the in-memory 24-byte hex token lazily, exactly like the legacy
// module-level getWebDAVToken()/tokenMatches() pair.
const server = createStreamServer({
  root: getSyncRootDir,
  port: DEFAULT_PORT,
  getEngine: () => boundEngine,
  onFileCreated: (item) => {
    if (typeof onFileCreatedCallback === 'function') {
      try {
        onFileCreatedCallback(item)
      } catch {}
    }
  }
})

function updateCatalogData(data) {
  if (Array.isArray(data?.transfers)) cachedTransfers = data.transfers
  if (Array.isArray(data?.sharedFiles)) cachedSharedFiles = data.sharedFiles
}

function startWebDAVServer(options = {}) {
  return server.start(options)
}

function stopWebDAVServer() {
  server.stop()
}

// Legacy resolver signature (engine passed explicitly by callers); bound to
// the shared server instance for minting.
function mintStreamUrlForEngine(engine, params) {
  if (engine && engine !== boundEngine) setWebDAVEngine(engine)
  return mintStreamUrl(server, boundEngine || engine, params)
}

function setWebDAVEngine(eng) {
  boundEngine = eng
}

function getWebDAVToken() {
  return server.getToken()
}

function getDriveStatus() {
  return {
    isMounted,
    driveLetter: currentDriveLetter,
    webdavUrl: `http://127.0.0.1:${server.port()}/p2p/`,
    port: server.port(),
    permissions
  }
}

async function createExplorerNetworkShortcut() {
  try {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    const netPath = path.join(appData, 'Microsoft', 'Windows', 'Network Shortcuts', 'Unified Drive')
    await fsp.rm(netPath, { recursive: true, force: true }).catch(() => {})
    await fsp.mkdir(netPath, { recursive: true })

    const escapedNetPath = netPath.replace(/\\/g, '\\\\')
    const psScript = `$wsh = New-Object -ComObject WScript.Shell; $sc = $wsh.CreateShortcut("${escapedNetPath}\\\\target.lnk"); $sc.TargetPath = "http://127.0.0.1:${server.port()}/p2p/"; $sc.Save(); Set-Content -Path "${escapedNetPath}\\\\desktop.ini" -Value "[.ShellClassInfo]\`r\`nCLSID2={0AFE1625-031D-4595-A08E-6850B3766E99}"; (Get-Item "${escapedNetPath}").Attributes = "ReadOnly"`
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`).catch(
      () => {}
    )
  } catch (err) {
    console.warn('[WebDAV] Network shortcut notice:', err.message)
  }
}

async function removeExplorerNetworkShortcut() {
  try {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    const netPath = path.join(appData, 'Microsoft', 'Windows', 'Network Shortcuts', 'Unified Drive')
    await fsp.rm(netPath, { recursive: true, force: true }).catch(() => {})
  } catch {}
}

async function mountWindowsDrive(letter = DEFAULT_DRIVE_LETTER) {
  const drive = letter.toUpperCase().replace(/[^A-Z]/g, '') || DEFAULT_DRIVE_LETTER
  const webdavUrl = `http://127.0.0.1:${server.port()}/p2p/`
  const syncDir = getSyncRootDir()

  await execAsync(`net use ${drive}: /delete /y`).catch(() => {})
  await execAsync(`subst ${drive}: /d`).catch(() => {})

  await createExplorerNetworkShortcut()

  let mountedViaNetUse = false
  const mountCommands = [
    `net use ${drive}: http://127.0.0.1:${server.port()}/p2p /persistent:no`,
    `net use ${drive}: \\\\127.0.0.1@${server.port()}\\p2p /persistent:no`,
    `net use ${drive}: \\\\127.0.0.1@${server.port()}\\DavWWWRoot\\p2p /persistent:no`,
    `net use ${drive}: \\\\localhost@${server.port()}\\p2p /persistent:no`
  ]

  for (const cmd of mountCommands) {
    try {
      console.log(`[WebDAV] Attempting mount command: ${cmd}`)
      await execAsync(cmd)
      mountedViaNetUse = true
      break
    } catch {}
  }

  if (!mountedViaNetUse) {
    try {
      console.log(`[WebDAV] Mounting unified virtual drive ${drive}: -> ${syncDir}`)
      await execAsync(`subst ${drive}: "${syncDir}"`)
    } catch (substErr) {
      console.warn('[WebDAV] Subst warning:', substErr.message)
    }
  }

  isMounted = true
  currentDriveLetter = drive
  return { success: true, driveLetter: drive, webdavUrl }
}

async function unmountWindowsDrive(letter = currentDriveLetter) {
  const drive = letter.toUpperCase().replace(/[^A-Z]/g, '') || DEFAULT_DRIVE_LETTER
  try {
    console.log(`[WebDAV] Unmounting ${drive}:...`)
    await execAsync(`net use ${drive}: /delete /y`).catch(() => {})
    await execAsync(`subst ${drive}: /d`).catch(() => {})
    await removeExplorerNetworkShortcut()
    isMounted = false
    return { success: true, driveLetter: drive }
  } catch (err) {
    console.error(`[WebDAV] Unmount warning for ${drive}:`, err.message)
    isMounted = false
    return { success: true, driveLetter: drive }
  }
}

function updateDrivePermissions(newPerms) {
  permissions = {
    accessMode: newPerms?.accessMode || 'all',
    allowedDeviceIds: Array.isArray(newPerms?.allowedDeviceIds) ? newPerms.allowedDeviceIds : []
  }
  return permissions
}

module.exports = {
  startWebDAVServer,
  stopWebDAVServer,
  mountWindowsDrive,
  unmountWindowsDrive,
  getDriveStatus,
  getWebDAVToken,
  updateDrivePermissions,
  updateCatalogData,
  setFileCreatedCallback,
  setWebDAVEngine,
  resolveTransferStreamPath,
  mintStreamUrl: mintStreamUrlForEngine
}
