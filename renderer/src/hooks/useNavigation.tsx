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

/** Position-based shortcut number (Ctrl+1..9); null when the route has no
 * shortcut. Ten and beyond are unreachable on real keyboards (Ctrl+10 is not
 * typable), so they are deliberately not advertised. */
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

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.slice(1)
      if ((ROUTE_ORDER as string[]).includes(h)) setCurrentRoute(h as NavRoute)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Global keyboard shortcuts: ⌘/Ctrl + 1..8 navigates to the matching page.
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
