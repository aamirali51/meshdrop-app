// Fetches and installs the bundled ffmpeg/ffprobe binaries used by the watch
// party remux seam (electron/remux.js). The binaries live in
//   vendor/ffmpeg/<platform>/ffmpeg[.exe]  and  ffprobe[.exe]
// and are shipped via forge.config.js extraResource, so a packaged app finds
// them at resourcesPath/ffmpeg/<platform>/.
//
// Licensing: every source below is an LGPL build (no GPL-triggering encoders).
// MeshDrop only stream-copies the video track and re-encodes audio with
// ffmpeg's built-in AAC encoder, so LGPL suffices and the MIT posture stays
// clean.
//
// Sources are PINNED to specific releases so a rebuild is reproducible:
//   Windows: BtbN FFmpeg-Builds  n9.0  win64-lgpl
//   Linux:   BtbN FFmpeg-Builds  n9.0  linux64-lgpl
//   macOS:   EricEngineering/ffmpeg-macos-lgpl  ffmpeg-7.1-r2  universal2
// (BtbN publishes no macOS builds; the EricEngineering universal2 LGPL build
// covers both arm64 and x86_64 Macs with one binary.)
//
// Usage:
//   node scripts/fetch-ffmpeg.js            # all platforms
//   node scripts/fetch-ffmpeg.js win32      # just Windows
//   node scripts/fetch-ffmpeg.js darwin linux
//
// Downloads are cached in <repo>/vendor/.ffmpeg-cache/ and verified against
// the published SHA-256 before extraction. Set FETCH_FFMPEG_FORCE=1 to
// re-download even when the cache is warm.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawnSync } = require('child_process')
const { createHash } = require('crypto')
const https = require('https')

const ROOT = path.join(__dirname, '..')
const CACHE_DIR = path.join(ROOT, 'vendor', '.ffmpeg-cache')
const FORCE = process.env.FETCH_FFMPEG_FORCE === '1'

// One entry per platform. `url` is the pinned release asset; `sha256` is
// checked against the downloaded bytes; `extract` maps entries inside the
// archive to the files we keep.
const SOURCES = {
  win32: {
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-08-28-17-08/ffmpeg-n9.0.1-11-ge47273f4d9-win64-lgpl-9.0.zip',
    sha256: 'a9db905a437fb64e405fb60283af53886476a7f99ae471f901ef5a7eea3f9d6e',
    type: 'zip',
    // BtbN zips unpack to <name>/bin/ffmpeg.exe etc.
    extract: [
      { from: /bin[/\\]ffmpeg\.exe$/, to: 'ffmpeg.exe' },
      { from: /bin[/\\]ffprobe\.exe$/, to: 'ffprobe.exe' }
    ]
  },
  linux: {
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-08-28-17-08/ffmpeg-n9.0.1-11-ge47273f4d9-linux64-lgpl-9.0.tar.xz',
    sha256: '52a6a62dcba522110fd85c0e9ab96bc4558dbb221c33b7340de5abf42266da70',
    type: 'tar',
    // BtbN tarballs unpack to <name>/bin/ffmpeg etc.
    extract: [
      { from: /bin[/\\]ffmpeg$/, to: 'ffmpeg' },
      { from: /bin[/\\]ffprobe$/, to: 'ffprobe' }
    ]
  },
  darwin: {
    url: 'https://github.com/EricEngineering/ffmpeg-macos-lgpl/releases/download/ffmpeg-7.1-r2/ffmpeg-macos-lgpl-universal2.tar.gz',
    sha256: 'c725431e0b073bad12619d53c6d759b399ee84450790a8d681ecbb4066bf1194',
    type: 'tar',
    // The universal2 tarball has ffmpeg/ffprobe at the archive root.
    extract: [
      { from: /(^|[/\\])ffmpeg$/, to: 'ffmpeg' },
      { from: /(^|[/\\])ffprobe$/, to: 'ffprobe' }
    ]
  }
}

function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    const s = fs.createReadStream(p)
    s.on('data', (d) => h.update(d))
    s.on('end', () => resolve(h.digest('hex')))
    s.on('error', reject)
  })
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const req = https.get(url, { headers: { 'User-Agent': 'meshdrop-fetch-ffmpeg' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        fs.unlinkSync(dest)
        return download(res.headers.location, dest).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest)
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
    })
    req.on('error', (err) => { file.close(); fs.unlinkSync(dest); reject(err) })
  })
}

