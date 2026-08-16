'use strict'

// Generate the ed25519 keypair used to sign portable updates.
//
//   node scripts/update-keygen.js
//
// Writes the PRIVATE key (pkcs8 DER hex) to keys/update-key.priv (gitignored —
// it must never leave the release machine or be committed) and prints the
// PUBLIC key (spki DER hex) to paste into UPDATE_PUBLIC_KEY_HEX in
// electron/updater-util.js. Re-running this invalidates previously published
// signatures, so back the private key up.
//
// After generating (or restoring) the key, sign release artifacts with:
//   node scripts/sign-update.js path/to/MeshDrop-1.0.1-portable.exe

const { generateKeyPairSync } = require('crypto')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'keys', 'update-key.priv')

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const pubHex = publicKey.export({ format: 'der', type: 'spki' }).toString('hex')
const privHex = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex')

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, privHex, 'utf8')

console.log('Private key written to keys/update-key.priv (gitignored). BACK THIS FILE UP.')
console.log('')
console.log('Paste this PUBLIC key into UPDATE_PUBLIC_KEY_HEX in electron/updater-util.js:')
console.log(pubHex)
console.log('')
console.log('Then sign each release artifact: node scripts/sign-update.js <file>')
