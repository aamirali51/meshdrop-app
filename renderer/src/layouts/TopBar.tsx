import { Search, Bell, Sun, Moon, QrCode, ShieldCheck, Waypoints, User, Info } from 'lucide-react'
import { useNavigation } from '@/hooks/useNavigation'
import { useApp } from '@/hooks/useAppState'
import { useDevices } from '@/hooks/useDevices'
import { useNotifications } from '@/hooks/useNotifications'
import { useTheme } from '@/hooks/useTheme'
import { ContextMenu } from '@/components/ContextMenu'
import { WindowControls } from '@/components/WindowControls'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { NavRoute } from '@/types'

const isElectron = typeof window !== 'undefined' && Boolean(window.bridge)
const isMac = isElectron && window.bridge?.platform === 'darwin'

export function TopBar() {
  const { currentRoute, navigate } = useNavigation()
  const {
    toggleCommandPalette,
    toggleNotificationDrawer,
    diagnostics
  } = useApp()
  const { identity, toggleQRCodeModal } = useDevices()
  const { notifications } = useNotifications()
  const { theme, toggle } = useTheme()
  const [profileMenu, setProfileMenu] = useState<{ x: number; y: number } | null>(null)

  const pageTitles: Record<NavRoute, string> = {
    '/dashboard': 'Share',
    '/devices': 'My Devices',
    '/sync': 'Sync Folders',
    '/party': 'Watch Party',
    '/transfers': 'Transfers',
    '/activity': 'Activity',
    '/history': 'History',
    '/diagnostics': 'Diagnostics',
    '/settings': 'Settings',
    '/about': 'About'
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  const meshOnline = diagnostics.connected !== false
  const peers = diagnostics.connectedPeersCount ?? null

  return (
    <header
      className={cn(
        'flex h-16 items-center gap-3 md:gap-4 border-b border-hairline/10 bg-background/80 px-4 md:px-6 z-10 select-none backdrop-blur-2xl',
        isElectron && !isMac ? 'drag-region' : ''
      )}
    >
      {/* Left: MeshDrop brand + section title */}
      <div className='flex min-w-0 items-center gap-3'>
        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg gradient-brand shadow-md'>
          <Waypoints className='h-4 w-4 text-white' />
        </div>
        <div className='min-w-0 leading-tight'>
          <h1 className='truncate text-sm font-black tracking-tight text-foreground'>
            {pageTitles[currentRoute] || 'MeshDrop'}
          </h1>
          <p className='hidden md:block font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70'>
            P2P file sharing
          </p>
        </div>
      </div>

      {/* Global Command Palette Trigger (Cmd+K) — hidden on small screens (⌘K still works) */}
      <div className='no-drag hidden md:block mx-auto max-w-md flex-1'>
        <button
          onClick={toggleCommandPalette}
          className='group flex w-full items-center gap-2.5 rounded-xl border border-hairline/10 bg-card/40 px-3.5 py-1.5 text-xs text-muted-foreground shadow-sm transition-all hover:bg-card/80 hover:border-primary/30'
        >
          <Search className='h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground' />
          <span className='flex-1 text-left'>Search nodes, transfers, actions...</span>
          <span className='rounded-md border border-hairline/10 bg-muted/60 px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground'>
            ⌘K
          </span>
        </button>
      </div>

      {/* Right: Live mesh status + actions */}
      <div className='flex items-center gap-2'>
        {/* Live P2P Mesh Status Pill */}
        <div
          className={cn(
            'no-drag hidden lg:flex items-center gap-2 rounded-full border px-3 py-1.5',
            meshOnline ? 'border-meshdrop-cyan/30 bg-meshdrop-cyan/10' : 'border-hairline/10 bg-muted/20'
          )}
          title='Live P2P mesh status'
        >
          <span className='relative flex h-2 w-2'>
            <span
              className={cn(
                'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
                meshOnline ? 'bg-meshdrop-cyan' : 'bg-muted-foreground/60'
              )}
            />
            <span
              className={cn(
                'relative inline-flex h-2 w-2 rounded-full',
                meshOnline ? 'bg-meshdrop-cyan' : 'bg-muted-foreground/60'
              )}
            />
          </span>
          <span
            className={cn(
              'font-mono text-[10px] font-extrabold',
              meshOnline ? 'text-meshdrop-cyan' : 'text-muted-foreground'
            )}
          >
            {meshOnline ? (
              <>
                Online
                {peers != null && peers > 0
                  ? ` · ${peers} peer${peers === 1 ? '' : 's'} connected`
                  : ' · no devices attached'}
              </>
            ) : (
              'Connecting…'
            )}
          </span>
        </div>

        {/* Notifications */}
        <button
          onClick={toggleNotificationDrawer}
          className='no-drag relative rounded-xl border border-hairline/10 bg-card/40 p-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground'
          title='Notifications'
        >
          <Bell className='h-4 w-4' />
          {unreadCount > 0 && (
            <span className='absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white shadow-sm'>
              {unreadCount}
            </span>
          )}
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggle}
          className='no-drag rounded-xl border border-hairline/10 bg-card/40 p-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground'
          title='Toggle Theme'
        >
          {theme === 'dark' ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
        </button>

        {/* Profile Pill */}
        <button
          onClick={(e) => setProfileMenu({ x: e.clientX, y: e.clientY })}
          className='no-drag flex items-center gap-2 border-l border-hairline/10 pl-2'
          aria-label='Open profile menu'
        >
          <div className='relative flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 border border-primary/25 text-primary'>
            <User className='h-4 w-4' />
            <span className='absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-meshdrop-cyan ring-2 ring-background' />
          </div>
        </button>

        {/* Custom window controls (frameless desktop frame only) */}
        <WindowControls />
      </div>

      {profileMenu && (
        <ContextMenu
          x={profileMenu.x}
          y={profileMenu.y}
          onClose={() => setProfileMenu(null)}
          items={[
            {
              label: 'Copy Device Address',
              icon: <ShieldCheck className='h-3.5 w-3.5' />,
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
              icon: <ShieldCheck className='h-3.5 w-3.5' />,
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
    </header>
  )
}
