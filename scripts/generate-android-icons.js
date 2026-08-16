'use strict'

// Generates Android App Launcher Icons (Standard, Round, and Adaptive v26+)
// for MeshDrop Mobile.
//
// Usage: node scripts/generate-android-icons.js

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const RES_DIR = path.join(__dirname, '..', 'meshdrop-mobile-rn81', 'android', 'app', 'src', 'main', 'res')

const SCALE = 1024

const INDIGO = [99, 102, 241] // #6366F1
const VIOLET = [139, 92, 246] // #8B5CF6
const CYAN = [6, 182, 212] // #06B6D4
const WHITE = [255, 255, 255]

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function sdRoundRect(x, y, r) {
  const qx = Math.abs(x - 0.5) - (0.5 - r)
  const qy = Math.abs(y - 0.5) - (0.5 - r)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
}

function sdCircle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r
}

function sdSegment(x, y, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const apx = x - ax
  const apy = y - ay
  const t = clamp01((apx * abx + apy * aby) / (abx * abx + aby * aby))
  return Math.hypot(apx - abx * t, apy - aby * t)
}

const WAYPOINTS = {
  lines: [
    [10.586, 5.414, 5.414, 10.586],
    [18.586, 13.414, 13.414, 18.586],
    [6, 12, 18, 12]
  ],
  nodes: [
    [12, 20],
    [12, 4],
    [20, 12],
    [4, 12]
  ],
  nodeR: 2,
  stroke: 2
}

function glyphSd(x, y, scale = 0.022, offsetX = 0.5, offsetY = 0.5) {
  const glyphX = (gx) => (gx - 12) * scale + offsetX
  const glyphY = (gy) => (gy - 12) * scale + offsetY
  const GLYPH_LINE_HW = (WAYPOINTS.stroke / 2) * scale
  const GLYPH_NODE_R = (WAYPOINTS.nodeR + WAYPOINTS.stroke / 2) * scale

  let d = 1e9
  for (const [ax, ay, bx, by] of WAYPOINTS.lines) {
    d = Math.min(d, sdSegment(x, y, glyphX(ax), glyphY(ay), glyphX(bx), glyphY(by)) - GLYPH_LINE_HW)
  }
  for (const [nx, ny] of WAYPOINTS.nodes) {
    d = Math.min(d, sdCircle(x, y, glyphX(nx), glyphY(ny), GLYPH_NODE_R))
  }
  return d
}

function shadeBackground(x, y, isRound = false) {
  const dMask = isRound ? sdCircle(x, y, 0.5, 0.5, 0.48) : sdRoundRect(x, y, 0.175)
  if (dMask > 0.004) return null
  const t = clamp01((x + y) / 2)
  let r, g, b
  if (t <= 0.5) {
    const w = t * 2
    r = INDIGO[0] + (VIOLET[0] - INDIGO[0]) * w
    g = INDIGO[1] + (VIOLET[1] - INDIGO[1]) * w
    b = INDIGO[2] + (VIOLET[2] - INDIGO[2]) * w
  } else {
    const w = (t - 0.5) * 2
    r = VIOLET[0] + (CYAN[0] - VIOLET[0]) * w
    g = VIOLET[1] + (CYAN[1] - VIOLET[1]) * w
    b = VIOLET[2] + (CYAN[2] - VIOLET[2]) * w
  }
  const sheen = 1 - Math.hypot(x - 0.3, y - 0.24) / 0.55
  if (sheen > 0) {
    const w = sheen * sheen * 0.08
    r += (WHITE[0] - r) * w
    g += (WHITE[1] - g) * w
    b += (WHITE[2] - b) * w
  }
  const edge = smoothstep(0, 0.09, dMask)
  r *= 1 - 0.1 * edge
  g *= 1 - 0.1 * edge
  b *= 1 - 0.1 * edge
  return [r, g, b]
}

function renderMasterSquare() {
  const size = SCALE
  const buf = Buffer.alloc(size * size * 4)
  const aa = (d) => 1 - smoothstep(0, 1.6 / SCALE, d)
  for (let py = 0; py < size; py++) {
    const y = (py + 0.5) / size
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size
      const bg = shadeBackground(x, y, false)
      let out = [0, 0, 0, 0]
      if (bg) {
        const c = aa(glyphSd(x, y, 0.022, 0.5, 0.5))
        if (c > 0) {
          bg[0] = bg[0] + (WHITE[0] - bg[0]) * c
          bg[1] = bg[1] + (WHITE[1] - bg[1]) * c
          bg[2] = bg[2] + (WHITE[2] - bg[2]) * c
        }
        out = [Math.round(bg[0]), Math.round(bg[1]), Math.round(bg[2]), 255]
      }
      const i = (py * size + px) * 4
      buf[i] = out[0]
      buf[i + 1] = out[1]
      buf[i + 2] = out[2]
      buf[i + 3] = out[3]
    }
  }
  return buf
}

function renderMasterRound() {
  const size = SCALE
  const buf = Buffer.alloc(size * size * 4)
  const aa = (d) => 1 - smoothstep(0, 1.6 / SCALE, d)
  for (let py = 0; py < size; py++) {
    const y = (py + 0.5) / size
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size
      const bg = shadeBackground(x, y, true)
      let out = [0, 0, 0, 0]
      if (bg) {
        const c = aa(glyphSd(x, y, 0.022, 0.5, 0.5))
        if (c > 0) {
          bg[0] = bg[0] + (WHITE[0] - bg[0]) * c
          bg[1] = bg[1] + (WHITE[1] - bg[1]) * c
          bg[2] = bg[2] + (WHITE[2] - bg[2]) * c
        }
        out = [Math.round(bg[0]), Math.round(bg[1]), Math.round(bg[2]), 255]
      }
      const i = (py * size + px) * 4
      buf[i] = out[0]
      buf[i + 1] = out[1]
      buf[i + 2] = out[2]
      buf[i + 3] = out[3]
    }
  }
  return buf
}

