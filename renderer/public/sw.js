'use strict'
// MeshDrop service worker — caches ONLY the static UI shell. Every API/WS/
// media/proxy route bypasses the cache and goes straight to the network.
//
// SACRED RULE: never cache /rpc, /events (WS), /import, /files/, /stream,
// /fs/* (drives/list). These are data/control paths; stale or opaque
// caching would corrupt transfers, identity, and diagnostics.

const CACHE_NAME = 'meshdrop-shell-v1'

function isNetworkOnlyPath(pathname) {
  if (pathname === '/rpc' || pathname === '/events' || pathname === '/import') return true
  if (pathname.startsWith('/files/')) return true
  if (pathname.startsWith('/stream')) return true
  if (pathname.startsWith('/fs/')) return true
  return false
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(['/', '/index.html', '/manifest.webmanifest']))
      .catch(() => {})
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  let pathname = ''
  try { pathname = new URL(req.url).pathname } catch { return }
  if (isNetworkOnlyPath(pathname)) return

  const isNavigation = req.mode === 'navigate'
  const isAsset = pathname.startsWith('/assets/') || pathname.startsWith('/icons/')

  if (isNavigation) {
    event.respondWith(
      (async () => {
        const cached = await caches.match('/index.html')
        event.waitUntil(
          fetch(req).then((res) => {
            if (res && res.ok) { const clone=res.clone(); caches.open(CACHE_NAME).then((c)=>c.put('/index.html', clone)) }
          }).catch(()=>{})
        )
        if (cached) return cached
        try {
          const res = await fetch(req)
          if (res && res.ok) { const clone=res.clone(); caches.open(CACHE_NAME).then((c)=>c.put('/index.html', clone)) }
          return res
        } catch { return cached || fetch(req) }
      })()
    )
    return
  }

  if (isAsset) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        try {
          const res = await fetch(req)
          if (res && res.ok) { const clone=res.clone(); caches.open(CACHE_NAME).then((c)=>c.put(req, clone)) }
          return res
        } catch { throw new Error('offline and not cached') }
      })()
    )
  }
})
