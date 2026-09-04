import { useRef, useState } from 'react'
import {
  Upload,
  Link2,
  Download,
  FolderOpen,
  Clock,
  Network,
  ArrowRight,
  XCircle,
  Copy,
  Check,
  Sparkles
} from 'lucide-react'
import { useDevices } from '@/hooks/useDevices'
import { useTransfers } from '@/hooks/useTransfers'
import { useActivity } from '@/hooks/useActivity'
import { useApp } from '@/hooks/useAppState'
import { useShares } from '@/hooks/useShares'
import { useNavigation } from '@/hooks/useNavigation'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DeviceCard } from '@/components/DeviceCard'
import { ConfirmDialog } from '@/components/Modal'
import { formatBytes, formatTime } from '@/lib/format'
import { buildShareLink, shareLinkMeta } from '@/lib/shareLinks'
import { cn } from '@/lib/utils'
import type { Device, PendingShare } from '@/types'

function formatRemaining(expiresAt: number): string {
  if (!expiresAt || expiresAt <= 0) return 'Never expires'
  const ms = expiresAt - Date.now()
  if (ms <= 0) return 'Expired'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function shareLabel(share: { filename: string; files?: { filename: string }[]; folderName?: string | null }): string {
  const count = share.files?.length || 1
  if (share.folderName) return `${share.folderName} (${count} file${count === 1 ? '' : 's'})`
  if (count > 1) return `${count} files`
  return share.filename
}

export function Dashboard() {
  const { devices, toggleTrustDevice, toggleFavoriteDevice, removeDevice, setInspectingDevice } =
    useDevices()
  const { transfers, sendFileToDevice, sendFilePath } = useTransfers()
  const { activity } = useActivity()
  const { diagnostics } = useApp()
  const {
    pendingShares,
    toggleOneTimeReceiveModal,
    toggleDropCodeModal,
    openShareWith,
    cancelShareCode
  } = useShares()
  const { navigate } = useNavigation()
  const { toast } = useToast()

  const [removeTarget, setRemoveTarget] = useState<Device | null>(null)
  const [zoneDragging, setZoneDragging] = useState(false)
  const [folderBusy, setFolderBusy] = useState(false)
  const [copiedId, setCopiedId] = useState('')
  const zoneDepth = useRef(0)

  const activeShares = pendingShares.filter((s) => s.status === 'waiting' || s.status === 'claimed')
  const onlineDevices = devices.filter((d) => d.isOnline)
  const pendingTransfers = transfers.filter(
    (t) => t.status === 'pending_approval' || t.status === 'queued' || t.status === 'waiting_peer'
  ).length
  const completedTransfers = transfers.filter((t) => t.status === 'completed').length
  const recentActivity = activity.filter((a) => a.type !== 'notification').slice(0, 4)
  const meshOnline = diagnostics.connected !== false

  const pickFiles = async () => {
    if (!window.bridge?.openFilesDialog) {
      toast.error('Unavailable', 'File dialogs are only available in the desktop app')
      return
    }
    try {
      const picked = await window.bridge.openFilesDialog()
      if (picked && picked.length > 0) openShareWith({ files: picked })
    } catch {
      toast.error('File Pick Failed', 'Could not open the file picker.')
    }
  }

  const pickFolder = async () => {
    if (!window.bridge?.openFolderDialog) {
      toast.error('Unavailable', 'Folder dialogs are only available in the desktop app')
      return
    }
    setFolderBusy(true)
    try {
      const folderPath = await window.bridge.openFolderDialog()
      if (folderPath) {
        openShareWith({
          folderPath,
          name: folderPath.split(/[\\/]/).pop() || folderPath
        })
      }
    } catch {
      toast.error('Folder Pick Failed', 'Could not open the folder picker.')
    } finally {
      setFolderBusy(false)
    }
  }

  const resolveDroppedFiles = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files || [])
    if (!files.length) return
    const picked = files
      .map((f) => ({
        filePath: window.bridge?.getPathForFile?.(f) || '',
        filename: f.name,
        fileSize: f.size
      }))
      .filter((f) => f.filePath)
    if (!picked.length) {
      toast.error('Drop Failed', 'Could not resolve the dropped file path.')
      return
    }
    openShareWith({ files: picked })
  }

  const handleSendDrop = (dev: Device, file: File) => sendFilePath(dev, file)

