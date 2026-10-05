import { useRef, useState } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  Star,
  ChevronDown,
  ChevronUp,
  Edit3,
  Check,
  X,
  ArrowRight,
  Trash2,
  Send,
  Waypoints,
  Zap,
  Monitor,
} from 'lucide-react'
import { Card } from '@/ui/primitives/Card'
import { Badge } from '@/ui/primitives/Badge'
import { Button } from '@/ui/primitives/Button'
import { DeviceAvatar } from '@/ui/primitives/DeviceAvatar'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/ui/primitives/Sheet'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/format'
import type { Device } from '@/types'

interface DeviceCardProps {
  device: Device
  onSend: (device: Device) => void
  onSendDrop: (device: Device, file: File) => void
  onViewDetails: (device: Device) => void
  onToggleTrust: (device: Device) => void
  onToggleFavorite: (device: Device) => void
  onRemove: (device: Device, opts?: { cancelDropCodes?: boolean }) => void
  onRename?: (device: Device, newName: string) => void
}

function platformLabel(dev: Device): string {
  const os = dev.os || 'device'
  const ver = dev.osVersion ? ` · ${dev.osVersion}` : ''
  return `${os}${ver}`
}

function presenceText(dev: Device): string {
  if (dev.isOnline) return 'Online now'
  if (dev.lastSeen) return formatTime(dev.lastSeen)
  return 'Offline'
}

