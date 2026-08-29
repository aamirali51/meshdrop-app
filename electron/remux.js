'use strict'

// Remux seam for Watch Party capability negotiation. Everything here is the
// ffmpeg half of "the host decides": locate bundled ffmpeg/ffprobe, probe a
// file's codecs, and stream a container/audio rebuild with the VIDEO STREAM
// COPIED (-c:v copy) — no re-encode, so no GPU and near-zero CPU.
//
// The remuxed bytes are streamed straight to the HTTP response and never
// written to disk, matching the engine's "nothing lands in .p2p-staging"
// constraint. Every child process is tracked so a client disconnect or revoke
// kills it — an orphaned ffmpeg holds a file handle on somebody's library
// drive.

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

// Process.env overrides (tests, or a machine with a known good build):
//   MESHDROP_FFMPEG / MESHDROP_FFPROBE — explicit paths, trusted verbatim.
//   MESHDROP_NO_REMUX — '1' disables remux entirely (refuse fallback).
const ENV_FFMPEG = process.env.MESHDROP_FFMPEG || ''
const ENV_FFPROBE = process.env.MESHDROP_FFPROBE || ''
const NO_REMUX = process.env.MESHDROP_NO_REMUX === '1'

// Bundled binaries live at <app>/vendor/ffmpeg/<platform>/ and are shipped via
// electron-builder extraResources. `process.resourcesPath` is the packaged
// app's resources dir; in dev it falls back to the repo tree.
function vendorDir() {
  const platform = process.platform // win32 | darwin | linux
  const candidates = []
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'ffmpeg', platform))
  }
  candidates.push(path.join(__dirname, '..', 'vendor', 'ffmpeg', platform))
  return candidates.find((dir) => fs.existsSync(dir)) || candidates[0]
}

let resolved = null

function resolveFfmpeg() {
  if (resolved) return resolved
  const dir = vendorDir()
  const exe = process.platform === 'win32' ? '.exe' : ''
  const candidates = {
    ffmpeg: [
      ENV_FFMPEG,
      path.join(dir, `ffmpeg${exe}`)
    ].filter(Boolean),
    ffprobe: [
      ENV_FFPROBE,
      path.join(dir, `ffprobe${exe}`)
    ].filter(Boolean)
  }
  const ffmpeg = candidates.ffmpeg.find((p) => fs.existsSync(p))
  const ffprobe = candidates.ffprobe.find((p) => fs.existsSync(p))
  resolved = {
    ffmpeg: ffmpeg || null,
    ffprobe: ffprobe || null,
    available: !NO_REMUX && !!(ffmpeg && ffprobe),
    source: ffmpeg ? (ENV_FFMPEG ? 'env' : 'bundled') : null,
    disabled: NO_REMUX
  }
  return resolved
}

// Invalidate so tests can flip env and re-resolve.
function resetFfmpeg() {
  resolved = null
}

// Track every running remux child. Keyed by a caller token so a route can kill
// exactly the process it owns (e.g. on socket close).
const active = new Map() // token -> ChildProcess

function killRemux(token) {
  const child = active.get(token)
  if (child) {
    try { child.kill('SIGKILL') } catch {}
    active.delete(token)
  }
}

function killAllRemux() {
  for (const child of active.values()) {
    try { child.kill('SIGKILL') } catch {}
  }
  active.clear()
}

// Probe a file's codecs with ffprobe. Returns null on any failure (no binary,
// unreadable file, not a video) so callers degrade to direct/refuse.
function probeMedia(filePath) {
  return new Promise((resolve) => {
    const { ffprobe } = resolveFfmpeg()
    if (!ffprobe) return resolve(null)
    let stdout = ''
    let settled = false
    const child = spawn(ffprobe, [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name',
      '-of', 'json',
      filePath
    ], { windowsHide: true })
    const timer = setTimeout(() => {
      if (!settled) { settled = true; try { child.kill() } catch {}; resolve(null) }
    }, 15000)
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', () => {})
    child.on('error', () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(null) }
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) return resolve(null)
      try {
        const parsed = JSON.parse(stdout)
        const video = (parsed.streams || []).find((s) => s.codec_type === 'video')
        const audio = (parsed.streams || []).find((s) => s.codec_type === 'audio')
        resolve({
          videoCodec: video?.codec_name || null,
          audioCodec: audio?.codec_name || null,
          container: path.extname(filePath || '').replace('.', '').toLowerCase() || null
        })
      } catch {
        resolve(null)
      }
    })
  })
}

// Start a remux of `filePath` to MP4 (video stream copied, audio rebuilt to
// AAC). Returns { stream, kill }. `stream` is the child's stdout, piped when
// the HTTP layer is ready; `kill` tears the process down. The child is also
// registered under `token` so killRemux(token) works from a socket close.
function startRemux(filePath, { token = null, seekSec = 0 } = {}) {
  const { ffmpeg, available } = resolveFfmpeg()
  if (!available || !ffmpeg) {
    const err = new Error('ffmpeg is not available on this host')
    err.code = 'NO_FFMPEG'
    throw err
  }
  if (!fs.existsSync(filePath)) {
    const err = new Error(`file not found: ${filePath}`)
    err.code = 'ENOENT'
    throw err
  }

  const args = ['-hide_banner', '-loglevel', 'error', '-i', filePath]
  if (seekSec > 0) args.push('-ss', String(seekSec))
  args.push(
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-movflags', '+faststart+frag_keyframe+empty_moov',
    '-f', 'mp4',
    'pipe:1'
  )

  const child = spawn(ffmpeg, args, { windowsHide: true })
  if (token) active.set(token, child)

  // ffmpeg writes its progress/errors to stderr; forward a short tail so the
  // HTTP layer can log a real reason when a remux dies.
  let stderrTail = ''
  child.stderr.on('data', (d) => {
    stderrTail = (stderrTail + d).slice(-2000)
  })
  child.on('exit', (code) => {
    if (token) active.delete(token)
    if (code !== 0 && code !== null) {
      console.warn(`[remux] ffmpeg exited ${code}: ${stderrTail.slice(-500)}`)
    }
  })

  return {
    stream: child.stdout,
    kill: () => { try { child.kill('SIGKILL') } catch {} },
    get stderrTail() { return stderrTail }
  }
}

module.exports = {
  resolveFfmpeg,
  resetFfmpeg,
  probeMedia,
  startRemux,
  killRemux,
  killAllRemux
}
