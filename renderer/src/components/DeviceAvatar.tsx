import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Monitor, Apple, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'

const OS_ICONS: Record<string, typeof Monitor> = {
  windows: Monitor,
  macos: Apple,
  linux: Terminal
}

interface DeviceAvatarProps {
  name: string
  os: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: 'h-8 w-8 rounded-lg text-[10px]',
  md: 'h-10 w-10 rounded-xl text-xs',
  lg: 'h-12 w-12 rounded-2xl text-sm'
} as const

export function DeviceAvatar({ name, os, size = 'md' }: DeviceAvatarProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const OsIcon = OS_ICONS[os] || Monitor

  return (
    <Avatar className={cn('shrink-0 border border-primary/20 shadow-sm', SIZES[size])}>
      <AvatarFallback
        className={cn(
          'bg-gradient-to-tr from-primary/25 via-indigo-500/20 to-accent/25 font-black text-primary',
          SIZES[size]
        )}
      >
        <span className='relative'>
          {initials}
          <OsIcon className='absolute -bottom-2 -right-2 h-3.5 w-3.5 rounded-full bg-card p-0.5 text-muted-foreground' />
        </span>
      </AvatarFallback>
    </Avatar>
  )
}
