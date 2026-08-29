'use strict'

/* MeshDrop claim page — static, zero-backend.
 *
 * Reads the drop code from the URL:
 *   /d/CODE        (path — works on GitHub Pages via 404.html, Cloudflare via _redirects)
 *   #/d/CODE       (hash — works on any static host, useful for local preview)
 *   ?c=CODE        (query — simplest for local preview / tests)
 * With a code: renders the claim view, tries the meshdrop:// deep link once,
 * and falls back to the platform download. Without a code: landing view.
 *
 * Everything is client-side. No requests are made to any server besides the
 * static files themselves.
 */

const REPO = 'https://github.com/aamirali51/meshdrop-releases'
const VERSION = '1.0.53' // bump on each release
const RELEASES = REPO + '/releases'

// Direct asset URLs for the current release. Update VERSION above when you cut a release.
const ASSETS = {
  win: REPO + '/releases/download/v' + VERSION + '/MeshDrop-Setup-' + VERSION + '.exe',
  mac: REPO + '/releases/download/v' + VERSION + '/MeshDrop-' + VERSION + '-mac-arm64.dmg',
  linux: REPO + '/releases/download/v' + VERSION + '/MeshDrop-' + VERSION + '-linux-x86_64.AppImage'
}

const OS_ORDER = ['win', 'mac', 'linux']
const OS_LABEL = { win: 'Windows', mac: 'macOS', linux: 'Linux' }

const DEEP_LINK_FALLBACK_MS = 3200 // how long to wait for the app to steal focus

function $(id) {
  return document.getElementById(id)
}

function setText(id, value) {
  const el = $(id)
  if (el) el.textContent = value
}

/* ─── URL parsing ──────────────────────────────────────────────────────── */

function getCode() {
  const path = location.pathname.match(/\/(?:d|drop)\/([A-Za-z0-9_-]+)/)
  if (path) return path[1]
  const hash = location.hash.match(/(?:d|drop)\/([A-Za-z0-9_-]+)/)
  if (hash) return hash[1]
  const q = new URLSearchParams(location.search)
  return q.get('c') || q.get('code')
}

function getParam(name) {
  return new URLSearchParams(location.search).get(name)
}

/* ─── OS detection ────────────────────────────────────────────────────── */

function detectOS() {
  const ua = navigator.userAgent
  if (/windows/i.test(ua)) return 'win'
  if (/macintosh|mac os x/i.test(ua)) return 'mac'
  if (/linux/i.test(ua)) return 'linux'
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  return null
}

function formatBytes(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const decimals = i === 0 || v >= 10 ? 0 : 1
  return v.toFixed(decimals) + ' ' + units[i]
}

/* ─── Views ───────────────────────────────────────────────────────────── */

function show(view) {
  $('claim').classList.toggle('hidden', view !== 'claim')
  $('landing').classList.toggle('hidden', view !== 'landing')
}

function wireDownload(anchor, os) {
  if (os && ASSETS[os]) {
    anchor.href = ASSETS[os]
    anchor.querySelector('.os').textContent = OS_LABEL[os]
  } else {
    anchor.href = RELEASES
    anchor.querySelector('.os').textContent = 'Desktop'
  }
}

function renderLanding(os) {
  show('landing')

  for (const key of OS_ORDER) {
    const btn = $('dl-' + key)
    btn.href = ASSETS[key]
    btn.querySelector('.os').textContent = OS_LABEL[key]
    btn.classList.toggle('active', key === os)
  }

  if (os === 'android') {
    setText('os-note', 'Android app is in development — check back soon. For now, use MeshDrop on a computer.')
  } else if (os === 'ios') {
    setText('os-note', 'iOS support is coming soon — for now, use MeshDrop on a computer.')
  } else {
    setText('os-note', '')
  }

  // People who already have the app shouldn't be funneled only into Download.
  const openLanding = $('btn-open-landing')
  if (openLanding) openLanding.addEventListener('click', function () { tryOpen('meshdrop://', 'landing-open-note') })
}

function renderClaim(code, os) {
  show('claim')

  const safe = String(code).toUpperCase()
  setText('claim-code', safe.indexOf('DROP-') === 0 ? safe : 'DROP-' + safe)
  setText('claim-file', fileLine())
  document.title = "You've received a drop — MeshDrop"

  const dl = $('btn-download')
  wireDownload(dl, os)
  if (os) $('btn-download').querySelector('.os').textContent = OS_LABEL[os]

  $('btn-open').addEventListener('click', function () {
    openApp(safe)
  })

  // Attempt the deep link once on load; the fallback note appears if the app
  // never took focus (i.e. it isn't installed).
  window.setTimeout(function () {
    openApp(safe)
  }, 400)
}

function fileLine() {
  // Optional metadata the sender's app can include: ?n=name&s=bytes&a=author
  const parts = []
  const name = getParam('n')
  const size = formatBytes(getParam('s'))
  const author = getParam('a')
  if (name) parts.push(name)
  if (size) parts.push(size)
  if (parts.length) return parts.join(' · ')
  if (author) return 'A drop from ' + author
  return 'Open it in MeshDrop to receive the file.'
}

/* ─── Deep link ───────────────────────────────────────────────────────── */

let appOpened = false

window.addEventListener('blur', function () {
  appOpened = true
})
document.addEventListener('visibilitychange', function () {
  if (document.hidden) appOpened = true
})

function tryOpen(url, noteId) {
  const note = $(noteId)
  appOpened = false
  if (note) note.textContent = 'Opening MeshDrop…'
  try {
    window.location.href = url
  } catch (err) {
    if (note) note.textContent = 'Your browser blocked the link. Try again and allow it, or download the app below.'
    return
  }
  // The page can't query whether the app is installed (browsers don't expose
  // that). We detect a launch by watching for the browser tab losing focus —
  // a real app launch steals it. If that never happens, show the fallback.
  window.setTimeout(function () {
    if (!appOpened && note) {
      note.textContent =
        "Didn't open? Your browser may be showing an \"Open MeshDrop?\" prompt (click Allow), or the app isn't installed — download it below."
    }
  }, DEEP_LINK_FALLBACK_MS)
}

function openApp(code) {
  tryOpen('meshdrop://drop/' + code, 'fallback-note')
}

/* ─── Init ────────────────────────────────────────────────────────────── */

const os = detectOS()
const code = getCode()
if (code) {
  renderClaim(code, os)
} else {
  renderLanding(os)
}
