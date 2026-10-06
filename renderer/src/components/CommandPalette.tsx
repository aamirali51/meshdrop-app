import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Monitor,
  Link2,
  ArrowLeftRight,
  Activity,
  Settings,
  Info,
  Moon,
  Sun,
  Zap,
  Gauge,
  RefreshCw,
  Tv,
  FolderKanban,
  GlobeLock,
  Wrench,
  BookOpen,
  Clock,
} from 'lucide-react'
import { useApp } from '@/hooks/useAppState'
import { useDevices } from '@/hooks/useDevices'
import { useTransfers } from '@/hooks/useTransfers'
import { useNavigation, formatShortcut, isMacPlatform } from '@/hooks/useNavigation'
import { useTheme } from '@/hooks/useTheme'
import { isElectron } from '@/lib/capabilities'
import type { NavRoute } from '@/types'

interface PaletteItem {
  id: string
  label: string
  hint?: string
  icon?: React.ReactNode
  action: () => void
  disabled?: boolean
  group: string
}

const RECENT_KEY = 'meshdrop:palette_recent'

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (!q) return 1
  if (t.includes(q)) return 2 + q.length / t.length
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++
  if (qi === q.length) return 1 + q.length / t.length
  return 0
}

function loadRecent(): string[] {
  try {
    const v = localStorage.getItem(RECENT_KEY)
    return v ? (JSON.parse(v) as string[]) : []
  } catch {
    return []
  }
}
function saveRecent(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 6)))
  } catch {}
}

