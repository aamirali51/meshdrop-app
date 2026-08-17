// Verifies a freshly built engine bundle loads in the Bare worklet.
//
// Context: the worklet evaluates every module in the bundle as a PLAIN SCRIPT
// (bare-bundle format: modules are packed into one byte array and each file's
// source is sliced out and run like a script inside its own scope). A module
// whose source contains TOP-LEVEL `await` (or other module-only syntax) is a
// SyntaxError there:
//   "SyntaxError: await is only valid in async functions and the top level
//   bodies of modules"
// which is exactly what crashed the app after a clean `npm run build:engine`.
//
// bare-bundle container layout (see node_modules/bare-bundle/index.js):
//   <len>\n<JSON header>\n<concatenated file sources>
//   header.files = { "<path>": { offset, length, mode } }
//
// This script splits every file out and parses each one with @babel/parser in
// `sourceType: 'script'` — the same grammar the embedded V8 enforces per
// module. It reports the offending module(s) with their source excerpts.
//
// Usage: node scripts/check-bundle.js [path-to-bundle]
// Exit codes: 0 OK | 1 bundle unreadable | 2 a module fails plain-script parse

const fs = require('fs')
const path = require('path')
const parser = require('@babel/parser')

const bundlePath = process.argv[2] || path.join(__dirname, '..', 'src', 'engine', 'mesh-engine.bundle.js')
const bundleName = path.basename(bundlePath)

if (!fs.existsSync(bundlePath)) {
  console.error(`[check-bundle] missing bundle: ${bundlePath}`)
  process.exit(1)
}

const raw = fs.readFileSync(bundlePath, 'utf8')
const m = raw.match(/^module\.exports\s*=\s*("[\s\S]*")\s*;?\s*$/)
if (!m) {
  console.error('[check-bundle] unrecognized bundle format (expected module.exports = "<string>")')
  console.error(raw.slice(0, 120))
  process.exit(1)
}

let inner
try {
  inner = JSON.parse(m[1])
} catch (err) {
  console.error('[check-bundle] outer bundle string is not valid JSON:', err.message)
  process.exit(1)
}

// The inner payload is `<len>\n<JSON header>\n<concatenated file sources>`.
const lenEnd = /\d+/.exec(inner)[0].length
const headerLen = parseInt(inner.slice(0, lenEnd), 10)
// bare-bundle writes `\n${JSON.stringify(header)}\n` as the header blob, so
// the JSON (with both newlines) occupies exactly headerLen bytes.
const header = JSON.parse(inner.slice(lenEnd, lenEnd + headerLen))
// Offsets in the header are BYTE offsets into the packed body, so slice the
// body as a Buffer and decode each module per-file.
const body = Buffer.from(inner.slice(lenEnd + headerLen), 'utf8')

const files = header.files || {}
const entries = Object.entries(files)
console.log(`[check-bundle] ${bundleName}: header ${headerLen}B, ${entries.length} module file(s), body ${body.length} chars`)

const jsFiles = entries.filter(([file, info]) => /\.(js|cjs|mjs)$/.test(file))
let failed = 0
for (const [file, info] of jsFiles) {
  const source = body.slice(info.offset, info.offset + info.length).toString('utf8')
  if (!source.length) continue
  try {
    parser.parse(source, { sourceType: 'script' })
  } catch (err) {
    failed++
    const line = err.loc ? err.loc.line : '?'
    const col = err.loc ? err.loc.column : '?'
    console.error(`[check-bundle] FAIL ${file} (line ${line}:${col}): ${err.message}`)
    const excerptLines = source.split('\n')
    if (err.loc && excerptLines[err.loc.line - 1]) {
      console.error('  ' + excerptLines[err.loc.line - 1].slice(0, 160))
    }
  }
}

if (failed === 0) {
  console.log(`[check-bundle] OK — all ${jsFiles.length} modules parse as plain scripts`)
  process.exit(0)
}

console.error(`[check-bundle] ${failed} module(s) failed to parse as plain scripts.`)
console.error('[check-bundle] The Bare worklet runs each module as a script (not an ES module);')
console.error('[check-bundle] a top-level await crashes V8 with')
console.error('[check-bundle]   "SyntaxError: await is only valid in async functions and the top level bodies of modules"')
process.exit(2)