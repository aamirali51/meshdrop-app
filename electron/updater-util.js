'use strict'

// Pure helpers for the portable self-updater. No Electron imports so these
// can be exercised with plain node (node scripts/check-updater-util.js).

const { createPublicKey, verify } = require('crypto')
const fs = (() => {
  try {
    return require('original-fs')
  } catch {
    return require('fs')
  }
})()
const { createHash } = require('crypto')

// Ed25519 public key (SPKI DER, hex) used to verify portable update
// signatures. The matching private key lives ONLY on the release machine
// (keys/update-key.priv, gitignored — regenerate with
// `node scripts/update-keygen.js` if lost, then paste the printed key here).
// Every published portable exe MUST ship a `<file>.sig` companion
// (`node scripts/sign-update.js <file>`); unsigned updates are refused.
const UPDATE_PUBLIC_KEY_HEX =
  '302a300506032b657003210031be4289b25631c4f0ac101de5aa6c203fb6cdb872a92746a8bb2f1450144ad1'

// Compare dotted version strings ("1.0.0" vs "v1.0.1"). Returns -1 when a < b,
// 0 when equal, 1 when a > b. Prerelease/build suffixes are ignored (the
// portable feed is the GitHub "latest" release, which excludes prereleases).
function compareVersions(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

function parseVersion(v) {
  const nums = String(v || '')
    .replace(/^v/i, '')
    .split(/[-+.]+/)
    .map((s) => parseInt(s, 10))
  return [nums[0] || 0, nums[1] || 0, nums[2] || 0]
}

// Verify an ed25519 signature over the bytes of a file on disk. One-shot
// verification buffers the file: Node's streaming createVerify('ed25519')
// throws ERR_CRYPTO_INVALID_DIGEST on newer OpenSSL builds, and using the same
// API in the sign script and here keeps them compatible. Updates are ~100 MB —
// a short-lived, one-time buffer is acceptable.
// `publicKeyHex` defaults to the embedded update key; tests pass a throwaway key.
function verifyPortableSignature(filePath, signatureHex, publicKeyHex = UPDATE_PUBLIC_KEY_HEX) {
  if (typeof signatureHex !== 'string' || !/^[0-9a-f]{128}$/i.test(signatureHex)) return false
  try {
    const publicKey = createPublicKey({ key: Buffer.from(publicKeyHex, 'hex'), format: 'der', type: 'spki' })
    return verify(null, fs.readFileSync(filePath), publicKey, Buffer.from(signatureHex, 'hex'))
  } catch (err) {
    return false
  }
}

// Build the Windows .cmd helper that survives app exit:
//   1. waits for the old app process (by PID) to fully exit
//   2. renames the running portable exe aside, moves the downloaded exe into
//      its place, and relaunches it
//   3. KEEPS the `.old` backup — the updated app deletes it on its first
//      successful startup, so a broken update can be rolled back by renaming
// The portable stub may still hold the file briefly after the app exits, so
// the swap is retried instead of failing on the first ACCESS_DENIED.
function createPortableSwapScript({ pid, newExe, curExe }) {
  const EOL = '\r\n'
  const lines = [
    '@echo off',
    'setlocal EnableExtensions',
    'rem MeshDrop portable self-update helper (generated).',
    `set "OLD_PID=${pid}"`,
    `set "NEW_EXE=${newExe}"`,
    `set "CUR_EXE=${curExe}"`,
    `set "BAK_EXE=${curExe}.old"`,
    'set /a WAITS=0',
    '',
    ':waitpid',
    'tasklist /FI "PID eq %OLD_PID%" 2>nul | findstr /c:"%OLD_PID%" >nul',
    'if errorlevel 1 goto replace',
    'timeout /t 1 /nobreak >nul',
    'set /a WAITS+=1',
    'if %WAITS% GEQ 120 goto replace',
    'goto waitpid',
    '',
    ':replace',
    'set /a TRIES=0',
    ':try_old',
    'move /y "%CUR_EXE%" "%BAK_EXE%" >nul 2>&1',
    'if not errorlevel 1 goto moved',
    'set /a TRIES+=1',
    'if %TRIES% GEQ 30 goto fail',
    'timeout /t 1 /nobreak >nul',
    'goto try_old',
    '',
    ':moved',
    'move /y "%NEW_EXE%" "%CUR_EXE%" >nul 2>&1',
    'if errorlevel 1 goto fail',
    'rem Backup kept on purpose: the new app deletes <exe>.old on first boot.',
    'start "" "%CUR_EXE%"',
    'goto done',
    '',
    ':fail',
    'rem Put the old file back if the new one never landed, then relaunch.',
    'if not exist "%CUR_EXE%" if exist "%BAK_EXE%" move /y "%BAK_EXE%" "%CUR_EXE%" >nul 2>&1',
    'if exist "%CUR_EXE%" start "" "%CUR_EXE%"',
    '',
    ':done',
    'del /q "%~f0" >nul 2>&1',
    'endlocal'
  ]
  return lines.join(EOL) + EOL
}

// Build the Windows .cmd helper that survives app exit for FOLDER-portable
// updates: waits for the app to exit, then swaps the app directory contents
// (everything except `data/`, `.portable` and `.old`) with the freshly
// extracted update, relaunches, and cleans up. The old app is kept as
// `<appDir>.old` until the new build boots once (rollback).
function createFolderSwapScript({ pid, appDir, updateDir, exeName }) {
  const EOL = '\r\n'
  const lines = [
    '@echo off',
    'setlocal EnableExtensions',
    'rem MeshDrop folder-portable update helper (generated).',
    `set "OLD_PID=${pid}"`,
    `set "APP_DIR=${appDir}"`,
    `set "UPDATE_DIR=${updateDir}"`,
    `set "OLD_DIR=${appDir}.old"`,
    `set "EXE=${exeName}"`,
    'set /a WAITS=0',
    '',
    ':waitpid',
    'tasklist /FI "PID eq %OLD_PID%" 2>nul | findstr /c:"%OLD_PID%" >nul',
    'if errorlevel 1 goto swap',
    'timeout /t 1 /nobreak >nul',
    'set /a WAITS+=1',
    'if %WAITS% GEQ 120 goto swap',
    'goto waitpid',
    '',
    ':swap',
    'if exist "%OLD_DIR%" rmdir /s /q "%OLD_DIR%"',
    'mkdir "%OLD_DIR%" >nul 2>&1',
    'rem Move every app entry except data/, .portable and .old aside.',
    'for /d %%D in ("%APP_DIR%\\*") do (',
    '  if /i not "%%~nxD"=="data" if /i not "%%~nxD"==".portable" if /i not "%%~nxD"==".old" move "%%D" "%OLD_DIR%\\" >nul 2>&1',
    ')',
    'for %%F in ("%APP_DIR%\\*") do (',
    '  if /i not "%%~nxF"==".portable" move "%%F" "%OLD_DIR%\\" >nul 2>&1',
    ')',
    'if exist "%UPDATE_DIR%\\" (',
    '  for /d %%D in ("%UPDATE_DIR%\\*") do move "%%D" "%APP_DIR%\\" >nul 2>&1',
    '  for %%F in ("%UPDATE_DIR%\\*") do move "%%F" "%APP_DIR%\\" >nul 2>&1',
    '  rmdir /s /q "%UPDATE_DIR%" >nul 2>&1',
    ')',
    'start "" "%APP_DIR%\\%EXE%"',
    'del /q "%~f0" >nul 2>&1',
    'endlocal'
  ]
  return lines.join(EOL) + EOL
}

// SHA-256 of a file (used to verify a copied app.asar is byte-identical).
function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

// Cheap sanity check that a file is plausibly an ASAR archive. Every flavor
// of ASAR header — vanilla Electron AND the Pear/Bare runtime variant — is a
// pickle followed by the JSON header, which always begins with the byte
// sequence `{"files"`. Checking for that marker in the first 64 KB is
// layout-agnostic and cannot false-negative on any real archive (this app
// ships both Electron and bare-runtime builds). The real integrity guarantee
// for the folder install is the post-copy SHA-256 comparison.
function isValidAsar(filePath) {
  try {
    const buf = Buffer.alloc(65536)
    const fd = fs.openSync(filePath, 'r')
    const n = fs.readSync(fd, buf, 0, 65536, 0)
    fs.closeSync(fd)
    if (n < 8) return false
    return buf.subarray(0, n).includes(Buffer.from('{"files"'))
  } catch (err) {
    return false
  }
}

module.exports = {
  compareVersions,
  createPortableSwapScript,
  createFolderSwapScript,
  verifyPortableSignature,
  isValidAsar,
  sha256File,
  UPDATE_PUBLIC_KEY_HEX
}
