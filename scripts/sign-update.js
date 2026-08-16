'use strict'

// Sign a release artifact (ed25519) so the portable self-updater can verify
// it. Writes `<file>.sig` (hex of the raw 64-byte signature) next to the
// artifact — upload that file to the release alongside the exe.
//
//   node scripts/sign-update.js path/to/MeshDrop-1.0.1-portable.exe
//
// The private key is read from keys/update-key.priv (hex pkcs8 DER) or from
// the MESHDROP_UPDATE_KEY environment variable. The public key must match
// UPDATE_PUBLIC_KEY_HEX in electron/updater-util.js.

const { sign, createPrivateKey } = require('crypto')
const fs = require('fs')
const path = require('path')

const target = process.argv[2]
if (!target) {
  console.error('Usage: node scripts/sign-update.js <file-to-sign>')
  process.exit(1)
}

const keyHex =
  process.env.MESHDROP_UPDATE_KEY || fs.readFileSync(path.join(__dirname, '..', 'keys', 'update-key.priv'), 'utf8').trim()

let privateKey
try {
  privateKey = createPrivateKey({ key: Buffer.from(keyHex, 'hex'), format: 'der', type: 'pkcs8' })
} catch (err) {
  console.error('Cannot load the update private key (keys/update-key.priv or MESHDROP_UPDATE_KEY):', err.message)
  process.exit(1)
}

// One-shot sign (buffers the file): Node's streaming createSign('ed25519')
// throws ERR_CRYPTO_INVALID_DIGEST on newer OpenSSL builds.
const signature = sign(null, fs.readFileSync(target), privateKey)

const outPath = target + '.sig'
fs.writeFileSync(outPath, signature.toString('hex'), 'utf8')
console.log(`Signed ${target}`)
console.log(`Wrote  ${outPath}`)
console.log('Upload this .sig file to the release alongside the artifact.')
