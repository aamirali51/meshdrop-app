const http = require('http')
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

// ─── Loopback lockdown ─────────────────────────────────────────────────────
// This server binds 127.0.0.1 but is reachable from ANY local process, so it
// is gated like the sites gateway (sites-gateway.js): a 24-byte random hex
// token, minted lazily here in main-process memory, required on every request.
// Media elements (<video>/mpegts XHR) cannot attach custom headers, so the
// token is accepted either via the X-MeshDrop-Token header or the ?t= query
// param that stream.getUrl appends to every minted URL.

let activeToken = null

function getWebDAVToken() {
  if (!activeToken) activeToken = crypto.randomBytes(24).toString('hex')
  return activeToken
}

// Constant-time token compare (timingSafeEqual). Hex tokens have a fixed
// length, so a length mismatch is an immediate reject before the compare.
function tokenMatches(...values) {
  if (!activeToken) return false
  const a = Buffer.from(activeToken, 'utf8')
  for (const v of values) {
    if (typeof v !== 'string' || !v) continue
    const b = Buffer.from(v, 'utf8')
    if (a.length !== b.length) continue
    if (crypto.timingSafeEqual(a, b)) return true
  }
  return false
}

// DNS-rebinding protection: never answer a request whose Host header names
// anything but this machine's loopback. A malicious webpage can force a
// browser to call 127.0.0.1 with a hostile Host header; refusing it here (403,
// no crash) closes that class of attack.
function isLoopbackHost(hostHeader) {
  if (typeof hostHeader !== 'string') return false
  const host = hostHeader.trim().toLowerCase()
  if (!host || host.includes(',')) return false // folded/duplicate Host — reject
  const name = host.split(':')[0]
  return name === '127.0.0.1' || name === 'localhost'
}

// CORS is pinned to the exact origins the renderer can be served from — never
// '*' (any website could otherwise read loopback responses). Electron prod
// loads the UI from file:// (opaque origin "null" over CORS); the Vite dev
// server is fixed at localhost:5173.
const ALLOWED_RENDERER_ORIGINS = new Set([
  'null',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
])

function isAllowedRendererOrigin(origin) {
  return typeof origin === 'string' && ALLOWED_RENDERER_ORIGINS.has(origin)
}

function pinCorsHeaders(res, origin) {
  if (origin && isAllowedRendererOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-MeshDrop-Container, Content-Range, Accept-Ranges, ETag'
    )
  }
}

// P4: container sniffing for the media gateway. The sniff helper lives in the
// shared core (meshdrop-core) so desktop and mobile agree; here we only read
// the file head and cache the result per (path, mtime).
const { sniffContainer } = require('@mesh/core/engine/transfer/integrity.js')
const sniffCache = new Map() // `${path}:${mtimeMs}` -> containerResult

async function sniffLocalContainer(localPath) {
  try {
    const st = await fsp.stat(localPath)
    const cacheKey = `${localPath}:${st.mtimeMs}`
    const hit = sniffCache.get(cacheKey)
    if (hit) return hit
    const fd = await fsp.open(localPath, 'r')
    try {
      const head = Buffer.alloc(Math.min(256 * 1024, st.size))
      if (head.length === 0) return null
      const { bytesRead } = await fd.read(head, 0, head.length, 0)
      const result = sniffContainer(head.subarray(0, bytesRead))
      if (result) sniffCache.set(cacheKey, result)
      // Bound the cache (a folder full of videos should not grow unbounded).
      if (sniffCache.size > 500) {
        const oldestKey = sniffCache.keys().next().value
        sniffCache.delete(oldestKey)
      }
      return result
    } finally {
      await fd.close().catch(() => {})
    }
  } catch {
    return null
  }
}

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
  // Strip any ?t=<token> query (or hash) a minted URL may carry before the
  // path is mapped onto disk — the token is auth, not part of the filename.
  const cleanUrlPath = String(urlPath || '/').split('?')[0].split('#')[0]
  const decoded = decodeURIComponent(cleanUrlPath).replace(/\/+/g, '/')
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

  const decoded = decodeURIComponent(targetUrlPath.split('?')[0]).replace(/\/+/g, '/')
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

