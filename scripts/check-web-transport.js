'use strict'

// Phase 2 Step 1 acceptance: a plain Node script constructs the web
// HttpTransport (the exact module the renderer uses when window.bridge is
// absent) and completes a settings.get round-trip against a spawned host,
// plus WS event delivery, the synthetic worker.ready, and the 403
// session-expired path.
//
// Run: node scripts/check-web-transport.js

const assert = require('assert')
const esbuild = require('esbuild')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const APP_ROOT = path.join(__dirname, '..')
const HOST_DIR = path.join(APP_ROOT, '..', 'meshdrop-host')

let passed = 0
let failed = 0
function check(name, cond, detail) {
  if (cond) {
    passed++
    console.log(`PASS  ${name}`)
  } else {
    failed++
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`)
  }
}

function tmpStore(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `meshdrop-wt-${tag}-`))
}

async function waitFor(predicate, what, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`timed out waiting for ${what}`)
}

async function main() {
  const store = tmpStore('t')
  const port = 42371
  console.log(`--- bundling renderer httpTransport for Node ---`)
  const outfile = path.join(store, 'httpTransport.cjs')
  await esbuild.build({
    entryPoints: [path.join(APP_ROOT, 'renderer', 'src', 'lib', 'httpTransport.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile,
    alias: {
      '@': path.join(APP_ROOT, 'renderer', 'src'),
      '@shared': path.join(APP_ROOT, 'src', 'shared')
    },
    logLevel: 'warning'
  })

  console.log(`--- spawning host (store ${store}, port ${port}) ---`)
  const host = spawn(process.execPath, [path.join(HOST_DIR, 'index.js'), '--storage', store, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe']
  })
  host.stdout.on('data', () => {})
  host.stderr.on('data', () => {})
  let killed = false
  const killHost = () => {
    if (killed) return
    killed = true
    host.kill()
    setTimeout(() => {
      try { fs.rmSync(store, { recursive: true, force: true }) } catch {}
    }, 500)
  }
  process.on('exit', killHost)

  let token = ''
  try {
    const hostJson = path.join(store, 'host.json')
    await waitFor(() => {
      try {
        const info = JSON.parse(fs.readFileSync(hostJson, 'utf8'))
        token = fs.readFileSync(info.tokenPath, 'utf8').trim()
        return token.length > 0
      } catch {
        return false
      }
    }, 'host api-token')
  } catch (err) {
    console.error(`FATAL: ${err.message}`)
    process.exitCode = 1
    killHost()
    return
  }
  check('host spawned and minted an api-token', token.length > 0)

  const { HttpTransport } = require(outfile)
  const transport = new HttpTransport({
    baseUrl: `http://127.0.0.1:${port}`,
    token
  })

  // worker.ready: pages subscribe before any call. Exactly one delivery per
  // socket open — either the host's genuine frame (engine boot race) or the
  // synthetic fallback for an already-running host, never both.
  let readyCount = 0
  transport.on('worker.ready', () => {
    readyCount++
  })
  const readyPromise = transport.ensureReady()

  // settings.get round trip — the Step-1 acceptance itself.
  const settings = await transport.call('settings.get')
  check('settings.get round trip over HTTP /rpc', settings && typeof settings.theme === 'string' && 'downloadDir' in settings)

  await readyPromise
  await new Promise((r) => setTimeout(r, 5000))
  check('worker.ready delivered exactly once (genuine or synthetic)', readyCount === 1, `count=${readyCount}`)

  // Event fan-out over the same WS (settings.update → settings.updated).
  const updated = new Promise((resolve) => {
    const unsub = transport.on('settings.updated', (data) => {
      unsub()
      resolve(data)
    })
    setTimeout(() => resolve(null), 10000)
  })
  const theme = settings.theme
  const upd = await transport.call('settings.update', { theme: 'wt-probe' })
  check('settings.update merged frame', upd && upd.theme === 'wt-probe')
  const evtData = await updated
  check('settings.updated event frame over WS', evtData && evtData.theme === 'wt-probe')
  await transport.call('settings.update', { theme })
  transport.destroy()

  // Synthetic-path scenario: connect to a host whose engine booted (and
  // broadcast its genuine worker.ready) BEFORE this socket opened. The
  // synthetic fallback must still deliver exactly one worker.ready.
  let ready2 = 0
  await new Promise((r) => setTimeout(r, 10000))
  const late = new HttpTransport({ baseUrl: `http://127.0.0.1:${port}`, token })
  late.on('worker.ready', () => {
    ready2++
  })
  const lateReady = late.ensureReady()
  await lateReady.catch(() => {})
  await new Promise((r) => setTimeout(r, 5000))
  check('already-running host: synthetic worker.ready delivered exactly once', ready2 === 1, `count=${ready2}`)
  late.destroy()

  // 403 path: a wrong token must surface the session-expired state.
  const bad = new HttpTransport({ baseUrl: `http://127.0.0.1:${port}`, token: 'wrong-token' })
  let expiredSeen = null
  try {
    await bad.call('settings.get')
  } catch (err) {
    expiredSeen = err.message
  }
  check('403 → session-expired error surfaced', typeof expiredSeen === 'string' && /Session expired/.test(expiredSeen), expiredSeen)

  bad.destroy()
  killHost()
  console.log(`---\nWeb transport acceptance: ${passed} PASS / ${failed} FAIL`)
  process.exitCode = failed > 0 ? 1 : 0
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exitCode = 1
})
