'use strict'

// Regression checks for the portable self-updater pure helpers
// (electron/updater-util.js). Run with: npm run test:updater

const { sign, generateKeyPairSync } = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  compareVersions,
  createPortableSwapScript,
  verifyPortableSignature,
  isValidAsar,
  UPDATE_PUBLIC_KEY_HEX
} = require('../electron/updater-util.js')

const checks = []
const ok = (name, cond, detail = '') => {
  checks.push({ name, pass: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

// ── version compare ─────────────────────────────────────────────────────────
ok('1.0.0 < 1.0.1', compareVersions('1.0.0', '1.0.1') === -1)
ok('1.0.1 > 1.0.0', compareVersions('1.0.1', '1.0.0') === 1)
ok('v1.2.3 == 1.2.3', compareVersions('v1.2.3', '1.2.3') === 0)
ok('prerelease ignored', compareVersions('1.0.0', '1.0.0-beta.2') === 0)
ok('2.0 > 1.9.9', compareVersions('2.0', '1.9.9') === 1)

// ── swap script ────────────────────────────────────────────────────────────
const script = createPortableSwapScript({
  pid: 1234,
  newExe: 'C:\\Temp\\meshdrop-update\\MeshDrop-1.0.1-portable.exe',
  curExe: 'D:\\Apps\\MeshDrop\\MeshDrop.exe'
})
ok('swap: pid baked', script.includes('OLD_PID=1234'))
ok('swap: new exe path preserved', script.includes('C:\\Temp\\meshdrop-update\\MeshDrop-1.0.1-portable.exe'))
ok('swap: cur exe path preserved', script.includes('D:\\Apps\\MeshDrop\\MeshDrop.exe'))
ok('swap: backup path', script.includes('BAK_EXE=D:\\Apps\\MeshDrop\\MeshDrop.exe.old'))
ok('swap: CRLF line endings', script.includes('\r\n'))
ok('swap: wait loop', script.includes(':waitpid') && script.includes('tasklist'))
ok('swap: retry swap', script.includes(':try_old') && script.includes('if %TRIES% GEQ 30 goto fail'))
ok('swap: relaunch', script.includes('start "" "%CUR_EXE%"'))
ok('swap: self delete', script.includes('del /q "%~f0"'))
ok('swap: KEEPS backup for rollback', !script.includes('del /q "%BAK_EXE%"'))

// ── ed25519 signature verification ─────────────────────────────────────────
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const pubHex = publicKey.export({ format: 'der', type: 'spki' }).toString('hex')
const tmp = path.join(os.tmpdir(), `meshdrop-sig-test-${process.pid}.bin`)
fs.writeFileSync(tmp, Buffer.from('update payload '.repeat(1000)))

const goodSig = sign(null, fs.readFileSync(tmp), privateKey).toString('hex')

ok('sig: embedded public key looks valid', /^[0-9a-f]{88}$/i.test(UPDATE_PUBLIC_KEY_HEX))
ok('sig: valid signature accepted', verifyPortableSignature(tmp, goodSig, pubHex) === true)
ok('sig: tampered file rejected', verifyPortableSignature(tmp, '00'.repeat(64), pubHex) === false)
ok('sig: garbage signature rejected', verifyPortableSignature(tmp, 'not-a-signature', pubHex) === false)
fs.rmSync(tmp, { force: true })

// ── asar validation (used by the folder-install verification) ──────────────
const txtFile = path.join(os.tmpdir(), `meshdrop-asar-txt-${process.pid}.txt`)
fs.writeFileSync(txtFile, 'just some ordinary text, no archive header here')
ok('asar: text file is not asar', isValidAsar(txtFile) === false)
fs.rmSync(txtFile, { force: true })
ok('asar: missing file is not asar', isValidAsar(path.join(__dirname, 'nope-missing')) === false)
// Layout-agnostic: ANY asar flavor (Electron or Pear/Bare runtime) must pass.
const synthAsar = path.join(os.tmpdir(), `meshdrop-asar-synth-${process.pid}.asar`)
fs.writeFileSync(synthAsar, Buffer.concat([Buffer.from([0x04, 0, 0, 0, 0x9c, 0xf6, 0x1e, 0x00, 0x9a, 0xf6, 0x1e, 0x00, 0x98, 0xf6, 0x1e, 0x00]), Buffer.from('{"files":{}}')]))
ok('asar: bare-runtime-style header accepted', isValidAsar(synthAsar))
fs.writeFileSync(synthAsar, Buffer.from('this is definitely not an asar archive'))
ok('asar: non-asar binary rejected', isValidAsar(synthAsar) === false)
fs.rmSync(synthAsar, { force: true })
const realAsar = path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar')
if (fs.existsSync(realAsar)) {
  ok('asar: real packaged app.asar is valid', isValidAsar(realAsar))
} else {
  console.log('SKIP  asar: real packaged app.asar (dist/win-unpacked not built yet)')
}

const failed = checks.filter((c) => !c.pass).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