// Resolve a transfer id to a locally readable media path (staging .part while
// downloading, final file once complete, or a sender's own file path).
// Returns null when nothing is (yet) resolvable — callers must not hand the
// player a URL that can only 404.
async function resolveTransferStreamPath(engine, transferId) {
  if (!engine || !transferId) return null
  try {
    const bee = await engine.getBee('transfers').catch(() => null)
    if (bee) {
      const entry = await bee.get(transferId).catch(() => null)
      const rec = entry?.value
      if (!rec) return null
      // Progressive-playback gate: do NOT hand the player a .part until the
      // transfer has verified enough of the file head to be playable (moov /
      // prefix watermark). Surfacing a near-empty .part early is what caused
      // "timeline but no video" on guests.
      const playable = rec.playable === true || rec.status === 'completed'
      if (!playable) return null
      if (rec.stagingPath && fs.existsSync(rec.stagingPath)) {
        return rec.stagingPath
      }
      if (rec.destPath && fs.existsSync(rec.destPath)) {
        return rec.destPath
      }
      if (rec.filePath && fs.existsSync(rec.filePath)) {
        return rec.filePath
      }
    }
  } catch {}
  return null
}

function setWebDAVEngine(eng) {
  boundEngine = eng
}

// Fetch the persisted transfer record (manifest fileSize, staging paths, …).
async function getTransferRecord(engine, transferId) {
  if (!engine || !transferId || typeof engine.getBee !== 'function') return null
  try {
    const bee = await engine.getBee('transfers').catch(() => null)
    if (!bee) return null
    const entry = await bee.get(transferId).catch(() => null)
    return (entry && entry.value) || null
  } catch {}
  return null
}