function ensureFetched(platform, src) {
  const cacheName = path.basename(new URL(src.url).pathname)
  const cachePath = path.join(CACHE_DIR, cacheName)
  if (FORCE || !fs.existsSync(cachePath) || fs.statSync(cachePath).size === 0) {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    console.log(`[fetch-ffmpeg] downloading ${cacheName}...`)
    return download(src.url, cachePath).then(() => cachePath)
  }
  return Promise.resolve(cachePath)
}

function extractZip(archive, destDir) {
  // Use PowerShell Expand-Archive (available on every Windows box) to unpack
  // to a temp dir, then move the two binaries out.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meshdrop-ffmpeg-'))
  const r = spawnSync('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${tmp}' -Force`
  ], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('Expand-Archive failed: ' + r.stderr)
  return { tmp, walk: (cb) => walkDir(tmp, cb) }
}

function extractTar(archive, destDir) {
  // tar handles .tar.xz and .tar.gz on Windows 10+ (bsdtar) and always on
  // macOS/Linux.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meshdrop-ffmpeg-'))
  const r = spawnSync('tar', ['-xf', archive, '-C', tmp], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('tar extraction failed: ' + r.stderr)
  return { tmp, walk: (cb) => walkDir(tmp, cb) }
}

function walkDir(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkDir(full, cb)
    else cb(full)
  }
}

async function installPlatform(platform) {
  const src = SOURCES[platform]
  if (!src) {
    console.warn(`[fetch-ffmpeg] no source for platform '${platform}' (win32|linux|darwin)`)
    return false
  }
  const destDir = path.join(ROOT, 'vendor', 'ffmpeg', platform)
  fs.mkdirSync(destDir, { recursive: true })

  // Warm cache check: if both binaries exist and match size, skip.
  const exe = platform === 'win32' ? '.exe' : ''
  const existingFfmpeg = path.join(destDir, `ffmpeg${exe}`)
  const existingFfprobe = path.join(destDir, `ffprobe${exe}`)
  if (!FORCE && fs.existsSync(existingFfmpeg) && fs.existsSync(existingFfprobe)) {
    console.log(`[fetch-ffmpeg] ${platform}: already installed (use FETCH_FFMPEG_FORCE=1 to re-fetch)`)
    return true
  }

  const archive = await ensureFetched(platform, src)
  const actual = await sha256File(archive)
  if (actual !== src.sha256) {
    throw new Error(`SHA-256 mismatch for ${platform}: expected ${src.sha256}, got ${actual}`)
  }
  console.log(`[fetch-ffmpeg] ${platform}: checksum ok`)

  const { tmp, walk } = src.type === 'zip' ? extractZip(archive, destDir) : extractTar(archive, destDir)
  const wanted = new Map(src.extract.map((e) => [e.to, e.from]))
  const found = new Set()
  walk((filePath) => {
    const rel = path.relative(tmp, filePath).replace(/\\/g, '/')
    for (const [to, re] of wanted) {
      if (re.test(rel)) {
        fs.copyFileSync(filePath, path.join(destDir, to))
        found.add(to)
      }
    }
  })
  fs.rmSync(tmp, { recursive: true, force: true })

  for (const to of wanted.keys()) {
    if (!found.has(to)) throw new Error(`missing ${to} in archive for ${platform}`)
  }
  // Executable bit on unix.
  if (platform !== 'win32') {
    fs.chmodSync(existingFfmpeg, 0o755)
    fs.chmodSync(existingFfprobe, 0o755)
  }
  console.log(`[fetch-ffmpeg] ${platform}: installed -> ${destDir}`)
  return true
}

async function main() {
  const requested = process.argv.slice(2)
  const platforms = requested.length ? requested : Object.keys(SOURCES)
  let ok = true
  for (const p of platforms) {
    try {
      ok = (await installPlatform(p)) && ok
    } catch (err) {
      ok = false
      console.error(`[fetch-ffmpeg] ${p} FAILED:`, err.message)
    }
  }
  process.exit(ok ? 0 : 1)
}

main()
