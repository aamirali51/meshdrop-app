import { useState, useEffect } from 'react'
import {
  Share2,
  ArrowLeftRight,
  MonitorSmartphone,
  FolderSync,
  Tv,
  FolderKanban,
  Activity,
  GlobeLock,
  Wrench,
  Settings,
  Info,
  ChevronLeft,
  ChevronRight,
  Zap,
  Waypoints,
  ShieldCheck,
  Copy,
  QrCode,
} from 'lucide-react'
import { useNavigation } from '@/hooks/useNavigation'
import { useDevices } from '@/hooks/useDevices'
import { useTransfers } from '@/hooks/useTransfers'
import { useApp } from '@/hooks/useAppState'
import { useShares } from '@/hooks/useShares'
import { ContextMenu } from '@/components/ContextMenu'
import { cn } from '@/lib/utils'
import { isElectron, isMac } from '@/lib/capabilities'
import type { NavRoute } from '@/types'

type NavItem = { label: string; route: NavRoute; icon: React.ReactNode; badge?: string }

const PRIMARY: NavItem[] = [
  { label: 'Share', route: '/dashboard', icon: <Share2 className="h-5 w-5" /> },
  { label: 'Transfers', route: '/transfers', icon: <ArrowLeftRight className="h-5 w-5" /> },
  { label: 'Devices', route: '/devices', icon: <MonitorSmartphone className="h-5 w-5" /> },
  { label: 'Sync', route: '/sync', icon: <FolderSync className="h-5 w-5" /> },
  { label: 'Watch Party', route: '/party', icon: <Tv className="h-5 w-5" /> },
  { label: 'Shared Folders', route: '/shared-folders', icon: <FolderKanban className="h-5 w-5" /> },
]

const MORE: NavItem[] = [
  { label: 'Activity', route: '/activity', icon: <Activity className="h-5 w-5" /> },
  { label: 'Tunnels', route: '/tunnels', icon: <GlobeLock className="h-5 w-5" /> },
  { label: 'Diagnostics', route: '/diagnostics', icon: <Wrench className="h-5 w-5" /> },
  { label: 'Settings', route: '/settings', icon: <Settings className="h-5 w-5" /> },
  { label: 'About', route: '/about', icon: <Info className="h-5 w-5" /> },
]