// Cap concurrent held (waiting) range responses per transfer. A looping
// player that fires range requests into un-downloaded regions must not pile
// up sockets — excess requests get an immediate 416 and retry later.
const heldRangeWaits = new Map() // transferId -> held count
const MAX_HELD_RANGE_WAITS = 4

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
        localPath = await resolveTransferStreamPath(boundEngine, transferId)
      }
    } catch {}
  }

  if (!localPath) {
    localPath = resolveLocalPath(targetUrlPath)
  }

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

    // For transfer routes (.part staging files) derive MIME/container from the
    // transfer record's ORIGINAL filename (never .part), so a movie.mp4.part
    // serves as video/mp4. Falls back to localPath when no record exists.
    let transferRec = null
    if (transferId && boundEngine) {
      transferRec = await getTransferRecord(boundEngine, transferId)
    }
    const mediaPath = (transferRec && (transferRec.filename || transferRec.filePath))
      ? (transferRec.filename || transferRec.filePath)
      : localPath
    const mimeType = getMimeType(mediaPath)
    const rangeHeader = req.headers['range']

    // P4: expose the container/codec sniff so the renderer can decide native
    // vs MSE without reading the file itself. For staging paths use the
    // ORIGINAL extension (so .mp4.part gets sniffed like .mp4).
    const mediaExt = path.extname(mediaPath).toLowerCase()
    const sniff = ['.mp4', '.m4v', '.mkv', '.webm', '.mov', '.ts', '.m2ts'].includes(mediaExt)
      ? await sniffLocalContainer(localPath)
      : null
    const sniffHeader = sniff
      ? `${sniff.container}${sniff.codecs && sniff.codecs.length ? ':' + sniff.codecs.join(',') : ''}`
      : ''

    // Handle HTTP 206 Range Requests for smooth seeking in video players.
    // For transfers, `total` is the manifest fileSize, NOT the .part file's
    // current on-disk size — the staging file is written positionally, so
    // stat.size can reflect preallocation/extent growth and would make the
    // player's seek bar jitter during progressive playback.
    if (rangeHeader && stat.size > 0) {
      let total = stat.size
      if (transferId && boundEngine) {
        const rec = await getTransferRecord(boundEngine, transferId)
        if (rec && Number.isFinite(rec.fileSize) && rec.fileSize > 0) {
          total = rec.fileSize
        }
      }

      let start = 0
      let end = total - 1

      const match = /bytes=(\d*)-(\d*)/i.exec(rangeHeader)
      if (match) {
        if (match[1] && match[2]) {
          start = parseInt(match[1], 10)
          end = parseInt(match[2], 10)
        } else if (match[1]) {
          start = parseInt(match[1], 10)
          end = total - 1
        } else if (match[2]) {
          const suffix = parseInt(match[2], 10)
          start = Math.max(0, total - suffix)
          end = total - 1
        }
      }

      if (isNaN(start) || isNaN(end) || start > end || start >= total) {
        res.writeHead(416, {
          'Content-Range': `bytes */${total}`,
        })
        res.end()
        return
      }

      end = Math.min(end, total - 1)

      // Notify chunk scheduler to prioritize chunks around this playhead, and
      // mark the transfer media-active (widens the sync sender window while a
      // player is actually consuming the stream).
      if (transferId && boundEngine && typeof boundEngine.setPlayheadByte === 'function') {
        boundEngine.setPlayheadByte(transferId, start)
        if (typeof boundEngine.noteMediaRead === 'function') {
          boundEngine.noteMediaRead(transferId, start)
        }
      }

      // Coverage gate: never serve bytes from an un-downloaded region — the
      // .part has zero-filled holes there, which a player renders as black
      // frames / corruption. Coverage truth comes from the engine's
      // hypercore bitfield (survives resume), not the scheduler's LRU.
      let servedEnd = end
      if (transferId && boundEngine) {
        // Fail safe: an engine without coverage primitives (cold init race)
        // must yield 416, never the legacy raw stream over zero-filled holes.
        if (typeof boundEngine.coveredThrough !== 'function') {
          res.writeHead(416, {
            'Content-Range': `bytes */${total}`,
            })
          res.end()
          return
        }
        // coveredThrough is async (hypercore's has() is a Promise): a raw
        // truthy Promise would mask holes as covered.
        const coveredRaw = await boundEngine.coveredThrough(transferId, start, end)
        const covered = Number.isFinite(coveredRaw) ? coveredRaw : null
        if (covered === null || covered < start) {
          // Uncovered: prioritize the range, then hold the response briefly
          // (an active seek should land as soon as the blocks arrive).
          if (isHead) {
            res.writeHead(416, {
              'Content-Range': `bytes */${total}`,
            })
            res.end()
            return
          }
          const held = heldRangeWaits.get(transferId) || 0
          if (held >= MAX_HELD_RANGE_WAITS) {
            res.writeHead(416, {
            'Content-Range': `bytes */${total}`,
            })
            res.end()
            return
          }
          heldRangeWaits.set(transferId, held + 1)
          try {
            if (typeof boundEngine.prioritizeRange === 'function') {
              await boundEngine.prioritizeRange(transferId, start, end)
            }
            const waitP = typeof boundEngine.waitForRange === 'function'
              ? boundEngine.waitForRange(transferId, start, 10000)
              : Promise.resolve(null)
            // Release the held slot early if the player gives up mid-wait
            // instead of pinning it for the full 10s budget.
            const closedP = new Promise((resolve) => res.on('close', resolve))
            const throughRaw = await Promise.race([waitP, closedP])
            const through = Number.isFinite(throughRaw) ? throughRaw : null
            if (through === null || through < start) {
              res.writeHead(416, {
                'Content-Range': `bytes */${total}`,
              })
              res.end()
              return
            }
            servedEnd = Math.min(end, through)
          } finally {
            heldRangeWaits.set(transferId, Math.max(0, (heldRangeWaits.get(transferId) || 1) - 1))
          }
        } else {
          // Clamp the served range to the covered prefix. A shorter-than-
          // requested 206 is valid HTTP; players re-request the remainder.
          servedEnd = Math.min(end, covered)
        }
      }

      const chunkSize = servedEnd - start + 1
      const commonHeaders = {
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        DAV: '1, 2'
      }
      if (sniffHeader) commonHeaders['X-MeshDrop-Container'] = sniffHeader
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${servedEnd}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        ...commonHeaders
      })

      if (isHead) {
        res.end()
      } else {
        // Modest highWaterMark: don't pull more from disk than the player
        // consumes — the scheduler's speculative prefetch aligns with the read
        // position via setPlayheadByte above.
        const stream = fs.createReadStream(localPath, {
          start,
          end: servedEnd,
          highWaterMark: 256 * 1024
        })
        req.on('close', () => stream.destroy())
        res.on('close', () => stream.destroy())
        stream.on('error', () => stream.destroy())
        stream.pipe(res)
      }
    } else {
      const headers200 = {
        'Content-Type': mimeType,
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        DAV: '1, 2'
      }
      if (sniffHeader) headers200['X-MeshDrop-Container'] = sniffHeader
      res.writeHead(200, headers200)
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
  const initialPort = options.port || DEFAULT_PORT

  if (server && activePort) return Promise.resolve(activePort)

  return new Promise((resolve, reject) => {
    function tryPort(p) {
      const s = http.createServer(async (req, res) => {
        // ─── Loopback lockdown (order matters) ───────────────────────────
        // 1. Host validation: this server binds 127.0.0.1 and only answers
        //    requests that name the loopback (DNS-rebinding protection).
        if (!isLoopbackHost(req.headers.host)) {
          res.writeHead(403, { 'Content-Type': 'text/plain' })
          res.end('Forbidden')
          return
        }
        const origin = req.headers.origin
        const urlObj = new URL(req.url || '/', `http://127.0.0.1:${p}`)

        // 2. CORS preflight. A preflight can never carry the X-MeshDrop-Token
        //    header (browsers send only the CORS request headers), so OPTIONS
        //    is answered here — Host-checked, CORS pinned to the renderer's
        //    own origin (never *), and it carries no data.
        if (req.method === 'OPTIONS') {
          const preflightHeaders = {
            DAV: '1, 2',
            'MS-Author-Via': 'DAV',
            Allow: 'GET, HEAD, PROPFIND, OPTIONS, PUT, DELETE, MKCOL, MOVE',
            'Access-Control-Allow-Methods': 'GET, HEAD, PROPFIND, OPTIONS, PUT, DELETE, MKCOL, MOVE',
            'Access-Control-Allow-Headers': 'Range, If-None-Match, Content-Type, Destination, X-MeshDrop-Token'
          }
          if (origin && isAllowedRendererOrigin(origin)) {
            preflightHeaders['Access-Control-Allow-Origin'] = origin
            preflightHeaders['Vary'] = 'Origin'
          }
          res.writeHead(204, preflightHeaders)
          res.end()
          return
        }

        // 3. Token gate: header X-MeshDrop-Token or ?t= (media elements can't
        //    set headers). Constant-time compare, 403 on mismatch.
        const queryToken = urlObj.searchParams.get('t')
        const headerToken = req.headers['x-meshdrop-token']
        if (!tokenMatches(headerToken, queryToken)) {
          res.writeHead(403, { 'Content-Type': 'text/plain' })
          res.end('Forbidden — missing or invalid token. Open media through the MeshDrop app.')
          return
        }

        // 4. CORS pinning for the (token-authenticated) response itself.
        pinCorsHeaders(res, origin)

        const urlPath = req.url || '/'

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
    activeToken = null // next start mints a fresh token
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
  getWebDAVToken,
  updateDrivePermissions,
  updateCatalogData,
  setFileCreatedCallback,
  setWebDAVEngine,
  resolveTransferStreamPath
}
