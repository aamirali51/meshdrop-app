import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { NavRoute } from '@/types'

// Single source of truth for routes, in sidebar order. The hash-route
// validator, the Ctrl+N handler AND the shortcut hints (CommandPalette) all
// read this one table, so a hint always matches what the key actually opens.
const ROUTE_ORDER: NavRoute[] = [
  '/dashboard',
  '/transfers',
  '/devices',
  '/sync',
  '/party',
  '/shared-folders',
  '/tunnels',
  '/settings',
  '/activity',
  '/history',
  '/diagnostics',
  '/about'
]

// Human page names, kept next to ROUTE_ORDER so a route's shortcut, sidebar
// label and window title can't drift apart. TopBar renders these as headings.
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
  '/about': 'About'
}

/** Position-based shortcut number (Ctrl+1..9); null when the route has no
 * shortcut. Ten and beyond are unreachable on real keyboards (Ctrl+10 is not
 * typable), so they are deliberately not advertised.
 * Note: browsers reserve Ctrl+1..9 for tab switching, so these shortcuts only
 * fire in the Electron window; CommandPalette hides the hints in web mode. */
export function shortcutNumber(route: NavRoute): number | null {
  const n = ROUTE_ORDER.indexOf(route) + 1
  return n >= 1 && n <= 9 ? n : null
}

export function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
}

/** '⌘3' on macOS, 'Ctrl+3' elsewhere; '' when the route has no shortcut. */
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
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
    return (ROUTE_ORDER as string[]).includes(hash) ? (hash as NavRoute) : '/dashboard'
  })

  const navigate = useCallback((route: NavRoute) => {
    setCurrentRoute(route)
    if (typeof window !== 'undefined') window.location.hash = route
  }, [])

  // F22: hash-only navigation left the window/tab title stuck on the static
  // "MeshDrop" from index.html — follow the current page instead.
  useEffect(() => {
    document.title = currentRoute ? `${PAGE_TITLES[currentRoute]} — MeshDrop` : 'MeshDrop'
  }, [currentRoute])

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.slice(1)
      if ((ROUTE_ORDER as string[]).includes(h)) setCurrentRoute(h as NavRoute)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Global keyboard shortcuts: ⌘/Ctrl + 1..9 navigates to the matching page.
  // (1..9 only — same ceiling as shortcutNumber; digits 10+ are not typable
  // as a single chord. In a plain browser the OS/browser swallows Ctrl+1..9
  // for tab switching before this handler can run — Electron-only in effect.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.altKey || e.shiftKey) return
      const num = Number(e.key)
      if (!Number.isInteger(num) || num < 1 || num > ROUTE_ORDER.length) return
      e.preventDefault()
      navigate(ROUTE_ORDER[num - 1])
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