export function DeviceCard({
  device,
  onSend,
  onSendDrop,
  onViewDetails,
  onToggleTrust,
  onToggleFavorite,
  onRemove,
  onRename,
}: DeviceCardProps) {
  const [dragging, setDragging] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(device.name)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelDropCodes, setCancelDropCodes] = useState(false)
  const dropCount = useRef(0)

  const handleSaveRename = () => {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === device.name) {
      setEditing(false)
      setEditName(device.name)
      return
    }
    if (!onRename) { setEditing(false); return }
    onRename(device, trimmed)
    setEditing(false)
  }

  const presence: 'online' | 'offline' = device.isOnline ? 'online' : 'offline'

  return (
    <>
      <Card
        className={cn(
          'group overflow-hidden rounded-[20px] border border-border/50 bg-card shadow-sm transition-all hover:shadow-md hover:border-primary/20',
          !device.isOnline && 'opacity-[0.92]',
          dragging && 'border-primary/40 bg-primary/[0.04] shadow-[0_0_28px_-12px_rgba(99,102,241,0.4)]',
        )}
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
        {/* Presence-first header */}
        <div className="p-5 pb-3">
          <div className="flex items-start gap-3">
            <DeviceAvatar
              name={device.name}
              os={String(device.os || 'windows')}
              size="md"
              presence={presence}
              pulse={device.isOnline}
            />
            <div className="min-w-0 flex-1">
              {editing ? (
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSaveRename()
                  }}
                >
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setEditing(false)
                        setEditName(device.name)
                      }
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-primary bg-background px-2.5 py-1 text-sm font-bold text-foreground outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <Button type="submit" size="icon" className="h-7 w-7 shrink-0">
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => {
                      setEditing(false)
                      setEditName(device.name)
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </form>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-sm font-black tracking-tight text-foreground" title={device.name}>
                    {device.name}
                  </h3>
                  {onRename && (
                    <button
                      onClick={() => {
                        setEditName(device.name)
                        setEditing(true)
                      }}
                      className="rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
                      aria-label="Rename device"
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                  )}
                  {device.isFavorite && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                </div>
              )}
              <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground" title={platformLabel(device)}>
                <Monitor className="h-3 w-3 shrink-0 opacity-60" />
                <span className="truncate capitalize">{platformLabel(device)}</span>
              </p>
              <p className={cn('mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold', device.isOnline ? 'text-[rgb(var(--success))]' : 'text-muted-foreground')}>
                <span className={cn('h-1.5 w-1.5 rounded-full', device.isOnline ? 'bg-[rgb(var(--success))]' : 'bg-muted-foreground/40')} />
                {presenceText(device)}
                {device.isOnline && device.latencyMs != null && (
                  <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground">· {device.latencyMs}ms</span>
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-amber-500"
                aria-label={device.isFavorite ? 'Remove favorite' : 'Mark favorite'}
                onClick={() => onToggleFavorite(device)}
              >
                <Star className={cn('h-4 w-4', device.isFavorite && 'fill-amber-400 text-amber-400')} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label={expanded ? 'Hide details' : 'Show details'}
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Badges */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge variant={device.isTrusted ? 'success' : 'warning'} className="gap-1 px-2 py-0.5 text-[10px] font-bold">
              <ShieldCheck className="h-3 w-3" />
              {device.isTrusted ? 'Trusted' : device.lanLevel ? 'Detected on LAN' : 'Not Paired'}
            </Badge>
            {device.isEncrypted && (
              <Badge variant="info" className="gap-1 px-2 py-0.5 text-[10px] font-bold">
                <ShieldCheck className="h-3 w-3" />
                Encrypted
              </Badge>
            )}
            {device.transferMethod === 'lan' && device.isOnline && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                <Zap className="h-3 w-3" />
                LAN
              </span>
            )}
            {device.relayed && (
              <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400">
                <Waypoints className="h-3 w-3" />
                Relayed
              </span>
            )}
            {(device as any).relayedViaOwnPeer && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--meshdrop-cyan)/0.25)] bg-[rgb(var(--meshdrop-cyan)/0.08)] px-2 py-0.5 text-[10px] font-bold text-[rgb(var(--meshdrop-cyan))]">
                <Waypoints className="h-3 w-3" />
                Via your device
              </span>
            )}
            {dragging && <span className="text-[11px] font-bold text-primary">Drop to send files</span>}
          </div>
        </div>

        {/* Expandable details */}
        {expanded && (
          <div className="mx-5 mb-3 rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold uppercase tracking-widest text-muted-foreground">Details</span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] font-semibold" onClick={() => onViewDetails(device)}>
                Open
              </Button>
            </div>
            <div className="grid gap-2 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Device ID</span>
                <span className="max-w-[180px] truncate font-mono text-[11px] font-medium text-foreground" title={device.id}>
                  {device.id}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Address</span>
                <span className="font-mono text-[11px] font-medium text-foreground">{device.ipAddress || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Network</span>
                <span className="font-mono text-[11px] font-medium text-foreground capitalize">
                  {(device.networkType || 'direct').replace(/_/g, ' ')}
                </span>
              </div>
              {device.lastSeen && !device.isOnline && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Last seen</span>
                  <span className="text-[11px] font-medium text-foreground">{formatTime(device.lastSeen)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 border-t border-border/40 bg-muted/10 px-3 py-3">
          <Button
            size="sm"
            disabled={!device.isOnline}
            className="h-8 flex-1 gap-1.5 text-xs font-bold"
            onClick={() => onSend(device)}
            title={device.isOnline ? 'Send files' : 'Device is offline'}
          >
            <Send className="h-3.5 w-3.5" />
            Send File
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant={device.isTrusted ? 'ghost' : 'outline'}
            className={cn(
              'h-8 gap-1 text-[11px] font-bold',
              !device.isTrusted && device.isOnline && 'border-[rgb(var(--meshdrop-cyan)/0.25)] text-[rgb(var(--meshdrop-cyan))] hover:bg-[rgb(var(--meshdrop-cyan)/0.08)]',
            )}
            onClick={() => onToggleTrust(device)}
            title={device.isTrusted ? 'Untrust this device' : 'Trust this device'}
          >
            {device.isTrusted ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {device.isTrusted ? 'Untrust' : 'Trust'}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmOpen(true)}
            aria-label="Remove device"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Remove confirm Sheet — preserves cancelDropCodes */}
      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Remove {device.name}?</SheetTitle>
            <SheetDescription>
              The device will be unpaired and removed from your device list. This cannot be undone. Its folder-sync access is revoked
              immediately.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={cancelDropCodes}
                onChange={(e) => setCancelDropCodes(e.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <span>
                Also cancel active drop codes
                <span className="block text-[10px] opacity-70">
                  Drop codes are not device-bound — anyone holding one can claim it until it expires. Off by default in case a code was
                  shared beyond this device.
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onRemove(device, { cancelDropCodes })
                  setCancelDropCodes(false)
                  setConfirmOpen(false)
                }}
              >
                Remove Device
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
