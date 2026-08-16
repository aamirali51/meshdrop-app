'use strict'

// Regression checks for the folder-portable machinery:
//   electron/zip.js (extraction + traversal protection)
//   electron/updater-util.js createFolderSwapScript (App/Data split swap)
// Run with: npm run test:portable

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const { extractZip, listEntries, sanitizeEntryName } = require('../electron/zip.js')
const { createFolderSwapScript } = require('../electron/updater-util.js')

const checks = []
const ok = (name, cond, detail = '') => {
  checks.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

// ── tiny ZIP writer (stored + deflate + malicious entries) ──────────────────
function makeZip(entries) {
  const local = []
  const central = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const comp = e.method === 8 ? zlib.deflateRawSync(e.data) : e.data
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0x0800, 6) // UTF-8 names
    lh.writeUInt16LE(e.method, 8)
    lh.writeUInt32LE(comp.length, 18)
    lh.writeUInt32LE(e.data.length, 22)
    lh.writeUInt16LE(name.length, 26)
    local.push(lh, name, comp)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(e.method, 10)
    ch.writeUInt32LE(comp.length, 20)
    ch.writeUInt32LE(e.data.length, 24)
    ch.writeUInt16LE(name.length, 28)
    ch.writeUInt32LE(offset, 42)
    central.push(ch, name)
    offset += 30 + name.length + comp.length
  }
  const cdStart = offset
  const cd = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(cdStart, 16)
  return Buffer.concat([...local, cd, eocd])
}

// ── sanitizeEntryName ────────────────────────────────────────────────────────
ok('sanitize: plain path', sanitizeEntryName('resources/app.asar') === 'resources/app.asar')
ok('sanitize: backslashes normalized', sanitizeEntryName('locales\\en-US.pak') === 'locales/en-US.pak')
ok('sanitize: leading ./ stripped', sanitizeEntryName('./MeshDrop.exe') === 'MeshDrop.exe')
ok('sanitize: traversal rejected', sanitizeEntryName('../evil.exe') === null)
ok('sanitize: absolute path rejected', sanitizeEntryName('/etc/passwd') === null)
ok('sanitize: drive path rejected', sanitizeEntryName('C:\\Windows\\x') === null)

// ── extractZip: stored + deflate + traversal ────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meshdrop-zip-test-'))
const payload = Buffer.from('mesh drop payload '.repeat(200))
const zipBuf = makeZip([
  { name: 'MeshDrop.exe', data: Buffer.from('MZ fake exe'), method: 0 },
  { name: 'resources/app.asar', data: payload, method: 8 },
  { name: 'resources/sub/deep.txt', data: Buffer.from('deep'), method: 8 },
  { name: '../evil.txt', data: Buffer.from('evil'), method: 0 },
  { name: 'C:/abs.txt', data: Buffer.from('abs'), method: 0 }
])
const zipPath = path.join(tmp, 'update.zip')
fs.writeFileSync(zipPath, zipBuf)

const entries = listEntries(zipBuf)
ok('zip: 5 central entries parsed', entries.length === 5)

const outDir = path.join(tmp, 'out')
const written = extractZip(zipPath, outDir)
ok('zip: 3 safe entries extracted (evil+abs skipped)', written === 3)
ok('zip: exe extracted', fs.readFileSync(path.join(outDir, 'MeshDrop.exe'), 'utf8') === 'MZ fake exe')
ok('zip: deflate entry extracted intact', Buffer.compare(fs.readFileSync(path.join(outDir, 'resources', 'app.asar')), payload) === 0)
ok('zip: nested dirs created', fs.readFileSync(path.join(outDir, 'resources', 'sub', 'deep.txt'), 'utf8') === 'deep')
ok('zip: traversal NOT written', !fs.existsSync(path.join(tmp, 'evil.txt')) && !fs.existsSync(path.join(outDir, '..', 'evil.txt')))

// ── createFolderSwapScript ──────────────────────────────────────────────────
const script = createFolderSwapScript({
  pid: 4242,
  appDir: 'D:\\Apps\\MeshDrop',
  updateDir: 'D:\\Apps\\MeshDrop.update',
  exeName: 'MeshDrop.exe'
})
ok('swap: waits for pid', script.includes('OLD_PID=4242') && script.includes(':waitpid'))
ok('swap: keeps data/.portable/.old', script.includes('not "%%~nxD"=="data"') && script.includes('not "%%~nxD"==".portable"'))
ok('swap: moves app entries to .old', script.includes('OLD_DIR=D:\\Apps\\MeshDrop.old'))
ok('swap: moves update in', script.includes('UPDATE_DIR=D:\\Apps\\MeshDrop.update'))
ok('swap: relaunches app', script.includes('start "" "%APP_DIR%\\%EXE%"'))
ok('swap: self deletes', script.includes('del /q "%~f0"'))

fs.rmSync(tmp, { recursive: true, force: true })

const failed = checks.filter((c) => !c.pass).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