export function CommandPalette() {
  const { isCommandPaletteOpen, toggleCommandPalette } = useApp()
  const { devices, toggleQuickConnect } = useDevices()
  const { sendFileToDevice } = useTransfers()
  const { navigate } = useNavigation()
  const { theme, toggle } = useTheme()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecent())
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep palette focused; Esc handled globally and here
  useEffect(() => {
    if (isCommandPaletteOpen) setTimeout(() => inputRef.current?.focus(), 30)
  }, [isCommandPaletteOpen])

  const navItems: { label: string; route: NavRoute; icon: React.ReactNode }[] = [
    { label: 'Share', route: '/dashboard', icon: <Link2 className="h-4 w-4 text-muted-foreground" /> },
    { label: 'Transfers', route: '/transfers', icon: <ArrowLeftRight className="h-4 w-4 text-muted-foreground" /> },
    { label: 'Devices', route: '/devices', icon: <Monitor className="h-4 w-4 text-muted-foreground" /> },
    { label: 'Sync', route: '/sync', icon: <RefreshCw className="h-4 w-4 text-muted-foreground" /> },
    { label: 'Watch Party', route: '/party', icon: <Tv className="h-4 w-4 text-muted-foreground" /> },
    { label: 'Shared Folders', route: '/shared-folders', icon: <FolderKanban className="h-4 w-4 text-muted-foreground" /> },
    { label: 'Activity', route: '/activity', icon: <Activity className="h-4 w-4 text-muted-foreground" /> },
    { label: 'Tunnels', route: '/tunnels', icon: <GlobeLock className="h-4 w-4 text-muted-foreground" /> },
    { label: 'Diagnostics', route: '/diagnostics', icon: <Wrench className="h-4 w-4 text-muted-foreground" /> },
    { label: 'Guide', route: '/guide', icon: <BookOpen className="h-4 w-4 text-muted-foreground" /> },
    { label: 'Settings', route: '/settings', icon: <Settings className="h-4 w-4 text-muted-foreground" /> },
    { label: 'About', route: '/about', icon: <Info className="h-4 w-4 text-muted-foreground" /> },
  ]

  const allNav: PaletteItem[] = useMemo(
    () =>
      navItems.map((i) => ({
        id: `nav-${i.route}`,
        label: i.label,
        icon: i.icon,
        hint: isElectron ? formatShortcut(i.route) || undefined : undefined,
        group: 'Pages',
        action: () => {
          setRecentIds((prev) => {
            const next = [`nav-${i.route}`, ...prev.filter((x) => x !== `nav-${i.route}`)]
            saveRecent(next)
            return next
          })
          navigate(i.route)
          toggleCommandPalette()
        },
      })),
    [navigate, toggleCommandPalette]
  )

  const quickItems: PaletteItem[] = useMemo(
    () => [
      {
        id: 'quick-connect',
        label: 'Pair a Device',
        icon: <Zap className="h-4 w-4 text-primary" />,
        group: 'Actions',
        action: () => {
          toggleQuickConnect()
          toggleCommandPalette()
        },
      },
      {
        id: 'toggle-theme',
        label: `Toggle ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
        icon: theme === 'dark' ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Moon className="h-4 w-4 text-muted-foreground" />,
        group: 'Actions',
        action: () => {
          toggle()
          toggleCommandPalette()
        },
      },
    ],
    [theme, toggle, toggleCommandPalette, toggleQuickConnect]
  )

  const deviceItems: PaletteItem[] = useMemo(
    () =>
      devices.map((d) => ({
        id: `dev-${d.id}`,
        label: d.name,
        icon: (
          <span className="relative inline-flex">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-[9px] font-black text-primary">
              {d.name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${d.isOnline ? 'bg-status-online' : 'bg-muted-foreground/40'}`}
            />
          </span>
        ),
        hint: d.isOnline ? `${d.latencyMs}ms` : 'Offline',
        disabled: !d.isOnline,
        group: 'Devices',
        action: () => {
          sendFileToDevice(d)
          toggleCommandPalette()
        },
      })),
    [devices, sendFileToDevice, toggleCommandPalette]
  )

  const filtered = useMemo(() => {
    const q = query.trim()
    const pools: PaletteItem[][] = [allNav, quickItems, deviceItems]
    const out: PaletteItem[] = []
    for (const pool of pools) {
      const scored = pool
        .map((it) => ({ it, s: fuzzyScore(q, it.label) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.it)
      out.push(...scored)
    }
    return out
  }, [query, allNav, quickItems, deviceItems])

  const grouped = useMemo(() => {
    const map = new Map<string, PaletteItem[]>()
    for (const it of filtered) {
      const g = it.group
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(it)
    }
    return [...map.entries()]
  }, [filtered])

  const flat = filtered

  // Recent pages shown when query empty
  const recentItems: PaletteItem[] = useMemo(() => {
    if (query.trim()) return []
    const byId = new Map(allNav.map((x) => [x.id, x]))
    return recentIds.map((id) => byId.get(id)).filter(Boolean) as PaletteItem[]
  }, [query, recentIds, allNav])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, flat.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = flat[activeIndex]
        if (item && !item.disabled) item.action()
      } else if (e.key === 'Escape') {
        toggleCommandPalette()
      }
    },
    [flat, activeIndex, toggleCommandPalette]
  )

  if (!isCommandPaletteOpen) return null

  const glyph = isMacPlatform() ? '⌘' : 'Ctrl'

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[10vh] backdrop-blur-md"
        onClick={toggleCommandPalette}
        role="presentation"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -8 }}
          transition={{ duration: 0.15 }}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-sidebar/95 shadow-2xl backdrop-blur-2xl"
        >
          <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3.5">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search pages, actions, devices…"
              className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
              autoFocus
              aria-label="Search"
            />
            <span className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">ESC</span>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {!query.trim() && recentItems.length > 0 && (
              <div className="mb-2 rounded-xl border border-border/30 bg-muted/20 p-2">
                <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <Clock className="h-3 w-3" /> Recent
                </div>
                <div className="space-y-0.5">
                  {recentItems.map((it) => (
                    <button
                      key={it.id}
                      onClick={() => it.action()}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium hover:bg-accent/40 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {it.icon}
                      <span className="truncate">{it.label}</span>
                      {it.hint && <span className="ml-auto font-mono text-[10px] text-muted-foreground">{it.hint}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {flat.length === 0 ? (
              <div className="space-y-1 p-8 text-center">
                <p className="text-sm font-bold text-foreground">No results</p>
                <p className="text-xs text-muted-foreground">Try a different search term or device name.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {grouped.map(([group, items]) => (
                  <div key={group}>
                    <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">{group}</div>
                    <div className="space-y-0.5">
                      {items.map((item) => {
                        const globalIdx = flat.indexOf(item)
                        const active = globalIdx === activeIndex
                        return (
                          <button
                            key={item.id}
                            disabled={item.disabled}
                            onClick={() => !item.disabled && item.action()}
                            onMouseEnter={() => setActiveIndex(globalIdx)}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-accent/60 text-foreground' : 'text-foreground hover:bg-accent/40'} ${item.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              {item.icon}
                              <span className="truncate">{item.label}</span>
                            </div>
                            {item.hint && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{item.hint}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border/40 bg-muted/20 px-4 py-2 font-mono text-[10px] text-muted-foreground">
            <span className="font-bold text-foreground">MeshDrop Go</span>
            <span className="flex items-center gap-2">
              <span className="hidden sm:inline">↑↓ navigate · ↵ select · Esc close</span>
              <span className="rounded border border-border/50 bg-card px-1.5 py-0.5">{glyph}K</span>
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
