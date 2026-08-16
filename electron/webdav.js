const http = require('http')
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const os = require('os')
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

const DEFAULT_PORT = 41983
const DEFAULT_DRIVE_LETTER = 'Z'

let server = null
let activePort = DEFAULT_PORT
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

function updateCatalogData(data) {
  if (Array.isArray(data?.transfers)) cachedTransfers = data.transfers
  if (Array.isArray(data?.sharedFiles)) cachedSharedFiles = data.sharedFiles
}

function escapeXml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatDateISO(date) {
  try {
    return new Date(date).toUTCString()
  } catch {
    return new Date().toUTCString()
  }
}

function generatePropfindXml(href, isFolder, size = 0, modified = new Date()) {
  const resourceType = isFolder
    ? '<d:resourcetype><d:collection/></d:resourcetype>'
    : '<d:resourcetype/>'
  const displayname = escapeXml(path.basename(href) || 'Root')

  return `
    <d:response>
      <d:href>${escapeXml(href)}</d:href>
      <d:propstat>
        <d:prop>
          <d:displayname>${displayname}</d:displayname>
          ${resourceType}
          <d:getcontentlength>${size}</d:getcontentlength>
          <d:getlastmodified>${formatDateISO(modified)}</d:getlastmodified>
        </d:prop>
        <d:status>HTTP/1.1 200 OK</d:status>
      </d:propstat>
    </d:response>`
}

function resolveLocalPath(urlPath) {
  const syncRoot = getSyncRootDir()
  const decoded = decodeURIComponent(urlPath || '/').replace(/\/+/g, '/')
  let cleanRel = decoded
  if (cleanRel.startsWith('/p2p')) {
    cleanRel = cleanRel.slice('/p2p'.length)
  }
  const safeRel = path
    .normalize(cleanRel)
    .replace(/^(\.\.[\/\\])+/, '')
    .replace(/^[/\\]+/, '')
  return path.join(syncRoot, safeRel)
}

async function handlePropfind(req, res, targetUrlPath) {
  res.writeHead(207, {
    'Content-Type': 'application/xml; charset="utf-8"',
    DAV: '1, 2',
    'MS-Author-Via': 'DAV'
  })

  const decoded = decodeURIComponent(targetUrlPath).replace(/\/+/g, '/')
  const localTarget = resolveLocalPath(targetUrlPath)
  let responsesXml = ''

  const reqHref = decoded.endsWith('/') ? decoded : decoded + '/'
  responsesXml += generatePropfindXml(reqHref, true)

  try {
    if (fs.existsSync(localTarget)) {
      const stat = await fsp.stat(localTarget)
      if (stat.isDirectory()) {
        const files = await fsp.readdir(localTarget, { withFileTypes: true })
        for (const f of files) {
          if (f.name === 'desktop.ini' || f.name === 'target.lnk' || f.name === 'target.url')
            continue
          const fullPath = path.join(localTarget, f.name)
          const fstat = await fsp.stat(fullPath).catch(() => null)
          if (!fstat) continue
          const isDir = fstat.isDirectory()
          const childHref = `${reqHref}${encodeURIComponent(f.name)}${isDir ? '/' : ''}`
          responsesXml += generatePropfindXml(childHref, isDir, isDir ? 0 : fstat.size, fstat.mtime)
        }
      }
    }
  } catch (err) {
    console.warn('[WebDAV] PROPFIND error:', err.message)
  }

  const xmlResponse = `<?xml version="1.0" encoding="utf-8" ?>
<d:multistatus xmlns:d="DAV:">
${responsesXml}
</d:multistatus>`

  res.end(xmlResponse)
}

async function handleGetOrHead(req, res, targetUrlPath, isHead = false) {
  const localPath = resolveLocalPath(targetUrlPath)

  if (!fs.existsSync(localPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('File Not Found')
    return
  }

  try {
    const stat = await fsp.stat(localPath)
    if (stat.isDirectory()) {
      res.writeHead(405, { 'Content-Type': 'text/plain' })
      res.end('Cannot GET directory')
      return
    }

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      DAV: '1, 2'
    })
    if (isHead) {
      res.end()
    } else {
      fs.createReadStream(localPath).pipe(res)
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(`Read Error: ${err.message}`)
  }
}

async function handlePut(req, res, targetUrlPath) {
  const localPath = resolveLocalPath(targetUrlPath)
  const filename = path.basename(localPath)

  if (
    !filename ||
    filename === 'desktop.ini' ||
    filename === 'target.lnk' ||
    filename === 'target.url' ||
    filename.endsWith('.tmp')
  ) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Ignored System Meta File')
    return
  }

  try {
    await fsp.mkdir(path.dirname(localPath), { recursive: true })
    const writeStream = fs.createWriteStream(localPath)
    req.pipe(writeStream)

    writeStream.on('finish', async () => {
      try {
        const stat = await fsp.stat(localPath)
        if (typeof onFileCreatedCallback === 'function') {
          try {
            onFileCreatedCallback({ filename, fileSize: stat.size, path: localPath })
          } catch {}
        }
        console.log(
          `[WebDAV] File created/updated via PUT: ${filename} (${stat.size} bytes) -> ${localPath}`
        )
        res.writeHead(201, { 'Content-Type': 'text/plain' })
        res.end('Created')
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end(`Write Error: ${err.message}`)
      }
    })

    writeStream.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end(`Stream Error: ${err.message}`)
    })
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(`Put Init Error: ${err.message}`)
  }
}

