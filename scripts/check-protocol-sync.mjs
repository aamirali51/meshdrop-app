// Drift guard: fails when src/shared/protocol.d.ts's METHODS/EVENTS literal
// blocks diverge from the runtime src/shared/protocol.js. Run in CI/precommit:
//   node scripts/check-protocol-sync.mjs
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const runtime = require(join(here, '../src/shared/protocol.js'))
const dts = readFileSync(join(here, '../src/shared/protocol.d.ts'), 'utf8')

function declaredKeys(blockName) {
  const start = dts.indexOf(`export declare const ${blockName}: {`)
  if (start < 0) throw new Error(`d.ts: ${blockName} block not found`)
  const end = dts.indexOf('\n}', start)
  const body = dts.slice(start, end)
  return new Set([...body.matchAll(/readonly ([A-Z_]+):/g)].map((m) => m[1]))
}

const problems = []
for (const blockName of ['METHODS', 'EVENTS']) {
  const declared = declaredKeys(blockName)
  const runtimeKeys = new Set(Object.keys(runtime[blockName]))
  for (const k of runtimeKeys) if (!declared.has(k)) problems.push(`${blockName}.${k} missing from protocol.d.ts`)
  for (const k of declared) if (!runtimeKeys.has(k)) problems.push(`${blockName}.${k} declared in d.ts but absent from protocol.js`)
}
if (problems.length) {
  console.error('protocol.d.ts is OUT OF SYNC with protocol.js:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log(`protocol.d.ts in sync (${Object.keys(runtime.METHODS).length} METHODS, ${Object.keys(runtime.EVENTS).length} EVENTS)`)