// Android Adaptive icon foreground (safe zone is inner 66/72dp, glyph in center)
function renderMasterForeground() {
  const size = SCALE
  const buf = Buffer.alloc(size * size * 4)
  const aa = (d) => 1 - smoothstep(0, 1.6 / SCALE, d)
  for (let py = 0; py < size; py++) {
    const y = (py + 0.5) / size
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size
      // Adaptive foreground uses smaller glyph scale so it fits inside the safe mask (66/108 of canvas)
      const c = aa(glyphSd(x, y, 0.015, 0.5, 0.5))
      let out = [0, 0, 0, 0]
      if (c > 0) {
        out = [255, 255, 255, Math.round(c * 255)]
      }
      const i = (py * size + px) * 4
      buf[i] = out[0]
      buf[i + 1] = out[1]
      buf[i + 2] = out[2]
      buf[i + 3] = out[3]
    }
  }
  return buf
}

function downsample(src, srcW, srcH, dstW, dstH) {
  const sx = srcW / dstW
  const sy = srcH / dstH
  const out = Buffer.alloc(dstW * dstH * 4)
  for (let dy = 0; dy < dstH; dy++) {
    const y0 = dy * sy
    const y1 = y0 + sy
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = dx * sx
      const x1 = x0 + sx
      let r = 0, g = 0, b = 0, a = 0
      for (let syi = Math.floor(y0); syi < Math.ceil(y1); syi++) {
        const wy = Math.min(syi + 1, y1) - Math.max(syi, y0)
        if (wy <= 0) continue
        const row = Math.min(syi, srcH - 1)
        for (let sxi = Math.floor(x0); sxi < Math.ceil(x1); sxi++) {
          const wx = Math.min(sxi + 1, x1) - Math.max(sxi, x0)
          if (wx <= 0) continue
          const col = Math.min(sxi, srcW - 1)
          const i = (row * srcW + col) * 4
          const w = wx * wy
          r += src[i] * w
          g += src[i + 1] * w
          b += src[i + 2] * w
          a += src[i + 3] * w
        }
      }
      const area = sx * sy
      const o = (dy * dstW + dx) * 4
      out[o] = Math.round(r / area)
      out[o + 1] = Math.round(g / area)
      out[o + 2] = Math.round(b / area)
      out[o + 3] = Math.round(a / area)
    }
  }
  return out
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePNG(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

const DENSITIES = [
  { dir: 'mipmap-mdpi', size: 48, fgSize: 108 },
  { dir: 'mipmap-hdpi', size: 72, fgSize: 162 },
  { dir: 'mipmap-xhdpi', size: 96, fgSize: 216 },
  { dir: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
  { dir: 'mipmap-xxxhdpi', size: 192, fgSize: 432 }
]

console.log('Rendering master icons...')
const masterSquare = renderMasterSquare()
const masterRound = renderMasterRound()
const masterFg = renderMasterForeground()

for (const d of DENSITIES) {
  const targetDir = path.join(RES_DIR, d.dir)
  fs.mkdirSync(targetDir, { recursive: true })

  // 1. ic_launcher.png
  const squareBuf = downsample(masterSquare, SCALE, SCALE, d.size, d.size)
  fs.writeFileSync(path.join(targetDir, 'ic_launcher.png'), encodePNG(d.size, d.size, squareBuf))

  // 2. ic_launcher_round.png
  const roundBuf = downsample(masterRound, SCALE, SCALE, d.size, d.size)
  fs.writeFileSync(path.join(targetDir, 'ic_launcher_round.png'), encodePNG(d.size, d.size, roundBuf))

  // 3. ic_launcher_foreground.png
  const fgBuf = downsample(masterFg, SCALE, SCALE, d.fgSize, d.fgSize)
  fs.writeFileSync(path.join(targetDir, 'ic_launcher_foreground.png'), encodePNG(d.fgSize, d.fgSize, fgBuf))

  console.log(`Generated ${d.dir} icons (${d.size}x${d.size}, fg ${d.fgSize}x${d.fgSize})`)
}

// 4. Create mipmap-anydpi-v26 adaptive XMLs
const anydpiDir = path.join(RES_DIR, 'mipmap-anydpi-v26')
fs.mkdirSync(anydpiDir, { recursive: true })

const adaptiveLauncherXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`

const adaptiveRoundXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`

fs.writeFileSync(path.join(anydpiDir, 'ic_launcher.xml'), adaptiveLauncherXml)
fs.writeFileSync(path.join(anydpiDir, 'ic_launcher_round.xml'), adaptiveRoundXml)

// 5. Create drawable/ic_launcher_background.xml (Gradient brand background)
const drawableDir = path.join(RES_DIR, 'drawable')
fs.mkdirSync(drawableDir, { recursive: true })

const backgroundDrawableXml = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <gradient
        android:angle="315"
        android:startColor="#6366F1"
        android:centerColor="#8B5CF6"
        android:endColor="#06B6D4"
        android:type="linear" />
</shape>
`
fs.writeFileSync(path.join(drawableDir, 'ic_launcher_background.xml'), backgroundDrawableXml)

// 6. Create values/colors.xml
const valuesDir = path.join(RES_DIR, 'values')
fs.mkdirSync(valuesDir, { recursive: true })
const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#6366F1</color>
    <color name="primary">#6366F1</color>
    <color name="background">#0A0E17</color>
</resources>
`
fs.writeFileSync(path.join(valuesDir, 'colors.xml'), colorsXml)

console.log('All Android icons and adaptive XMLs generated successfully!')
