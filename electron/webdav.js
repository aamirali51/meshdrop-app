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

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.mts': 'video/mp2t',
  '.m4v': 'video/mp4',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf'
}

let boundEngine = null

function setWebDAVEngine(eng) {
  boundEngine = eng
}

function getMimeType(filePath) {
  const ext = path.extname(filePath || '').toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

async function handleGetOrHead(req, res, targetUrlPath, isHead = false) {
  let localPath = null
  let transferId = null

  // Route: /stream/file?path=<encodedPath>
  if (targetUrlPath.startsWith('/stream/file')) {
    try {
      const u = new URL(targetUrlPath, 'http://127.0.0.1')
      const p = u.searchParams.get('path')
      if (p && fs.existsSync(p)) localPath = p
    } catch {}
  } else if (targetUrlPath.startsWith('/stream/transfer')) {
    // Route: /stream/transfer?id=<transferId>&path=<encodedPath>
    try {
      const u = new URL(targetUrlPath, 'http://127.0.0.1')
      transferId = u.searchParams.get('id')
      const fallbackPath = u.searchParams.get('path')
      if (fallbackPath && fs.existsSync(fallbackPath)) {
        localPath = fallbackPath
      }
      if (!localPath && transferId && boundEngine) {
        // 1. Check transfers bee for stagingPath, destPath, filePath
        const bee = await boundEngine.getBee('transfers').catch(() => null)
        if (bee) {
          const entry = await bee.get(transferId).catch(() => null)
          if (entry?.value?.stagingPath && fs.existsSync(entry.value.stagingPath)) {
            localPath = entry.value.stagingPath
          } else if (entry?.value?.destPath && fs.existsSync(entry.value.destPath)) {
            localPath = entry.value.destPath
          } else if (entry?.value?.filePath && fs.existsSync(entry.value.filePath)) {
            localPath = entry.value.filePath
          }
        }

        // 2. Check if staging .part file exists in baseDir or downloadsDir
        if (!localPath) {
          const downloadsDir =
            (boundEngine.getDownloadDirectory ? await boundEngine.getDownloadDirectory() : null) ||
            boundEngine.downloadsDir ||
            path.join(os.homedir(), 'Downloads')
          const stagingDir = path.join(downloadsDir, '.p2p-staging', transferId)
          if (fs.existsSync(stagingDir)) {
            const files = await fsp.readdir(stagingDir).catch(() => [])
            const part = files.find((f) => f.endsWith('.part'))
            if (part) localPath = path.join(stagingDir, part)
          }
        }
      }
    } catch {}
  }

  if (!localPath) {
    localPath = resolveLocalPath(targetUrlPath)
  }

  if (!fs.existsSync(localPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
    res.end('File Not Found')
    return
  }

  try {
    const stat = await fsp.stat(localPath)
    if (stat.isDirectory()) {
      res.writeHead(405, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
      res.end('Cannot GET directory')
      return
    }

    const mimeType = getMimeType(localPath)
    const rangeHeader = req.headers['range']

    // Handle HTTP 206 Range Requests for smooth seeking in video players
    if (rangeHeader && stat.size > 0) {
      let start = 0
      let end = stat.size - 1

      const match = /bytes=(\d*)-(\d*)/i.exec(rangeHeader)
      if (match) {
        if (match[1] && match[2]) {
          start = parseInt(match[1], 10)
          end = parseInt(match[2], 10)
        } else if (match[1]) {
          start = parseInt(match[1], 10)
          end = stat.size - 1
        } else if (match[2]) {
          const suffix = parseInt(match[2], 10)
          start = Math.max(0, stat.size - suffix)
          end = stat.size - 1
        }
      }

      if (isNaN(start) || isNaN(end) || start > end || start >= stat.size) {
        res.writeHead(416, {
          'Content-Range': `bytes */${stat.size}`,
          'Access-Control-Allow-Origin': '*'
        })
        res.end()
        return
      }

      end = Math.min(end, stat.size - 1)

      // Notify chunk scheduler to prioritize chunks around this playhead
      if (transferId && boundEngine && typeof boundEngine.setPlayheadByte === 'function') {
        boundEngine.setPlayheadByte(transferId, start)
      }

      const chunkSize = end - start + 1
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        DAV: '1, 2'
      })

      if (isHead) {
        res.end()
      } else {
        const stream = fs.createReadStream(localPath, {
          start,
          end,
          highWaterMark: 1024 * 1024
        })
        req.on('close', () => stream.destroy())
        res.on('close', () => stream.destroy())
        stream.on('error', () => stream.destroy())
        stream.pipe(res)
      }
    } else {
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        DAV: '1, 2'
      })
      if (isHead) {
        res.end()
      } else {
        const stream = fs.createReadStream(localPath, {
          highWaterMark: 1024 * 1024
        })
        req.on('close', () => stream.destroy())
        res.on('close', () => stream.destroy())
        stream.on('error', () => stream.destroy())
        stream.pipe(res)
      }
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
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
  const initialPort = options.port || DEFAULT_PORT

  if (server && activePort) return Promise.resolve(activePort)

  return new Promise((resolve, reject) => {
    function tryPort(p) {
      const s = http.createServer(async (req, res) => {
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

      s.listen(p, '127.0.0.1', () => {
        server = s
        activePort = p
        console.log(`[WebDAV] Direct Unified Drive listening on http://127.0.0.1:${activePort}/p2p/`)
        resolve(activePort)
      })

      s.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && p < initialPort + 20) {
          console.warn(`[WebDAV] Port ${p} in use, trying port ${p + 1}...`)
          tryPort(p + 1)
        } else {
          console.error('[WebDAV] Server error:', err.message)
          reject(err)
        }
      })
    }

    tryPort(initialPort)
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
  setFileCreatedCallback,
  setWebDAVEngine
}
