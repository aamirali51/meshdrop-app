// Bundles the @mesh/core engine for the Bare Worklet.
//
// Two passes are required:
//   1. --linked bundle  -> records the native addons as `linked:` refs so the
//      worklet's require.addon knows they exist.
//   2. --offload-addons -> writes the actual addon prebuilds (.bare) to
//      src/engine/node_modules, which is shipped into the APK assets and
//      extracted to <filesDir>/engine by EngineAssets.kt.
//
//   node scripts/build-engine.js   (then: node scripts/copy-engine-assets.js)
//
// NOTE: --host android-x64 targets the x86_64 emulator. For arm64 devices
// rebuild with --host android-arm64 (both passes) and the matching addons.

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const root = path.join(__dirname, '..')
const entry = path.join(root, 'src', 'engine', 'index.js')
const out = path.join(root, 'src', 'engine', 'mesh-engine.bundle.js')
const addonsOut = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-addons-'))

const host = process.env.ENGINE_HOST || process.argv.slice(2).find(a => !a.startsWith('-')) || 'android-arm64'
// `fs` in @mesh/core (storage.js self-healing reset) is a Node builtin that
// bare-pack cannot resolve; map it to bare-fs, which the engine already uses.
const common = `--host ${host} --format bundle.cjs --imports ${path.join(root, 'scripts', 'engine-imports.json')}`
console.log(`[build-engine] Target host: ${host}`)

console.log('[build-engine] Pass 1: linked bundle...')
// Pass 1: linked bundle (records the addon map).
execSync(`npx bare-pack "${entry}" ${common} --linked --out "${out}"`, { cwd: root, stdio: 'inherit' })

console.log('[build-engine] Pass 2: offload addons...')
// Pass 2: offload the addon prebuilds.
execSync(`npx bare-pack "${entry}" ${common} --offload-addons --out "${path.join(addonsOut, 'offload.bundle.js')}"`, {
  cwd: root,
  stdio: 'inherit',
})

// Move the offloaded addons into src/engine/node_modules.
const src = path.join(addonsOut, 'node_modules')
const dest = path.join(root, 'src', 'engine', 'node_modules')
fs.rmSync(dest, { recursive: true, force: true })
if (fs.existsSync(src)) {
  fs.cpSync(src, dest, { recursive: true })
}
fs.rmSync(addonsOut, { recursive: true, force: true })

console.log('[build-engine] engine bundle written to', out)
