'use strict'

// Minimal ZIP reader for folder-portable updates. electron-builder publishes
// the app folder as `<Product>-<version>-win-x64.zip`; folder mode downloads
// that signed zip and extracts it here. Only what folder updates need:
// central-directory parsing + stored (0) / deflate (8) entries, with
// path-traversal protection. Node has no built-in unzip, and adding a
// dependency for one archive type is not worth it.

const fs = (() => {
  try {
    return require('original-fs')
  } catch {
    return require('fs')
  }
})()
const path = require('path')
const zlib = require('zlib')

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50

function findEOCD(buf) {
  // EOCD is within the last 65557 bytes; search backwards.
  const start = Math.max(0, buf.length - 65557)
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i
  }
  throw new Error('Not a ZIP archive (no end-of-central-directory record)')
}

function sanitizeEntryName(name) {
  let n = String(name).replace(/\\/g, '/')
  if (n.startsWith('/') || /^[a-zA-Z]:/.test(n)) return null // absolute
  const parts = n.split('/').filter((p) => p && p !== '.')
  if (parts.some((p) => p === '..')) return null // traversal
  return parts.join('/')
}

function listEntries(buf) {
  const eocd = findEOCD(buf)
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  const entries = []
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== CENTRAL_SIG) throw new Error('Corrupt ZIP central directory')
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8')
    entries.push({ name, method, compSize, localOff })
    off += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function extractEntry(buf, entry) {
  const lh = entry.localOff
  if (buf.readUInt32LE(lh) !== LOCAL_SIG) throw new Error('Corrupt ZIP local header')
  const nameLen = buf.readUInt16LE(lh + 26)
  const extraLen = buf.readUInt16LE(lh + 28)
  const data = buf.subarray(lh + 30 + nameLen + extraLen, lh + 30 + nameLen + extraLen + entry.compSize)
  if (entry.method === 0) return data
  if (entry.method === 8) return zlib.inflateRawSync(data)
  throw new Error(`Unsupported ZIP compression method ${entry.method}`)
}

// Extract a zip file into outDir (created if missing). Entries with unsafe
// names (absolute paths, `..` traversal) are skipped, never written.
function extractZip(zipPath, outDir) {
  const buf = fs.readFileSync(zipPath)
  fs.mkdirSync(outDir, { recursive: true })
  let written = 0
  for (const entry of listEntries(buf)) {
    const safe = sanitizeEntryName(entry.name)
    if (!safe) {
      console.warn(`[Zip] Skipping unsafe archive entry: ${entry.name}`)
      continue
    }
    const dest = path.join(outDir, ...safe.split('/'))
    if (entry.name.endsWith('/')) {
      fs.mkdirSync(dest, { recursive: true })
      continue
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, extractEntry(buf, entry))
    written++
  }
  return written
}

module.exports = { extractZip, listEntries, sanitizeEntryName }