async function handleMkcol(req, res, targetUrlPath) {
  const localPath = resolveLocalPath(targetUrlPath)
  try {
    await fsp.mkdir(localPath, { recursive: true })
    console.log(`[WebDAV] Folder created via MKCOL: ${localPath}`)
    res.writeHead(201, { 'Content-Type': 'text/plain' })
    res.end('Created')
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(`MKCOL Error: ${err.message}`)
  }
}

async function handleDelete(req, res, targetUrlPath) {
  const localPath = resolveLocalPath(targetUrlPath)
  try {
    if (fs.existsSync(localPath)) {
      await fsp.rm(localPath, { recursive: true, force: true })
      console.log(`[WebDAV] Item deleted via DELETE: ${localPath}`)
    }
    res.writeHead(204)
    res.end()
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(`Delete Error: ${err.message}`)
  }
}

async function handleMove(req, res, targetUrlPath) {
  const srcPath = resolveLocalPath(targetUrlPath)
  const destinationHeader = req.headers['destination']
  if (!destinationHeader) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('Missing Destination Header')
    return
  }

  try {
    const destUrl = new URL(destinationHeader, `http://127.0.0.1:${activePort}`)
    const destPath = resolveLocalPath(destUrl.pathname)
    await fsp.mkdir(path.dirname(destPath), { recursive: true })
    await fsp.rename(srcPath, destPath)
    console.log(`[WebDAV] Item moved via MOVE: ${srcPath} -> ${destPath}`)
    res.writeHead(201, { 'Content-Type': 'text/plain' })
    res.end('Moved')
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(`Move Error: ${err.message}`)
  }
}

function startWebDAVServer(options = {}) {
  const port = options.port || DEFAULT_PORT

  if (server) return Promise.resolve(activePort)

  return new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, HEAD, PROPFIND, OPTIONS, PUT, DELETE, MKCOL, MOVE'
      )

      const urlPath = req.url || '/'

      if (req.method === 'OPTIONS') {
        res.writeHead(200, {
          DAV: '1, 2',
          'MS-Author-Via': 'DAV',
          Allow: 'GET, HEAD, PROPFIND, OPTIONS, PUT, DELETE, MKCOL, MOVE'
        })
        res.end()
        return
      }

      if (req.method === 'PROPFIND') {
        await handlePropfind(req, res, urlPath)
        return
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        await handleGetOrHead(req, res, urlPath, req.method === 'HEAD')
        return
      }

      if (req.method === 'PUT') {
        await handlePut(req, res, urlPath)
        return
      }

      if (req.method === 'MKCOL') {
        await handleMkcol(req, res, urlPath)
        return
      }

      if (req.method === 'DELETE') {
        await handleDelete(req, res, urlPath)
        return
      }

      if (req.method === 'MOVE') {
        await handleMove(req, res, urlPath)
        return
      }

      res.writeHead(200)
      res.end()
    })

    server.listen(port, '127.0.0.1', () => {
      activePort = port
      console.log(`[WebDAV] Direct Unified Drive listening on http://127.0.0.1:${activePort}/p2p/`)
      resolve(activePort)
    })

    server.on('error', (err) => {
      console.error('[WebDAV] Server error:', err.message)
      reject(err)
    })
  })
}

function stopWebDAVServer() {
  if (server) {
    server.close()
    server = null
    console.log('[WebDAV] Server stopped')
  }
}

async function createExplorerNetworkShortcut() {
  try {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    const netPath = path.join(appData, 'Microsoft', 'Windows', 'Network Shortcuts', 'Unified Drive')
    await fsp.rm(netPath, { recursive: true, force: true }).catch(() => {})
    await fsp.mkdir(netPath, { recursive: true })

    const escapedNetPath = netPath.replace(/\\/g, '\\\\')
    const psScript = `$wsh = New-Object -ComObject WScript.Shell; $sc = $wsh.CreateShortcut("${escapedNetPath}\\\\target.lnk"); $sc.TargetPath = "http://127.0.0.1:${activePort}/p2p/"; $sc.Save(); Set-Content -Path "${escapedNetPath}\\\\desktop.ini" -Value "[.ShellClassInfo]\`r\`nCLSID2={0AFE1625-031D-4595-A08E-6850B3766E99}"; (Get-Item "${escapedNetPath}").Attributes = "ReadOnly"`
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
  const webdavUrl = `http://127.0.0.1:${activePort}/p2p/`
  const syncDir = getSyncRootDir()

  await execAsync(`net use ${drive}: /delete /y`).catch(() => {})
  await execAsync(`subst ${drive}: /d`).catch(() => {})

  await createExplorerNetworkShortcut()

  let mountedViaNetUse = false
  const mountCommands = [
    `net use ${drive}: http://127.0.0.1:${activePort}/p2p /persistent:no`,
    `net use ${drive}: \\\\127.0.0.1@${activePort}\\p2p /persistent:no`,
    `net use ${drive}: \\\\127.0.0.1@${activePort}\\DavWWWRoot\\p2p /persistent:no`,
    `net use ${drive}: \\\\localhost@${activePort}\\p2p /persistent:no`
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

function getDriveStatus() {
  return {
    isMounted,
    driveLetter: currentDriveLetter,
    webdavUrl: `http://127.0.0.1:${activePort}/p2p/`,
    port: activePort,
    permissions
  }
}

module.exports = {
  startWebDAVServer,
  stopWebDAVServer,
  mountWindowsDrive,
  unmountWindowsDrive,
  getDriveStatus,
  updateDrivePermissions,
  updateCatalogData,
  setFileCreatedCallback
}