export function Sidebar() {
  const { currentRoute, navigate } = useNavigation()
  const { identity, toggleQRCodeModal } = useDevices()
  const { transfers } = useTransfers()
  const { diagnostics } = useApp()
  const { toggleDropCodeModal } = useShares()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [profileMenu, setProfileMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setIsCollapsed((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('meshdrop:sidebar_collapsed')
    if (saved != null) {
      setIsCollapsed(saved === '1')
      return
    }
    if (!window.matchMedia('(min-width: 1024px)').matches) setIsCollapsed(true)
  }, [])

  useEffect(() => {
    localStorage.setItem('meshdrop:sidebar_collapsed', isCollapsed ? '1' : '0')
  }, [isCollapsed])

  const activeTransfers = transfers.filter(
    (t) => t.status === 'active' || t.status === 'queued' || t.status === 'pending_approval'
  ).length
  const peersOnline = diagnostics.connectedPeersCount ?? null

  const withBadge = (items: NavItem[]): NavItem[] =>
    items.map((it) => {
      if (it.route === '/transfers' && activeTransfers > 0) return { ...it, badge: String(activeTransfers) }
      if (it.route === '/devices' && peersOnline != null && peersOnline > 0)
        return { ...it, badge: String(peersOnline) }
      return it
    })

  const renderItem = (item: NavItem) => {
    const isActive = currentRoute === item.route
    return (
      <button
        key={item.route}
        onClick={() => navigate(item.route)}
        aria-current={isActive ? 'page' : undefined}
        aria-label={item.label}
        title={isCollapsed ? item.label : undefined}
        className={cn(
          'group relative flex w-full items-center gap-3 rounded-xl px-3 py-[9px] text-[13px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
          isActive
            ? 'bg-primary/14 text-primary shadow-[0_0_22px_-8px_rgba(99,102,241,0.55)] border border-primary/25'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground border border-transparent',
          isCollapsed && 'justify-center px-0'
        )}
      >
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-0 top-1/2 h-[22px] w-[2px] -translate-y-1/2 rounded-full bg-primary transition-all duration-200',
            isActive ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-1'
          )}
        />
        <span
          className={cn(
            'shrink-0 [&_svg]:h-5 [&_svg]:w-5',
            isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
          )}
        >
          {item.icon}
        </span>
        {!isCollapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
        {!isCollapsed && item.badge && (
          <span className="rounded-full bg-meshdrop-cyan/18 px-2 py-0.5 font-mono text-[10px] font-extrabold leading-none text-meshdrop-cyan">
            {item.badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <aside
      aria-label="Primary"
      className={cn(
        'hidden md:flex flex-col border-r border-hairline/10 bg-sidebar/95 backdrop-blur-2xl select-none z-20 transition-all duration-300',
        isCollapsed ? 'w-[68px]' : 'w-[252px] lg:w-[268px]'
      )}
    >
      <div
        className={cn(
          'flex h-16 items-center justify-between border-b border-hairline/10 shrink-0',
          isMac ? 'pl-[84px] pr-3' : 'px-3',
          isElectron && !isMac ? 'drag-region' : ''
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl gradient-brand shadow-md">
            <Waypoints className="h-5 w-5 text-white" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="text-[13px] font-black tracking-tight leading-none text-foreground">MeshDrop</div>
              <div className="font-mono text-[10px] leading-none text-muted-foreground mt-1">
                Send files directly. No cloud.
              </div>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <button
            onClick={() => setIsCollapsed(true)}
            className="no-drag rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Collapse sidebar"
            title={isMac ? 'Collapse (⌘B)' : 'Collapse (Ctrl+B)'}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-3 border-b border-hairline/10 shrink-0">
        <button
          onClick={toggleDropCodeModal}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isCollapsed ? 'px-0' : 'px-3'
          )}
          aria-label="Share a file"
        >
          <Zap className="h-5 w-5 shrink-0" />
          {!isCollapsed && 'Share a File'}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1" aria-label="Sections">
        {withBadge(PRIMARY).map(renderItem)}
        <div className={cn('px-3 pt-4 pb-1', isCollapsed && 'hidden')}>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/55">More</span>
        </div>
        {withBadge(MORE).map(renderItem)}
      </nav>

      {isCollapsed ? (
        <div className="flex justify-center border-t border-hairline/10 p-2 shrink-0">
          <button
            onClick={() => setIsCollapsed(false)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Expand sidebar"
            title={isMac ? 'Expand (⌘B)' : 'Expand (Ctrl+B)'}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="border-t border-hairline/10 bg-muted/20 p-3 shrink-0 lg:hidden">
          <button
            onClick={(e) => setProfileMenu({ x: e.clientX, y: e.clientY })}
            className="flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Open profile menu"
          >
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-meshdrop-cyan ring-2 ring-background" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-bold text-foreground">{identity.name}</span>
              <span className="flex items-center gap-1 font-mono text-[10px] text-meshdrop-cyan">
                <ShieldCheck className="h-3 w-3" /> Mesh Online
              </span>
            </span>
          </button>
        </div>
      )}

      {profileMenu && (
        <ContextMenu
          x={profileMenu.x}
          y={profileMenu.y}
          onClose={() => setProfileMenu(null)}
          items={[
            {
              label: 'Copy Device Address',
              icon: <Copy className="h-3.5 w-3.5" />,
              onClick: () => navigator.clipboard.writeText(identity.pairingCode || ''),
            },
            {
              label: 'Show Pairing QR',
              icon: <QrCode className="h-3.5 w-3.5" />,
              onClick: toggleQRCodeModal,
            },
            { separator: true } as unknown as { label: string },
            {
              label: 'Settings',
              icon: <Settings className="h-3.5 w-3.5" />,
              onClick: () => navigate('/settings'),
            },
            {
              label: 'About MeshDrop',
              icon: <Info className="h-3.5 w-3.5" />,
              onClick: () => navigate('/about'),
            },
          ]}
        />
      )}
    </aside>
  )
}
