import { useRef, useState } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  Star,
  Info,
  Edit3,
  ArrowRight,
  Trash2,
  Send,
  Waypoints
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DeviceAvatar } from '@/components/DeviceAvatar'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { cn } from '@/lib/utils'
import type { Device } from '@/types'

interface DeviceCardProps {
  device: Device
  onSend: (device: Device) => void
  onSendDrop: (device: Device, file: File) => void
  onViewDetails: (device: Device) => void
  onToggleTrust: (device: Device) => void
  onToggleFavorite: (device: Device) => void
  onRemove: (device: Device) => void
}

export function DeviceCard({
  device,
  onSend,
  onSendDrop,
  onViewDetails,
  onToggleTrust,
  onToggleFavorite,
  onRemove
}: DeviceCardProps) {
  const [dragging, setDragging] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const dropCount = useRef(0)

  const items: ContextMenuItem[] = [
    {
      label: 'Details / Rename',
      icon: <Edit3 className='h-3.5 w-3.5' />,
      onClick: () => onViewDetails(device)
    },
    {
      label: device.isTrusted ? 'Untrust Device' : 'Trust Device',
      icon: device.isTrusted ? (
        <ShieldAlert className='h-3.5 w-3.5' />
      ) : (
        <ShieldCheck className='h-3.5 w-3.5' />
      ),
      onClick: () => onToggleTrust(device)
    },
    {
      label: 'Send Files',
      icon: <Send className='h-3.5 w-3.5' />,
      onClick: () => onSend(device),
      disabled: !device.isOnline
    },
    { separator: true },
    {
      label: 'Remove Device',
      icon: <Trash2 className='h-3.5 w-3.5' />,
      onClick: () => onRemove(device),
      destructive: true
    }
  ]

  return (
    <Card
      className={cn(
        'glass-card rounded-2xl border border-hairline/10 transition-all hover:border-meshdrop-cyan/40 hover:shadow-[0_0_28px_-10px_rgba(6,182,212,0.4)]',
        !device.isOnline && 'opacity-80'
      )}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
      onDragOver={(e) => {
        if (!device.isOnline) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (dropCount.current === 0) setDragging(true)
        dropCount.current++
      }}
      onDragLeave={() => {
        dropCount.current = Math.max(0, dropCount.current - 1)
        if (dropCount.current === 0) setDragging(false)
      }}
      onDrop={(e) => {
        if (!device.isOnline) return
        e.preventDefault()
        setDragging(false)
        dropCount.current = 0
        const file = e.dataTransfer.files?.[0]
        if (file) onSendDrop(device, file)
      }}
    >
      <div className={cn('space-y-4 p-5 transition-colors', dragging && 'bg-primary/10')}>
        <div className='flex items-start justify-between'>
          <div className='flex items-center gap-3'>
            <DeviceAvatar name={device.name} os={device.os} />
            <div className='min-w-0'>
              <h3 className='flex items-center gap-1.5 truncate text-sm font-bold text-foreground'>
                {device.name}
                {device.isTrusted ? (
                  <ShieldCheck className='h-3.5 w-3.5 shrink-0 text-primary' aria-label='Trusted' />
                ) : (
                  <ShieldAlert
                    className='h-3.5 w-3.5 shrink-0 text-status-away'
                    aria-label='Untrusted'
                  />
                )}
                {device.relayed && (
                  <span title='Connection relayed via DHT' className='flex shrink-0 items-center'>
                    <Waypoints
                      className='h-3 w-3 text-muted-foreground/70'
                      aria-label='Relayed connection'
                    />
                  </span>
                )}
                {(device as any).relayedViaOwnPeer && (
                  <span
                    title='Connection relayed through your own device'
                    className='flex shrink-0 items-center'
                  >
                    <Waypoints
                      className='h-3 w-3 text-meshdrop-cyan'
                      aria-label='Relayed via your own device'
                    />
                  </span>
                )}
              </h3>
              <p className='truncate text-[11px] text-muted-foreground'>{device.osVersion}</p>
            </div>
          </div>

          <div className='flex flex-col items-end gap-1.5'>
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                device.isOnline ? 'bg-status-online' : 'bg-muted-foreground/40'
              )}
            />
            {device.isOnline && (
              <span className='rounded-full border border-status-online/30 bg-status-online/15 px-2 py-0.5 font-mono text-[10px] font-bold text-status-online'>
                {device.latencyMs}ms
              </span>
            )}
          </div>
        </div>

        <div className='flex items-center gap-1.5'>
          <Badge
            variant={device.isTrusted ? 'success' : 'warning'}
            className='gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold'
          >
            <ShieldCheck className='h-2.5 w-2.5' />
            {device.isTrusted ? 'Trusted' : 'Untrusted'}
          </Badge>
          {device.isEncrypted && (
            <span className='rounded-md border border-meshdrop-cyan/30 bg-meshdrop-cyan/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-meshdrop-cyan'>
              Encrypted
            </span>
          )}
          {device.isOnline && (
            <span
              className={cn(
                'rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold',
                device.transferMethod === 'lan'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : device.transferMethod === 'relay' || device.relayed
                    ? 'border-purple-500/30 bg-purple-500/10 text-purple-400'
                    : 'border-blue-500/30 bg-blue-500/10 text-blue-400'
              )}
            >
              {device.transferMethod === 'lan'
                ? '⚡ LAN'
                : device.transferMethod === 'relay' || device.relayed
                  ? '🌐 Relay'
                  : '🔗 Direct'}
            </span>
          )}
          {dragging && (
            <span className='text-[10px] font-bold text-primary'>Drop to send files</span>
          )}
        </div>

        <div className='flex items-center justify-between border-t border-border/40 pt-3'>
          <Button
            variant='outline'
            size='sm'
            className='h-8 text-xs font-medium'
            onClick={() => onViewDetails(device)}
          >
            Details
          </Button>
          <div className='flex items-center gap-1'>
            <Button
              size='icon'
              variant='ghost'
              className='h-8 w-8 text-muted-foreground hover:text-status-away'
              aria-label={device.isFavorite ? 'Remove favorite' : 'Mark favorite'}
              onClick={() => onToggleFavorite(device)}
            >
              <Star
                className={cn(
                  'h-3.5 w-3.5',
                  device.isFavorite && 'fill-status-away text-status-away'
                )}
              />
            </Button>
            {!device.isTrusted && device.isOnline && (
              <Button
                size='sm'
                variant='outline'
                className='h-8 gap-1 text-[11px] font-bold border-meshdrop-cyan/30 text-meshdrop-cyan hover:bg-meshdrop-cyan/10'
                onClick={() => onToggleTrust(device)}
                title='Allow this device to send you files directly'
              >
                <ShieldCheck className='h-3.5 w-3.5' />
                Trust
              </Button>
            )}
            <Button
              size='sm'
              disabled={!device.isOnline}
              className='h-8 gap-1.5 text-xs font-bold'
              onClick={() => onSend(device)}
              title={device.isOnline ? 'Send files' : 'Device is offline'}
            >
              Send File
              <ArrowRight className='h-3.5 w-3.5' />
            </Button>
          </div>
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </Card>
  )
}
