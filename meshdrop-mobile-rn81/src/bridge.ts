// RPC bridge to the embedded Bare Worklet thread (@mesh/core engine).
//
// Mirrors the lynko-mobile rnBridge pattern that works on device:
//   - the engine is packed by bare-pack into an APK asset
//     (engine/mesh-engine.bundle.js), read at runtime via react-native-fs
//   - the CJS wrapper (`module.exports = "<len>\n<json>"`) is EVALUATED to get
//     the raw length-prefixed payload the worklet wants — passing the raw file
//     crashes bare-bundle with INVALID_BUNDLE_HEADER
//   - the Worklet's `assets` option points at the extracted addon prebuilds
//     (<filesDir>/engine, populated by EngineAssets.kt)
//
// Protocol (same as desktop): newline-framed JSON over the worklet IPC.
//   RN -> Bare:  { id, method, params }
//   Bare -> RN:  { type: 'response', id, result|error }
//   Bare -> RN:  { type: 'event', event, data }
//   Bare -> RN:  { type: 'engine', status, ... }

import { Worklet } from 'react-native-bare-kit'
import { NativeModules } from 'react-native'
import RNFS from 'react-native-fs'
import b4a from 'b4a'

type Resolve = (value: any) => void
type Reject = (err: Error) => void

const pending = new Map<string, { resolve: Resolve; reject: Reject }>()
const listeners = new Map<string, Set<(data: any) => void>>()
let nextId = 1
let started = false
let worklet: Worklet | null = null

function emit(event: string, data: any) {
  const set = listeners.get(event)
  if (set) set.forEach((h) => h(data))
}

function handle(msg: any) {
  if (!msg || typeof msg !== 'object') return
  if (msg.type === 'response') {
    const p = pending.get(String(msg.id))
    if (!p) return
    pending.delete(String(msg.id))
    if (msg.error) p.reject(new Error(msg.error))
    else p.resolve(msg.result)
  } else if (msg.type === 'event') {
    emit(msg.event, msg.data)
  } else if (msg.type === 'engine') {
    emit('__engine', msg)
  } else if (msg.type === 'log') {
    const lvl = msg.level || 'info'
    const prefix = lvl === 'error' ? '[MDLOG worklet:ERR]' : lvl === 'warn' ? '[MDLOG worklet:WARN]' : '[MDLOG worklet]'
    console.log(`${prefix}`, msg.text)
  }
}

/** <filesDir>/engine — where EngineAssets.kt extracted the addon prebuilds. */
function getEngineAssetsDir(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const mod = NativeModules.MeshDropEngineAssets as {
        getEngineAssetsDir?: (cb: (dir: string) => void) => void
      }
      if (!mod?.getEngineAssetsDir) return resolve(null)
      mod.getEngineAssetsDir((dir: string) => resolve(dir))
    } catch {
      resolve(null)
    }
  })
}

/** Boot the Bare Worklet thread + engine. Safe to call once. */
export async function startBridge(): Promise<void> {
  if (started) return
  started = true

  try {
    const assetsDir = await getEngineAssetsDir()
    let engineBundle = ''
    try {
      console.log('[bridge] Reading fresh engine bundle from APK assets')
      engineBundle = await RNFS.readFileAssets('engine/mesh-engine.bundle.js', 'utf8')
      // Ensure local override in filesDir is updated with the latest bundle
      if (assetsDir) {
        const localDest = `${assetsDir}/mesh-engine.bundle.js`
        RNFS.writeFile(localDest, engineBundle, 'utf8').catch(() => {})
      }
    } catch (assetErr) {
      console.warn('[bridge] Could not read from assets, falling back to local filesDir:', assetErr)
      const localOverride = assetsDir ? `${assetsDir}/mesh-engine.bundle.js` : null
      if (localOverride && (await RNFS.exists(localOverride))) {
        engineBundle = await RNFS.readFile(localOverride, 'utf8')
      } else {
        throw assetErr
      }
    }

    // bare-pack emits a Metro-importable CJS wrapper; evaluating it against a
    // local module object yields the raw length-prefixed JSON payload the
    // worklet expects.
    const mod = { exports: {} } as { exports: any }
    const enginePayload = new Function('module', 'exports', engineBundle + '; return module.exports')(
      mod,
      {}
    )
    if (typeof enginePayload !== 'string' || enginePayload.length < 1000) {
      throw new Error('engine bundle asset unreadable or too small')
    }

    console.log('[MDLOG bridge] assetsDir =', assetsDir, '| bundle bytes =', engineBundle.length)
    console.log('[MDLOG bridge] creating Worklet...')
    const w = new Worklet({ assets: assetsDir ?? undefined })
    console.log('[MDLOG bridge] Worklet created, setting up IPC...')

    let buffer = ''
    w.IPC.on('data', (data: any) => {
      try {
        const str = typeof data === 'string' ? data : b4a.toString(data, 'utf8')
        buffer += str
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const parsed = JSON.parse(trimmed)
            console.log('[MDLOG bridge] IPC type:', parsed.type || 'unknown', parsed.event || parsed.method || '')
            handle(parsed)
          } catch (jsonErr) {
            console.error('[bridge] IPC JSON parse error:', String(jsonErr), 'raw:', trimmed.slice(0, 100))
          }
        }
      } catch (err) {
        console.error('[bridge] IPC chunk error:', String((err as Error)?.message || err))
      }
    })

    const downloadDir = RNFS.DownloadDirectoryPath || '/storage/emulated/0/Download'
    w.start('/app.bundle', enginePayload, [assetsDir || '', downloadDir])
    worklet = w

  } catch (err) {
    started = false
    console.error('[bridge] startBridge failed:', String((err as Error)?.message || err))
    emit('__engine', {
      type: 'engine',
      status: 'error',
      message: 'P2P engine unavailable: ' + String((err as Error)?.message || err),
    })
  }
}

/** Fire-and-forget a method on the engine, resolving with its result. */
export function call<T = any>(method: string, params?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!worklet) return reject(new Error('Bridge not started'))
    const id = String(nextId++)
    pending.set(id, { resolve, reject })
    try {
      const payload = JSON.stringify({ id, method, params: params || {} }) + '\n'
      worklet.IPC.write(b4a.from(payload))
    } catch (err) {
      pending.delete(id)
      reject(err as Error)
    }
  })
}

/** Subscribe to an engine event. Returns an unsubscribe function. */
export function on(event: string, handler: (data: any) => void): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event)!.add(handler)
  return () => listeners.get(event)?.delete(handler)
}
