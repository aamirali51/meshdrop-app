import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Monitor,
  Link2,
  ArrowLeftRight,
  History,
  Activity,
  Settings,
  Info,
  Moon,
  Sun,
  Zap,
  Gauge,
  RefreshCw
} from 'lucide-react'
import { useApp } from '@/hooks/useAppState'
import { useDevices } from '@/hooks/useDevices'
import { useTransfers } from '@/hooks/useTransfers'
import { useNavigation, formatShortcut } from '@/hooks/useNavigation'
import { useTheme } from '@/hooks/useTheme'
import type { NavRoute } from '@/types'

interface PaletteItem {
  id: string
  label: string
  hint?: string
  icon?: React.ReactNode
  action: () => void
  disabled?: boolean
}

export function CommandPalette() {
  const { isCommandPaletteOpen, toggleCommandPalette } = useApp()
  const { devices, toggleQuickConnect } = useDevices()
  const { sendFileToDevice } = useTransfers()
  const { navigate } = useNavigation()
  const { theme, toggle } = useTheme()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const navItems: { label: string; route: NavRoute; icon: React.ReactNode }[] = [
    {
      label: 'Share',
      route: '/dashboard',
      icon: <Link2 className='h-4 w-4 text-muted-foreground' />
    },
    {
      label: 'My Devices',
      route: '/devices',
      icon: <Monitor className='h-4 w-4 text-muted-foreground' />
    },
    {
      label: 'Sync Folders',
      route: '/sync',
      icon: <RefreshCw className='h-4 w-4 text-muted-foreground' />
    },
    {
      label: 'Transfers',
      route: '/transfers',
      icon: <ArrowLeftRight className='h-4 w-4 text-muted-foreground' />
    },
    {
      label: 'Activity',
      route: '/activity',
      icon: <Activity className='h-4 w-4 text-muted-foreground' />
    },
    {
      label: 'History',
      route: '/history',
      icon: <History className='h-4 w-4 text-muted-foreground' />
    },
    {
      label: 'Diagnostics',
      route: '/diagnostics',
      icon: <Gauge className='h-4 w-4 text-muted-foreground' />
    },
    {
      label: 'Settings',
      route: '/settings',
      icon: <Settings className='h-4 w-4 text-muted-foreground' />
    },
    { label: 'About', route: '/about', icon: <Info className='h-4 w-4 text-muted-foreground' /> }
  ]

  const results = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase()
    const navResults: PaletteItem[] = navItems
      .filter((i) => !q || i.label.toLowerCase().includes(q))
      .map((i) => ({
        id: `nav-${i.route}`,
        label: i.label,
        icon: i.icon,
        hint: formatShortcut(i.route),
        action: () => {
          navigate(i.route)
          toggleCommandPalette()
        }
      }))

    const quickResults: PaletteItem[] = [
      {
        id: 'quick-connect',
        label: 'Pair a Device',
        icon: <Zap className='h-4 w-4 text-primary' />,
        action: () => {
          toggleQuickConnect()
          toggleCommandPalette()
        }
      },
      {
        id: 'toggle-theme',
        label: `Toggle ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
        icon:
          theme === 'dark' ? (
            <Sun className='h-4 w-4 text-muted-foreground' />
          ) : (
            <Moon className='h-4 w-4 text-muted-foreground' />
          ),
        action: () => {
          toggle()
          toggleCommandPalette()
        }
      }
    ].filter((i) => !q || i.label.toLowerCase().includes(q))

    const deviceResults: PaletteItem[] = devices
      .filter((d) => !q || d.name.toLowerCase().includes(q) || d.os.toLowerCase().includes(q))
      .map((d) => ({
        id: `dev-${d.id}`,
        label: d.name,
        icon: (
          <span className='relative inline-flex'>
            <span className='flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-[9px] font-black text-primary'>
              {d.name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${
                d.isOnline ? 'bg-status-online' : 'bg-muted-foreground/40'
              }`}
            />
          </span>
        ),
        hint: d.isOnline ? `${d.latencyMs}ms` : 'Offline',
        disabled: !d.isOnline,
        action: () => {
          sendFileToDevice(d)
          toggleCommandPalette()
        }
      }))

    return [...navResults, ...quickResults, ...deviceResults]
  }, [
    query,
    theme,
    devices,
    navigate,
    toggleCommandPalette,
    toggleQuickConnect,
    toggle,
    sendFileToDevice
  ])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = results[activeIndex]
        if (item && !item.disabled) item.action()
      } else if (e.key === 'Escape') {
        toggleCommandPalette()
      }
    },
    [results, activeIndex, toggleCommandPalette]
  )

  if (!isCommandPaletteOpen) return null

  return (
    <AnimatePresence>
      <div className='fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-20 backdrop-blur-md'>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.15 }}
          className='w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-sidebar/95 shadow-2xl backdrop-blur-2xl'
        >
          {/* Header Input */}
          <div className='flex items-center gap-3 border-b border-border/50 px-4 py-3.5'>
            <Search className='h-5 w-5 shrink-0 text-muted-foreground' />
            <input
              type='text'
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder='Type a command or search devices...'
              className='flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground'
              autoFocus
            />
            <span className='rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground'>
              ESC
            </span>
          </div>

          {/* Body List */}
          <div className='max-h-[380px] overflow-y-auto p-2'>
            {results.length === 0 ? (
              <div className='space-y-1 p-8 text-center'>
                <p className='text-sm font-bold text-foreground'>No results</p>
                <p className='text-xs text-muted-foreground'>
                  Try a different search term or device name.
                </p>
              </div>
            ) : (
              <div className='space-y-0.5'>
                {results.map((item, i) => (
                  <button
                    key={item.id}
                    disabled={item.disabled}
                    onClick={() => !item.disabled && item.action()}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                      i === activeIndex
                        ? 'bg-accent/60 text-foreground'
                        : 'text-foreground hover:bg-accent/40'
                    } ${item.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <div className='flex min-w-0 items-center gap-2.5'>
                      {item.icon}
                      <span className='truncate'>{item.label}</span>
                    </div>
                    {item.hint && (
                      <span className='shrink-0 font-mono text-[10px] text-muted-foreground'>
                        {item.hint}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className='flex items-center justify-between border-t border-border/40 bg-muted/20 px-4 py-2 font-mono text-[10px] text-muted-foreground'>
            <span className='font-bold text-foreground'>MeshDrop</span>
            <span>↑↓ navigate • ↵ select • Esc close</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
