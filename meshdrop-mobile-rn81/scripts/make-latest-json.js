#!/usr/bin/env node
// Generates the latest.json manifest the in-app updater checks at launch.
//
// Reads versionCode/versionName from version.properties, sha256-hashes the
// built APK, and writes a manifest suitable for hosting on GitHub Releases
// (mirrors the desktop update feed) next to the APK.
//
//   npm run build:android:release
//   node scripts/make-latest-json.js [path/to/app-release.apk] [out.json]
//
// Set UPDATE_OWNER / UPDATE_REPO to override the default release host
// (aamirali51/meshdrop-releases). The url field uses GitHub's stable
// `releases/latest/download/<asset>` redirect so no release tag is hardcoded.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const root = path.join(__dirname, '..')
const apk =
  process.argv[2] ||
  path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
const out = process.argv[3] || path.join(root, 'latest.json')

const OWNER = process.env.UPDATE_OWNER || 'aamirali51'
const REPO = process.env.UPDATE_REPO || 'meshdrop-releases'

function readVersion() {
  const file = path.join(root, 'version.properties')
  const txt = fs.readFileSync(file, 'utf8')
  const get = (k) => {
    const line = txt.split('\n').find((l) => l.startsWith(k + '='))
    return line ? line.split('=')[1].trim() : null
  }
  return {
    versionCode: Number(get('versionCode')) || 0,
    versionName: get('versionName') || '0.0',
  }
}

if (!fs.existsSync(apk)) {
  console.error(`[latest.json] APK not found: ${apk}`)
  console.error('[latest.json] build it first: cd android && gradlew.bat assembleRelease')
  process.exit(1)
}

const { versionCode, versionName } = readVersion()
const bytes = fs.readFileSync(apk)
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')

const TAG = process.env.UPDATE_TAG || ''
const downloadUrl = TAG
  ? `https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/${path.basename(apk)}`
  : `https://github.com/${OWNER}/${REPO}/releases/latest/download/${path.basename(apk)}`

const manifest = {
  versionCode,
  versionName,
  url: downloadUrl,
  size: bytes.length,
  sha256,
  notes: '',
}

fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n')
console.log(`[latest.json] wrote ${out} (${manifest.versionName}, ${bytes.length} bytes)`)
console.log(JSON.stringify(manifest, null, 2))
