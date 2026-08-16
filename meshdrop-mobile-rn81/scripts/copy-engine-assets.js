// Ships the engine bundle + offloaded addon prebuilds into the Android APK
// assets, where EngineAssets.kt extracts them to <filesDir>/engine on first
// launch (mirrors lynko-mobile's copy-addons.js).
//
//   node scripts/copy-engine-assets.js

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const addonsSrc = path.join(root, 'src', 'engine', 'node_modules')
const bundleSrc = path.join(root, 'src', 'engine', 'mesh-engine.bundle.js')
const destRoot = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'engine')

if (!fs.existsSync(addonsSrc)) {
  console.error('[copy-engine-assets] no offloaded addons at', addonsSrc)
  console.error('[copy-engine-assets] run: node scripts/build-engine.js')
  process.exit(1)
}
if (!fs.existsSync(bundleSrc)) {
  console.error('[copy-engine-assets] no bundle at', bundleSrc)
  process.exit(1)
}

fs.rmSync(destRoot, { recursive: true, force: true })

let count = 0
let bytes = 0
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name)
    const d = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else {
      fs.copyFileSync(s, d)
      count++
      bytes += fs.statSync(s).size
    }
  }
}

copyDir(addonsSrc, path.join(destRoot, 'node_modules'))
fs.mkdirSync(destRoot, { recursive: true })
fs.copyFileSync(bundleSrc, path.join(destRoot, 'mesh-engine.bundle.js'))
count++
bytes += fs.statSync(bundleSrc).size

console.log(`[copy-engine-assets] shipped ${count} files (${Math.round(bytes / 1024)} KB) to ${destRoot}`)