const copyLink = async (s: PendingShare) => {
  try {
    await navigator.clipboard.writeText(buildShareLink(s.code, shareLinkMeta(s)))
    setCopiedId(s.id)
    toast.success('Link Copied', `${s.code} copied — paste it anywhere.`)
    setTimeout(() => setCopiedId((v) => (v === s.id ? '' : v)), 2000)
  } catch {
    toast.error('Copy Failed', 'Could not copy the link.')
  }
}

  const revokeShare = async (s: PendingShare) => {
    try {
      await cancelShareCode(s.id)
      toast.success('Code Revoked', `${s.code} is no longer valid.`)
    } catch (err: any) {
      toast.error('Revoke Failed', err?.message || 'Could not revoke the code.')
    }
  }

  return (
    <div className='space-y-6 pb-12'>
      {/* ── Hero: the share drop zone ─────────────────────────────────── */}
      <div className='glass-card gradient-border overflow-hidden relative'>
        <div className='absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl' />
        <div className='absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-meshdrop-cyan/10 blur-3xl' />
        <div className='relative z-10 p-6 md:p-8 space-y-5'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='rounded-full border border-meshdrop-cyan/30 bg-meshdrop-cyan/10 px-3 py-1 text-[11px] font-bold text-meshdrop-cyan flex items-center gap-1.5 w-fit'>
              <Sparkles className='h-3.5 w-3.5' /> Share a file with a link
            </span>
            <span className='flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground'>
              <span className='relative flex h-2 w-2'>
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
                    meshOnline && 'bg-meshdrop-cyan'
                  )}
                />
                <span
                  className={cn(
                    'relative inline-flex h-2 w-2 rounded-full',
                    meshOnline ? 'bg-meshdrop-cyan' : 'bg-muted-foreground/50'
                  )}
                />
              </span>
              {meshOnline ? 'Online' : 'Connecting…'}
            </span>
          </div>

          <div
            role='group'
            aria-label='File drop zone — drop files or use buttons below'
            tabIndex={0}
            onClick={(e) => {
              if (e.target === e.currentTarget) pickFiles()
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                e.preventDefault()
                pickFiles()
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault()
              zoneDepth.current++
              setZoneDragging(true)
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              e.preventDefault()
              zoneDepth.current = Math.max(0, zoneDepth.current - 1)
              if (zoneDepth.current === 0) setZoneDragging(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              zoneDepth.current = 0
              setZoneDragging(false)
              resolveDroppedFiles(e)
            }}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              zoneDragging
                ? 'border-primary/70 bg-primary/10 scale-[1.01]'
                : 'border-hairline/15 bg-muted/20 hover:border-primary/50 hover:bg-primary/5'
            )}
          >
            <div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/25'>
              <Upload className='h-7 w-7' />
            </div>
            <div className='space-y-1'>
              <p className='text-lg font-black text-foreground'>
                {zoneDragging ? 'Drop to share' : 'Drop files here to share'}
              </p>
              <p className='text-xs text-muted-foreground max-w-md mx-auto'>
                Get a one-time link. Files go device-to-device — no cloud, no account, no size
                limits.
              </p>
            </div>
            <div className='flex flex-wrap items-center justify-center gap-2 pt-1'>
              <Button
                size='sm'
                className='gap-1.5 text-xs font-bold'
                onClick={(e) => {
                  e.stopPropagation()
                  pickFiles()
                }}
              >
                <Link2 className='h-3.5 w-3.5' /> Choose Files
              </Button>
              <Button
                size='sm'
                variant='outline'
                className='gap-1.5 border-hairline/15 text-xs font-bold'
                onClick={(e) => {
                  e.stopPropagation()
                  pickFolder()
                }}
                disabled={folderBusy}
              >
                <FolderOpen className='h-3.5 w-3.5' /> {folderBusy ? 'Reading…' : 'Share a Folder'}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                className='gap-1.5 text-xs font-bold'
                onClick={(e) => {
                  e.stopPropagation()
                  toggleOneTimeReceiveModal()
                }}
              >
                <Download className='h-3.5 w-3.5' /> Have a code? Receive
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Compact stats strip (user-meaningful only) ────────────────── */}
      <div className='grid grid-cols-3 gap-4'>
        <button
          onClick={() => navigate('/transfers')}
          className='glass-card rounded-2xl border border-border/60 p-4 text-left transition-all hover:border-primary/40'
        >
          <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
            Active Shares
          </p>
          <p className='mt-0.5 text-2xl font-black text-foreground'>{activeShares.length}</p>
          <p className='mt-1 text-[10px] font-bold text-muted-foreground flex items-center gap-1'>
            <Link2 className='h-3 w-3 text-primary' />
            {activeShares.length > 0 ? 'Links waiting to be claimed' : 'No links yet'}
          </p>
        </button>
        <button
          onClick={() => navigate('/transfers')}
          className='glass-card rounded-2xl border border-border/60 p-4 text-left transition-all hover:border-primary/40'
        >
          <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
            Pending Transfers
          </p>
          <p className='mt-0.5 text-2xl font-black text-foreground'>{pendingTransfers}</p>
          <p className='mt-1 text-[10px] font-bold text-muted-foreground flex items-center gap-1'>
            <span className={cn('h-2 w-2 rounded-full', pendingTransfers > 0 ? 'bg-meshdrop-cyan' : 'bg-muted-foreground/40')} />
            {pendingTransfers > 0 ? 'Incoming or queued' : 'All caught up'}
          </p>
        </button>
        <button
          onClick={() => navigate('/transfers')}
          className='glass-card rounded-2xl border border-border/60 p-4 text-left transition-all hover:border-primary/40'
        >
          <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
            Completed
          </p>
          <p className='mt-0.5 text-2xl font-black text-foreground'>{completedTransfers}</p>
          <p className='mt-1 text-[10px] font-bold text-muted-foreground flex items-center gap-1'>
            <Sparkles className='h-3 w-3 text-meshdrop-cyan' /> Verified transfers
          </p>
        </button>
      </div>

      {/* ── Active one-time shares ────────────────────────────────────── */}
      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <h3 className='text-sm font-extrabold text-foreground flex items-center gap-2'>
            <Link2 className='h-4 w-4 text-primary' /> Your Active Links
          </h3>
          <Button
            variant='ghost'
            size='sm'
            className='gap-1 text-xs font-semibold text-primary'
            onClick={toggleDropCodeModal}
          >
            Share another <ArrowRight className='h-3.5 w-3.5' />
          </Button>
        </div>

        {activeShares.length === 0 ? (
          <div className='rounded-2xl border border-dashed border-hairline/10 glass-card p-6 text-center'>
            <p className='text-xs font-bold text-foreground'>No active links</p>
            <p className='mt-1 text-[11px] text-muted-foreground max-w-sm mx-auto'>
              Drop a file above — a one-time link appears here, ready to copy.
            </p>
          </div>
        ) : (
          <div className='space-y-2'>
            {activeShares.map((s) => (
              <div
                key={s.id}
                className='flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5'
              >
                <div className='min-w-0 flex-1'>
                  <p className='truncate font-mono text-sm font-black tracking-wider text-primary'>
                    {s.code}
                  </p>
                  <p className='truncate text-[11px] text-muted-foreground'>
                    {shareLabel(s)} · {formatBytes(s.fileSize)}
                  </p>
                </div>
                <span className='font-mono text-[10px] text-muted-foreground tabular-nums'>
                  {s.expiresAt > 0 ? `${formatRemaining(s.expiresAt)} left` : '—'}
                </span>
                <Button
                  size='sm'
                  variant='outline'
                  className='h-7 gap-1.5 px-2.5 text-[10px] font-bold'
                  onClick={() => copyLink(s)}
                >
                  {copiedId === s.id ? (
                    <Check className='h-3 w-3 text-status-online' />
                  ) : (
                    <Copy className='h-3 w-3' />
                  )}
                  {copiedId === s.id ? 'Copied' : 'Copy Link'}
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  className='h-7 px-2 text-[10px] font-bold text-destructive'
                  onClick={() => revokeShare(s)}
                >
                  <XCircle className='mr-1 h-3 w-3' /> Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Your devices ──────────────────────────────────────────────── */}
      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <h3 className='text-sm font-extrabold text-foreground flex items-center gap-2'>
            <Network className='h-4 w-4 text-meshdrop-cyan' /> Your Devices
            <span className='rounded-full border border-hairline/10 bg-muted/30 px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground'>
              {onlineDevices.length} online
            </span>
          </h3>
          <Button
            variant='ghost'
            size='sm'
            className='gap-1 text-xs font-semibold text-primary'
            onClick={() => navigate('/devices')}
          >
            Manage ({devices.length}) <ArrowRight className='h-3.5 w-3.5' />
          </Button>
        </div>

        {onlineDevices.length === 0 ? (
          <div className='rounded-2xl border border-dashed border-hairline/10 glass-card p-8 text-center space-y-3'>
            <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground border border-hairline/10'>
              <Network className='h-6 w-6' />
            </div>
            <div className='space-y-1'>
              <p className='text-xs font-bold text-foreground'>No devices connected</p>
              <p className='text-[11px] text-muted-foreground max-w-sm mx-auto'>
                You can still share files with anyone using a link above. Pair your other devices
                for direct transfers.
              </p>
            </div>
            <Button size='sm' className='gap-1.5 text-xs font-bold' onClick={() => navigate('/devices')}>
              <Network className='h-3.5 w-3.5' /> Pair a Device
            </Button>
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
            {onlineDevices.map((dev) => (
              <DeviceCard
                key={dev.id}
                device={dev}
                onSend={(d) => d.isOnline && sendFileToDevice(d)}
                onSendDrop={handleSendDrop}
                onViewDetails={setInspectingDevice}
                onToggleTrust={(d) => toggleTrustDevice(d.id)}
                onToggleFavorite={(d) => toggleFavoriteDevice(d.id)}
                onRemove={setRemoveTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Recent activity ───────────────────────────────────────────── */}
      <Card className='glass-card border-hairline/10'>
        <CardContent className='p-4 space-y-3'>
          <div className='flex items-center justify-between border-b border-hairline/10 pb-3'>
            <h3 className='text-sm font-bold text-foreground flex items-center gap-2'>
              <Clock className='h-4 w-4 text-meshdrop-cyan' /> Recent Activity
            </h3>
            <button
              onClick={() => navigate('/history')}
              className='text-[11px] font-semibold text-primary hover:underline'
            >
              History
            </button>
          </div>
          {recentActivity.length === 0 ? (
            <div className='py-6 text-center text-xs text-muted-foreground'>No recent activity.</div>
          ) : (
            <div className='space-y-2.5'>
              {recentActivity.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate('/activity')}
                  className='flex w-full items-center justify-between p-2.5 rounded-xl border border-hairline/10 bg-card/30 hover:bg-card/60 transition-all text-xs text-left'
                >
                  <div className='space-y-0.5 min-w-0'>
                    <p className='font-bold text-foreground truncate'>{item.title}</p>
                    <p className='text-[10px] text-muted-foreground truncate'>
                      {item.description || formatTime(item.timestamp)}
                    </p>
                  </div>
                  <ArrowRight className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remove Device Confirmation */}
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.name ?? 'Device'}?`}
        description='The device will be unpaired and removed from your device list. This cannot be undone.'
        confirmLabel='Remove Device'
        onConfirm={() => removeTarget && removeDevice(removeTarget.id)}
      />
    </div>
  )
}
