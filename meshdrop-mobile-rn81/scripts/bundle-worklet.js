// Regenerates src/worklet.bundle.js from nodejs-assets/nodejs-project using
// bare-pack (the Holepunch bundler for the Bare runtime). Run this whenever
// the engine (main.js / @mesh/core) changes, then rebuild the app.
//
//   node scripts/bundle-worklet.js
//
// --linked resolves native addons (udx-native etc.) via Bare's linked:
// mechanism instead of file: prebuilds.

const { execSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const entry = path.join(root, 'nodejs-assets', 'nodejs-project', 'main.js')
const builtins = path.join(__dirname, 'bare-builtins.json')
const out = path.join(root, 'src', 'worklet.bundle.js')

execSync(`npx bare-pack "${entry}" --out "${out}" --linked --host android-x64 --builtins "${builtins}"`, {
  cwd: root,
  stdio: 'inherit',
})

console.log('worklet bundle written to', out)
