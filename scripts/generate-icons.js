'use strict'

// MeshDrop app icon generator — pure Node (no dependencies).
//
//   node scripts/generate-icons.js
//
// Reproduces the in-app CSS logo (renderer `.gradient-brand` tile + the
// lucide-react `Waypoints` glyph) as real icon assets, so the OS icon, the
// exe, and the system tray all match the sidebar logo:
//   build/icon.png            1024px master (electron-builder linux icon)
//   build/icon.ico            16/24/32/48/64/128/256 (Windows exe + shortcuts)
//   build/icon.icns           16..1024 (macOS)
//   build/icon/icon-*.png     16/32/64/128/256 (forge AppImage/Flatpak icons)
//   build/icon/tray-*.png     16px 1x / 32px 2x (system tray)
//
// PNG/ICO/ICNS are written directly (zlib is built into Node), so this runs
// on any platform without a rasterizer or ImageMagick.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const OUT_DIR = path.join(__dirname, '..', 'build')

// ─── Master render (2048, supersampled, downsampled to 1024) ────────────────

const SCALE = 2048

// `.gradient-brand` in renderer/src/index.css:
//   linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)
// 135deg runs top-left -> bottom-right, violet at the center diagonal.
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

// Rounded-rect signed distance (unit space, rect [0,1]^2, radius r).
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

// ─── The Waypoints glyph (lucide-react, 24x24 viewBox) ──────────────────────
// Extracted verbatim from node_modules/lucide-react/dist/esm/icons/waypoints.mjs
// so the icon is byte-for-byte the in-app logo glyph.

const WAYPOINTS = {
  lines: [
    [10.586, 5.414, 5.414, 10.586], // m10.586 5.414-5.172 5.172
    [18.586, 13.414, 13.414, 18.586], // m18.586 13.414-5.172 5.172
    [6, 12, 18, 12] // M6 12h12
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

// Glyph occupies ~53% of the canvas, centered (matches the in-app tile where
// the icon is roughly half the tile).
const GLYPH_K = 0.022 // unit per 24-box coordinate
const glyphX = (gx) => (gx - 12) * GLYPH_K + 0.5
const glyphY = (gy) => (gy - 12) * GLYPH_K + 0.5
const GLYPH_LINE_HW = (WAYPOINTS.stroke / 2) * GLYPH_K
const GLYPH_NODE_R = (WAYPOINTS.nodeR + WAYPOINTS.stroke / 2) * GLYPH_K

function glyphSd(x, y) {
  let d = 1e9
  for (const [ax, ay, bx, by] of WAYPOINTS.lines) {
    d = Math.min(d, sdSegment(x, y, glyphX(ax), glyphY(ay), glyphX(bx), glyphY(by)) - GLYPH_LINE_HW)
  }
  for (const [nx, ny] of WAYPOINTS.nodes) {
    d = Math.min(d, sdCircle(x, y, glyphX(nx), glyphY(ny), GLYPH_NODE_R))
  }
  return d
}

// Background: `.gradient-brand` 135deg rounded square.
function shadeBackground(x, y) {
  const dBg = sdRoundRect(x, y, 0.175)
  if (dBg > 0.004) return null
  const t = clamp01((x + y) / 2) // 135deg: top-left (0) -> bottom-right (1)
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
  // Subtle top-left sheen + edge vignette for a polished app icon (barely
  // changes the flat CSS look, adds depth at large sizes).
  const sheen = 1 - Math.hypot(x - 0.3, y - 0.24) / 0.55
  if (sheen > 0) {
    const w = sheen * sheen * 0.08
    r += (WHITE[0] - r) * w
    g += (WHITE[1] - g) * w
    b += (WHITE[2] - b) * w
  }
  const edge = smoothstep(0, 0.09, dBg)
  r *= 1 - 0.1 * edge
  g *= 1 - 0.1 * edge
  b *= 1 - 0.1 * edge
  return [r, g, b]
}

function renderMaster() {
  const size = SCALE
  const buf = Buffer.alloc(size * size * 4)
  const aa = (d) => 1 - smoothstep(0, 1.6 / SCALE, d)
  for (let py = 0; py < size; py++) {
    const y = (py + 0.5) / size
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size
      const bg = shadeBackground(x, y)
      let out = [0, 0, 0, 0]
      if (bg) {
        const c = aa(glyphSd(x, y))
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

// Fractional box filter: src (srcW) -> dst (dstW).
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
      let r = 0
      let g = 0
      let b = 0
      let a = 0
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

// ─── PNG encoder ─────────────────────────────────────────────────────────────

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
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

// ─── ICO / ICNS containers ───────────────────────────────────────────────────

function encodeICO(pngs) {
  // pngs: [{ size, data }] — size is the square edge length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(pngs.length, 4) // count
  const entries = []
  let offset = 6 + 16 * pngs.length
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4) // planes
    e.writeUInt16LE(32, 6) // bpp
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    offset += data.length
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

function encodeICNS(pngs) {
  const entries = []
  let total = 8
  for (const { type, data } of pngs) {
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(8 + data.length, 4)
    entries.push(head, data)
    total += 8 + data.length
  }
  const out = Buffer.alloc(total)
  out.write('icns', 0, 'ascii')
  out.writeUInt32BE(total, 4)
  let off = 8
  for (const e of entries) {
    e.copy(out, off)
    off += e.length
  }
  return out
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  fs.mkdirSync(path.join(OUT_DIR, 'icon'), { recursive: true })
  const master = downsample(renderMaster(), SCALE, SCALE, 1024, 1024)
  const pngOf = (size) => encodePNG(size, size, downsample(master, 1024, 1024, size, size))

  fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), pngOf(1024))
  console.log('wrote build/icon.png (1024) — in-app Waypoints logo')

  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), encodeICO(icoSizes.map((s) => ({ size: s, data: pngOf(s) }))))
  console.log(`wrote build/icon.ico (${icoSizes.join('/')})`)

  const icnsTypes = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024]
  ]
  fs.writeFileSync(path.join(OUT_DIR, 'icon.icns'), encodeICNS(icnsTypes.map(([type, s]) => ({ type, data: pngOf(s) }))))
  console.log('wrote build/icon.icns (16..1024)')

  for (const s of [16, 32, 64, 128, 256]) {
    fs.writeFileSync(path.join(OUT_DIR, 'icon', `icon-${s}x${s}.png`), pngOf(s))
  }
  console.log('wrote build/icon/icon-{16,32,64,128,256}x*.png')

  fs.writeFileSync(path.join(OUT_DIR, 'icon', 'tray-16x16.png'), pngOf(16))
  fs.writeFileSync(path.join(OUT_DIR, 'icon', 'tray-32x32.png'), pngOf(32))
  console.log('wrote build/icon/tray-16x16.png + tray-32x32.png')
  console.log('done')
}

main()
