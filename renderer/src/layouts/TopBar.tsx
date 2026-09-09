import { Search, Bell, Sun, Moon, QrCode, ShieldCheck, Waypoints, User, Info } from 'lucide-react'
import { PAGE_TITLES, useNavigation } from '@/hooks/useNavigation'
import { useApp } from '@/hooks/useAppState'
import { useDevices } from '@/hooks/useDevices'
import { useNotifications } from '@/hooks/useNotifications'
import { useTheme } from '@/hooks/useTheme'
import { ContextMenu } from '@/components/ContextMenu'
import { WindowControls } from '@/components/WindowControls'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { isElectron, isMac } from '@/lib/capabilities'

export function TopBar() {
  const { currentRoute, navigate } = useNavigation()
  const { toggleCommandPalette, toggleNotificationDrawer, connectionUp } = useApp()
  const { identity, devices, toggleQRCodeModal } = useDevices()
  const { notifications } = useNotifications()
  const { theme, toggle } = useTheme()
  const [profileMenu, setProfileMenu] = useState<{ x: number; y: number } | null>(null)
  const [scrolled, setScrolled] = useState(false)

  const unreadCount = notifications.filter((n) => !n.read).length
  const remoteOnline = devices.filter((d) => d.isTrusted && d.isOnline).length
  const pairedCount = devices.filter((d) => d.isTrusted).length
  const connectionLost = !connectionUp
  const pill = connectionLost
    ? { text: 'Connection lost — reconnecting…', online: false as const }
    : pairedCount === 0
      ? { text: 'Pair a device to start', online: false as const }
      : remoteOnline > 0
        ? { text: `${remoteOnline} device${remoteOnline === 1 ? '' : 's'} online`, online: true as const }
        : { text: 'Ready — no devices online', online: false as const }

  useEffect(() => {
    const main = document.getElementById('main-scroll')
    if (!main) return
    const onScroll = () => setScrolled(main.scrollTop > 8)
    main.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => main.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'flex h-16 items-center gap-3 md:gap-4 border-b px-4 md:px-6 z-10 select-none transition-all',
        scrolled
          ? 'border-hairline/10 bg-background/72 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 shadow-[0_1px_12px_rgba(0,0,0,0.06)]'
          : 'border-hairline/10 bg-background/80 backdrop-blur-2xl',
        isElectron && !isMac ? 'drag-region' : ''
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex md:hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg gradient-brand shadow-md">
          <Waypoints className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-black tracking-tight text-foreground">{PAGE_TITLES[currentRoute] || 'MeshDrop'}</h1>
          <p className="hidden md:block font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">P2P file sharing</p>
        </div>
      </div>

      <div className="no-drag hidden md:block mx-auto max-w-md flex-1">
        <button
          onClick={toggleCommandPalette}
          aria-label="Open command palette"
          className="group flex w-full items-center gap-2.5 rounded-full border border-hairline/10 bg-card/55 px-4 py-2 text-xs text-muted-foreground shadow-sm transition-all hover:bg-card hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
          <span className="flex-1 text-left">Search pages, actions, devices…</span>
          <span className="rounded-full border border-hairline/10 bg-muted/60 px-2.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
            {isMac ? '⌘K' : isElectron ? 'Ctrl K' : 'Click to search'}
          </span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div
          className={cn(
            'no-drag hidden lg:flex items-center gap-2 rounded-full border px-3.5 py-1.5 shadow-sm',
            connectionLost ? 'border-red-500/30 bg-red-500/10' : pill.online ? 'border-meshdrop-cyan/25 bg-meshdrop-cyan/10' : 'border-hairline/10 bg-muted/20'
          )}
          title="Live P2P mesh status"
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2">
            <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75', pill.online && !connectionLost ? 'animate-ping bg-meshdrop-cyan' : '', connectionLost ? 'bg-red-500' : '')} />
            <span className={cn('relative inline-flex h-2 w-2 rounded-full', connectionLost ? 'bg-red-500' : pill.online ? 'bg-meshdrop-cyan' : 'bg-muted-foreground/60')} />
          </span>
          <span className={cn('font-mono text-[10px] font-extrabold', connectionLost ? 'text-red-400' : pill.online ? 'text-meshdrop-cyan' : 'text-muted-foreground')}>{pill.text}</span>
        </div>

        <button
          onClick={toggleNotificationDrawer}
          className="no-drag relative rounded-full border border-hairline/10 bg-card/40 p-2.5 text-muted-foreground transition-all hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-white shadow-sm">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>

        <button
          onClick={toggle}
          className="no-drag rounded-full border border-hairline/10 bg-card/40 p-2.5 text-muted-foreground transition-all hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title="Toggle theme"
        >
          <span className="relative block h-5 w-5 overflow-hidden">
            <Sun className={cn('absolute inset-0 h-5 w-5 transition-all duration-300', theme === 'dark' ? 'scale-100 rotate-0 opacity-100' : 'scale-0 rotate-90 opacity-0')} />
            <Moon className={cn('absolute inset-0 h-5 w-5 transition-all duration-300', theme === 'dark' ? 'scale-0 -rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100')} />
          </span>
        </button>

        <button
          onClick={(e) => setProfileMenu({ x: e.clientX, y: e.clientY })}
          className="no-drag flex items-center gap-2 border-l border-hairline/10 pl-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
          aria-label="Open profile menu"
        >
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 border border-primary/25 text-primary">
            <User className="h-4 w-4" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-meshdrop-cyan ring-2 ring-background" />
          </div>
        </button>

        <WindowControls />
      </div>

      {profileMenu && (
        <ContextMenu
          x={profileMenu.x}
          y={profileMenu.y}
          onClose={() => setProfileMenu(null)}
          items={[
            { label: 'Copy Device Address', icon: <ShieldCheck className="h-3.5 w-3.5" />, onClick: () => navigator.clipboard.writeText(identity.pairingCode || '') },
            { label: 'Show Pairing QR', icon: <QrCode className="h-3.5 w-3.5" />, onClick: toggleQRCodeModal },
            { separator: true } as unknown as { label: string },
            { label: 'Settings', icon: <ShieldCheck className="h-3.5 w-3.5" />, onClick: () => navigate('/settings') },
            { label: 'About MeshDrop', icon: <Info className="h-3.5 w-3.5" />, onClick: () => navigate('/about') },
          ]}
        />
      )}
    </header>
  )
}
