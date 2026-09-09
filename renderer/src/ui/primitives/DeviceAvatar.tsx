import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Monitor, Apple, Terminal, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

type Presence = 'online' | 'offline' | 'away' | 'busy'
type AvatarSize = 'sm' | 'md' | 'lg'

const SIZES: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 rounded-lg text-[10px]',
  md: 'h-10 w-10 rounded-xl text-xs',
  lg: 'h-12 w-12 rounded-2xl text-sm',
}

const PRESENCE_DOT: Record<Presence, string> = {
  online: 'bg-[rgb(var(--status-online))]',
  offline: 'bg-[rgb(var(--status-offline))]',
  away: 'bg-[rgb(var(--status-away))]',
  busy: 'bg-[rgb(var(--status-busy))]',
}

const OS_ICONS: Record<string, typeof Monitor> = {
  windows: Monitor,
  macos: Apple,
  linux: Terminal,
  android: Smartphone,
  ios: Smartphone,
}

interface DeviceAvatarProps {
  name: string
  os?: string
  size?: AvatarSize
  presence?: Presence
  pulse?: boolean
  className?: string
}

export function DeviceAvatar({ name, os = 'windows', size = 'md', presence = 'offline', pulse = false, className }: DeviceAvatarProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const OsIcon = OS_ICONS[os] ?? Monitor
  const showPulse = pulse && presence === 'online'

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      <Avatar className={cn('shrink-0 border border-primary/20 shadow-sm', SIZES[size])}>
        <AvatarFallback className={cn('bg-gradient-to-tr from-primary/25 via-indigo-500/20 to-accent/25 font-black text-primary', SIZES[size])}>
          <span className="relative">
            {initials}
            <OsIcon className="absolute -bottom-2 -right-2 h-3.5 w-3.5 rounded-full bg-card p-0.5 text-muted-foreground" aria-hidden />
          </span>
        </AvatarFallback>
      </Avatar>
      {/* Presence dot */}
      <span
        aria-hidden
        className={cn(
          'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card',
          PRESENCE_DOT[presence],
          showPulse && 'animate-pulse-ring',
        )}
      />
      {showPulse && (
        <span aria-hidden className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full opacity-60', PRESENCE_DOT[presence], 'animate-pulse-ring')} />
      )}
    </div>
  )
}
