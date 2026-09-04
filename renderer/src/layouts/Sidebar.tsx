import { useState, useEffect } from 'react'
import {
  HardDrive,
  Network,
  Shield,
  Activity,
  History,
  Gauge,
  Info,
  ChevronLeft,
  ChevronRight,
  Zap,
  Link2,
  Share2,
  ShieldCheck,
  Copy,
  QrCode,
  Settings,
  Waypoints,
  RefreshCw,
  Tv,
  Globe
} from 'lucide-react'
import { useNavigation } from '@/hooks/useNavigation'
import { useDevices } from '@/hooks/useDevices'
import { useTransfers } from '@/hooks/useTransfers'
import { useApp } from '@/hooks/useAppState'
import { useShares } from '@/hooks/useShares'
import { ContextMenu } from '@/components/ContextMenu'
import { cn } from '@/lib/utils'
import type { NavRoute } from '@/types'

const isElectron = typeof window !== 'undefined' && Boolean(window.bridge)
const isMac = isElectron && window.bridge?.platform === 'darwin'

export function Sidebar() {
  const { currentRoute, navigate } = useNavigation()
  const { identity, toggleQRCodeModal } = useDevices()
  const { transfers } = useTransfers()
  const { diagnostics } = useApp()
  const { toggleDropCodeModal } = useShares()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [profileMenu, setProfileMenu] = useState<{ x: number; y: number } | null>(null)

  // Toggle collapse via Cmd+B / Ctrl+B
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setIsCollapsed((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Persist user collapse choice; only auto-collapse on first load.
  useEffect(() => {
    const saved = localStorage.getItem('meshdrop:sidebar_collapsed')
    if (saved != null) {
      setIsCollapsed(saved === '1')
      return
    }
    const mq = window.matchMedia('(min-width: 1024px)')
    if (!mq.matches) setIsCollapsed(true)
  }, [])
  useEffect(() => {
    localStorage.setItem('meshdrop:sidebar_collapsed', isCollapsed ? '1' : '0')
  }, [isCollapsed])

  const activeTransfers = transfers.filter(
    (t) => t.status === 'active' || t.status === 'queued' || t.status === 'pending_approval'
  ).length
  const peersOnline = diagnostics.connectedPeersCount ?? null

  const primaryNav: {
    label: string
    route: NavRoute
    icon: React.ReactNode
    badge?: string
  }[] = [
    {
      label: 'Share',
      route: '/dashboard',
      icon: <Link2 className='h-4 w-4' />
    },
    {
      label: 'Transfers',
      route: '/transfers',
      icon: <HardDrive className='h-4 w-4' />,
      badge: activeTransfers > 0 ? String(activeTransfers) : undefined
    },
    {
      label: 'My Devices',
      route: '/devices',
      icon: <Network className='h-4 w-4' />,
      badge: peersOnline != null && peersOnline > 0 ? String(peersOnline) : undefined
    },
    {
      label: 'Sync Folders',
      route: '/sync',
      icon: <RefreshCw className='h-4 w-4' />
    },
    {
      label: 'Mesh Party',
      route: '/party',
      icon: <Tv className='h-4 w-4' />
    },
    {
      label: 'Shared Folders',
      route: '/shared-folders',
      icon: <Globe className='h-4 w-4' />
    },
    {
      label: 'Settings',
      route: '/settings',
      icon: <Shield className='h-4 w-4' />
    }
  ]

  const utilityNav: {
    label: string
    route: NavRoute
    icon: React.ReactNode
  }[] = [
    { label: 'Activity', route: '/activity', icon: <Activity className='h-4 w-4' /> },
    { label: 'History', route: '/history', icon: <History className='h-4 w-4' /> },
    { label: 'Diagnostics', route: '/diagnostics', icon: <Gauge className='h-4 w-4' /> },
    { label: 'About', route: '/about', icon: <Info className='h-4 w-4' /> }
  ]

  const renderNavItem = (
    item: { label: string; route: NavRoute; icon: React.ReactNode; badge?: string },
    compact = false
  ) => {
    const isActive = currentRoute === item.route
    return (
      <button
        key={item.route}
        onClick={() => navigate(item.route)}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all group',
          isActive
            ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          isCollapsed ? 'justify-center px-0' : '',
          compact && 'py-2'
        )}
        title={isCollapsed ? item.label : undefined}
      >
        <div
          className={cn(
            'shrink-0',
            isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
          )}
        >
          {item.icon}
        </div>

        {!isCollapsed && <span className='flex-1 truncate text-left'>{item.label}</span>}

        {!isCollapsed && item.badge && (
          <span className='rounded-full bg-meshdrop-cyan/20 px-2 py-0.5 font-mono text-[9px] font-extrabold text-meshdrop-cyan'>
            {item.badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r border-hairline/10 bg-sidebar/95 backdrop-blur-2xl select-none z-20 transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-60 md:w-64'
      )}
    >
      {/* Sidebar Header / Brand */}
      {/* pl-[84px] on macOS clears the native traffic lights (hiddenInset) */}
      <div
        className={cn(
          'flex h-16 items-center justify-between border-b border-hairline/10',
          isMac ? 'pl-[84px] pr-4' : 'px-4',
          isElectron && !isMac ? 'drag-region' : ''
        )}
      >
        <div className='flex items-center gap-3'>
          <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl gradient-brand shadow-md'>
            <Waypoints className='h-5 w-5 text-white' />
          </div>
          {!isCollapsed && (
            <div className='flex flex-col'>
              <span className='flex items-center gap-1.5 text-sm font-black tracking-tight text-foreground'>
                MeshDrop
              </span>
              <span className='font-mono text-[10px] text-muted-foreground'>
                Send files directly. No cloud.
              </span>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <button
            onClick={() => setIsCollapsed(true)}
            className='no-drag rounded-lg p-1 text-muted-foreground transition-all hover:bg-accent hover:text-foreground'
            title='Collapse Sidebar (⌘B)'
          >
            <ChevronLeft className='h-4 w-4' />
          </button>
        )}
      </div>

      {/* Quick Actions */}
      <div className='border-b border-hairline/10 p-3'>
        <button
          onClick={toggleDropCodeModal}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-primary/90',
            isCollapsed ? 'px-0' : 'px-3'
          )}
          title='Share a file with a one-time link'
        >
          <Share2 className='h-4 w-4 shrink-0' />
          {!isCollapsed && <span>Share a File</span>}
        </button>
      </div>

      {/* Primary Navigation */}
      <nav className='flex-1 space-y-1 overflow-y-auto p-2'>
        {primaryNav.map((item) => renderNavItem(item))}

        {/* Utility group */}
        {!isCollapsed && (
          <div className='px-3 pb-1 pt-4'>
            <span className='text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/50'>
              More
            </span>
          </div>
        )}
        {utilityNav.map((item) => renderNavItem({ ...item }, true))}
      </nav>

      {/* Expand Button for Collapsed Mode */}
      {isCollapsed && (
        <div className='flex justify-center border-t border-hairline/10 p-2'>
          <button
            onClick={() => setIsCollapsed(false)}
            className='rounded-lg p-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground'
            title='Expand Sidebar (⌘B)'
          >
            <ChevronRight className='h-4 w-4' />
          </button>
        </div>
      )}

      {/* Footer Node Status — hidden on lg+ (TopBar owns the mesh pill there) */}
      {!isCollapsed && (
        <div className='border-t border-hairline/10 bg-muted/20 p-3 text-xs lg:hidden'>
          <button
            onClick={(e) => setProfileMenu({ x: e.clientX, y: e.clientY })}
            className='flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-accent/60'
            aria-label='Open profile menu'
          >
            <div className='relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary'>
              <ShieldCheck className='h-4 w-4' />
              <span className='absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-meshdrop-cyan ring-2 ring-background' />
            </div>
            <div className='flex min-w-0 flex-col'>
              <span className='truncate text-[11px] font-bold text-foreground'>
                {identity.name}
              </span>
              <span className='flex items-center gap-1 font-mono text-[10px] text-meshdrop-cyan'>
                <ShieldCheck className='h-3 w-3' /> Mesh Online
              </span>
            </div>
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
              icon: <Copy className='h-3.5 w-3.5' />,
              onClick: () => navigator.clipboard.writeText(identity.pairingCode || '')
            },
            {
              label: 'Show Pairing QR',
              icon: <QrCode className='h-3.5 w-3.5' />,
              onClick: toggleQRCodeModal
            },
            { separator: true },
            {
              label: 'Security & Settings',
              icon: <Settings className='h-3.5 w-3.5' />,
              onClick: () => navigate('/settings')
            },
            {
              label: 'About MeshDrop',
              icon: <Info className='h-3.5 w-3.5' />,
              onClick: () => navigate('/about')
            }
          ]}
        />
      )}
    </aside>
  )
}
