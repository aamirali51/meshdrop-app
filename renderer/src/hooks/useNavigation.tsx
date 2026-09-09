import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { NavRoute } from '@/types'

// Wave 1: reordered to match new Sidebar grouping (Share, Transfers, Devices,
// Sync, Watch Party, Shared Folders | MORE: Activity, Tunnels, Diagnostics,
// Settings, About) — History is last, kept only for deep-link redirect to
// /activity?view=history. Single source for shortcuts + validator + hints.
const ROUTE_ORDER: NavRoute[] = [
  '/dashboard',
  '/transfers',
  '/devices',
  '/sync',
  '/party',
  '/shared-folders',
  '/activity',
  '/tunnels',
  '/diagnostics',
  '/settings',
  '/about',
  '/history',
]

export const PAGE_TITLES: Record<NavRoute, string> = {
  '/dashboard': 'Share',
  '/devices': 'My Devices',
  '/sync': 'Sync Folders',
  '/party': 'Watch Party',
  '/shared-folders': 'Shared Folders',
  '/tunnels': 'Tunnels',
  '/transfers': 'Transfers',
  '/activity': 'Activity',
  '/history': 'History',
  '/diagnostics': 'Diagnostics',
  '/settings': 'Settings',
  '/about': 'About',
}

export const PAGE_SUBTITLES: Record<NavRoute, string> = {
  '/dashboard': 'Send files directly. No cloud.',
  '/transfers': 'Live progress of sends and receives.',
  '/devices': 'Your paired devices on the mesh.',
  '/sync': 'Keep folders in sync across devices.',
  '/party': 'Watch together in sync.',
  '/shared-folders': 'Files shared with you.',
  '/tunnels': 'Port tunnels over the mesh.',
  '/activity': 'Timeline of transfers and sessions.',
  '/history': 'Searchable record of everything.',
  '/diagnostics': 'Live connection metrics.',
  '/settings': 'Preferences and network.',
  '/about': 'Version and links.',
}

function isHistoryHash(raw: string): boolean {
  const path = raw.split('?')[0]
  return path === '/history' || path === 'history'
}

function normalizeHash(raw: string): { route: NavRoute; hash: string } | null {
  // raw is without '#', e.g. "/dashboard" or "/activity?view=history" or "/history"
  if (!raw) return null
  // History absorbs into Activity: #/history -> #/activity?view=history
  if (isHistoryHash(raw)) {
    return { route: '/activity', hash: '/activity?view=history' }
  }
  const [path] = raw.split('?')
  if ((ROUTE_ORDER as string[]).includes(path)) {
    // if path is /history we already handled; otherwise validate
    if ((ROUTE_ORDER as string[]).includes(path)) return { route: path as NavRoute, hash: raw }
  }
  return null
}

export function shortcutNumber(route: NavRoute): number | null {
  const n = ROUTE_ORDER.indexOf(route) + 1
  return n >= 1 && n <= 9 ? n : null
}

export function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
}

export function formatShortcut(route: NavRoute): string {
  const n = shortcutNumber(route)
  if (n === null) return ''
  return `${isMacPlatform() ? '⌘' : 'Ctrl+'}${n}`
}

interface NavigationContextValue {
  currentRoute: NavRoute
  navigate: (route: NavRoute) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [currentRoute, setCurrentRoute] = useState<NavRoute>(() => {
    if (typeof window === 'undefined') return '/dashboard'
    const raw = window.location.hash.slice(1)
    const normalized = normalizeHash(raw)
    if (normalized) {
      // Redirect /history deep link on boot (no extra history entry if already correct)
      if (isHistoryHash(raw) && window.location.hash !== `#${normalized.hash}`) {
        window.history.replaceState(null, '', `#${normalized.hash}`)
      }
      return normalized.route
    }
    return '/dashboard'
  })

  const navigate = useCallback((route: NavRoute) => {
    // History redirect preserve
    if (route === '/history') {
      const target = '/activity?view=history'
      setCurrentRoute('/activity')
      if (typeof window !== 'undefined') window.location.hash = target
      return
    }
    setCurrentRoute(route)
    if (typeof window !== 'undefined') window.location.hash = route
  }, [])

  useEffect(() => {
    document.title = currentRoute ? `${PAGE_TITLES[currentRoute]} — MeshDrop` : 'MeshDrop'
  }, [currentRoute])

  useEffect(() => {
    const onHash = () => {
      const raw = window.location.hash.slice(1)
      const normalized = normalizeHash(raw)
      if (normalized) {
        // If user landed on /history, rewrite hash to /activity?view=history
        if (isHistoryHash(raw)) {
          window.history.replaceState(null, '', `#${normalized.hash}`)
        }
        setCurrentRoute(normalized.route)
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.altKey || e.shiftKey) return
      const num = Number(e.key)
      if (!Number.isInteger(num) || num < 1 || num > 9) return
      // Map 1..9 to ROUTE_ORDER[0..8]; beyond 9 has no shortcut
      const idx = num - 1
      if (idx >= ROUTE_ORDER.length) return
      const target = ROUTE_ORDER[idx]
      if (shortcutNumber(target) === null) return
      e.preventDefault()
      navigate(target)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  return (
    <NavigationContext.Provider value={{ currentRoute, navigate }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider')
  return ctx
}
