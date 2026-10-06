import { useEffect, useRef, useState } from 'react'
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
  Sparkles,
  FileText,
  QrCode,
  Timer,
  History,
  ShieldCheck
} from 'lucide-react'
import QRCode from 'qrcode'
import { useDevices } from '@/hooks/useDevices'
import { useTransfers } from '@/hooks/useTransfers'
import { useActivity } from '@/hooks/useActivity'
import { useApp } from '@/hooks/useAppState'
import { useShares } from '@/hooks/useShares'
import { useNavigation } from '@/hooks/useNavigation'
import { useToast } from '@/hooks/useToast'
import { useFirstRun } from '@/hooks/useFirstRun'
import { useTheme } from '@/hooks/useTheme'
import { Button } from '@/ui/primitives/Button'
import { Card, CardContent } from '@/ui/primitives/Card'
import { ProgressRing } from '@/ui/primitives/ProgressRing'
import { FileIcon } from '@/ui/primitives/FileIcon'
import { DeviceCard } from '@/components/DeviceCard'
import { FirstRunGuide } from '@/components/FirstRunGuide'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { formatBytes, formatTime } from '@/lib/format'
import { buildShareLink, shareLinkMeta } from '@/lib/shareLinks'
import { cn } from '@/lib/utils'
import {
  pickFiles as pickFilesCap,
  pickFolder as pickFolderCap,
  resolveDrop
} from '@/lib/capabilities'
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

const PRESET_MS: Record<string, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  never: 0
}

function getShareTotalMs(s: PendingShare): number {
  if (s.createdAt && s.expiresAt && s.expiresAt > s.createdAt) return s.expiresAt - s.createdAt
  const preset = (s.expirationPreset || '').toLowerCase()
  // `??`, not `||`: a `never` preset is 0 (no expiry) and 0 is falsy.
  return PRESET_MS[preset] ?? 30 * 60 * 1000
}

function getRingValue(s: PendingShare): number {
  const total = getShareTotalMs(s)
  if (!s.expiresAt || s.expiresAt <= 0) return 100
  const remain = s.expiresAt - Date.now()
  if (remain <= 0) return 0
  if (total <= 0) return 100
  return Math.max(0, Math.min(100, (remain / total) * 100))
}

export function Dashboard() {
  const { devices, toggleTrustDevice, toggleFavoriteDevice, removeDevice, setInspectingDevice, renameDevice } =
    useDevices()
  const { transfers, sendFileToDevice, sendFilePath } = useTransfers()
  const { activity } = useActivity()
  const { diagnostics } = useApp()
  const {
    pendingShares,
    toggleOneTimeReceiveModal,
    toggleDropCodeModal,
    openShareWith,
    cancelShareCode,
    extendShareExpiration
  } = useShares()
  const { navigate } = useNavigation()
  const { toast } = useToast()
  const { theme } = useTheme()
  const { firstRun, dismissFirstRun } = useFirstRun(
    devices.some((d) => d.isTrusted) || transfers.length > 0 || pendingShares.length > 0
  )

  const [removeTarget, setRemoveTarget] = useState<Device | null>(null)
  const [zoneDragging, setZoneDragging] = useState(false)
  const [folderBusy, setFolderBusy] = useState(false)
  const [copiedId, setCopiedId] = useState('')
  const [qrShare, setQrShare] = useState<PendingShare | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [tick, setTick] = useState(0)
  const zoneDepth = useRef(0)

  const activeShares = pendingShares.filter((s) => s.status === 'waiting' || s.status === 'claimed')
  const onlineDevices = devices.filter((d) => d.isOnline)
  const pendingTransfers = transfers.filter(
    (t) => t.status === 'pending_approval' || t.status === 'queued' || t.status === 'waiting_peer'
  ).length
  void pendingTransfers
  const completedTransfers = transfers.filter((t) => t.status === 'completed').length
  void completedTransfers
  const recentActivity = activity.filter((a) => a.type !== 'notification').slice(0, 4)
  const meshOnline = diagnostics.connected !== false

  // Live countdown + ring tick
  useEffect(() => {
    if (activeShares.length === 0) return
    const id = setInterval(() => setTick((v) => v + 1), 1000)
    return () => clearInterval(id)
  }, [activeShares.length])
  void tick

  // QR quick-view generation
  useEffect(() => {
    if (!qrShare?.code) {
      setQrDataUrl('')
      return
    }
    const link = buildShareLink(qrShare.code, shareLinkMeta(qrShare))
    const isDark = theme === 'dark'
    QRCode.toDataURL(link, {
      width: 240,
      margin: 2,
      color: { dark: isDark ? '#ffffff' : '#0f172a', light: '#0f172a00' }
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''))
  }, [qrShare, theme])

  const pickFiles = async () => {
    try {
      const picked = await pickFilesCap()
      if (picked && picked.length > 0) openShareWith({ files: picked })
    } catch {
      toast.error('File Pick Failed', 'Could not open the file picker.')
    }
  }

  const pickFolder = async () => {
    setFolderBusy(true)
    try {
      const folderPath = await pickFolderCap()
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

  const resolveDroppedFiles = async (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files || [])
    if (!files.length) return
    try {
      const picked = await resolveDrop(files)
      if (!picked.length) {
        toast.error('Drop Failed', 'Could not resolve the dropped file path.')
        return
      }
      openShareWith({ files: picked })
    } catch {
      toast.error('Drop Failed', 'Could not resolve the dropped file path.')
    }
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

  const extendShare = async (s: PendingShare, minutes: number) => {
    try {
      await extendShareExpiration(s.id, minutes)
      toast.success('Link Extended', `${s.code} extended by ${minutes} min.`)
    } catch (err: any) {
      toast.error('Extend Failed', err?.message || 'Could not extend the link.')
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ── Hero: lobby dropzone ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[24px] border border-border/50 bg-card shadow-sm">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[rgb(var(--meshdrop-cyan)/0.08)] blur-3xl pointer-events-none" />
        <div className="relative z-10 p-6 md:p-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-bold tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Share a file with a link
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping', meshOnline && 'bg-[rgb(var(--meshdrop-cyan))]')} />
                <span className={cn('relative inline-flex h-2 w-2 rounded-full', meshOnline ? 'bg-[rgb(var(--meshdrop-cyan))]' : 'bg-muted-foreground/50')} />
              </span>
              {meshOnline ? 'Online' : 'Connecting…'}
            </span>
          </div>

          <div
            role="group"
            aria-label="File drop zone — drop files or use buttons below"
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
              'flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 md:py-12 text-center transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              zoneDragging
                ? 'border-primary/60 bg-primary/[0.06] scale-[1.015] shadow-[0_0_36px_-16px_rgba(99,102,241,0.55)]'
                : 'border-border/60 bg-muted/10 hover:border-primary/30 hover:bg-primary/[0.03]'
            )}
          >
            <div
              className={cn(
                'flex h-14 w-14 items-center justify-center rounded-2xl border bg-primary/10 text-primary transition-all duration-300',
                zoneDragging ? 'scale-110 border-primary/40 shadow-lg' : 'border-primary/20'
              )}
            >
              <Upload className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <p className="text-[18px] font-black tracking-tight text-foreground">
                {zoneDragging ? 'Drop to share' : 'Drop files here to share'}
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                Get a one-time link. Files go device-to-device — no cloud, no account, no size limits.
              </p>
            </div>
            <p className="text-[10px] font-medium text-muted-foreground/70">Click the zone or use the actions below · multi-file · drag & drop · folder</p>
          </div>

          {/* Three actions under hero */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <Button
              size="default"
              className="gap-1.5 font-bold shadow-sm"
              onClick={(e) => {
                e.stopPropagation()
                pickFiles()
              }}
            >
              <Link2 className="h-4 w-4" /> Choose Files
            </Button>
            <Button
              variant="outline"
              size="default"
              className="gap-1.5 font-bold"
              onClick={(e) => {
                e.stopPropagation()
                pickFolder()
              }}
              disabled={folderBusy}
            >
              <FolderOpen className="h-4 w-4" /> {folderBusy ? 'Reading…' : 'Share a Folder'}
            </Button>
            <Button
              variant="ghost"
              size="default"
              className="gap-1.5 font-bold"
              onClick={(e) => {
                e.stopPropagation()
                toggleOneTimeReceiveModal()
              }}
            >
              <Download className="h-4 w-4" /> Have a code? Receive
            </Button>
          </div>
        </div>
      </div>

      {/* ── Live mini-feed replaces 3 stat cards ─────────────────────── */}
      {firstRun ? (
        <FirstRunGuide onShare={pickFiles} onDismiss={dismissFirstRun} />
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black tracking-widest uppercase text-muted-foreground flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[rgb(var(--success))] animate-pulse" />
                Live — recent activity
              </h3>
              <button onClick={() => navigate('/history')} className="text-[11px] font-semibold text-primary hover:underline">
                View all
              </button>
            </div>
            {recentActivity.length === 0 ? (
              <div className="py-6 text-center space-y-1">
                <History className="h-5 w-5 mx-auto text-muted-foreground/40" />
                <p className="text-xs font-semibold text-muted-foreground">No activity yet</p>
                <p className="text-[11px] text-muted-foreground/70">Share a file to see it here live.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentActivity.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/activity')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate('/activity')
                      }
                    }}
                    className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/40 px-3 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted border border-border/30 text-muted-foreground">
                      <FileIcon filename={item.title || 'file'} size="sm" className="bg-transparent border-0 h-8 w-8" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground" title={item.title}>
                        {item.title}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground" title={item.description || formatTime(item.timestamp)}>
                        {item.description || formatTime(item.timestamp)}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums hidden sm:inline">
                      {formatTime(item.timestamp)}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Your Active Links ───────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Your Active Links
            {activeShares.length > 0 && (
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                {activeShares.length}
              </span>
            )}
          </h3>
          <Button variant="ghost" size="sm" className="gap-1 text-xs font-semibold text-primary" onClick={toggleDropCodeModal}>
            Share another <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {activeShares.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted border border-border/30 text-muted-foreground">
                <Link2 className="h-5 w-5" />
              </div>
              <p className="mt-3 text-xs font-bold text-foreground">No active links</p>
              <p className="mt-1 text-[11px] text-muted-foreground max-w-sm mx-auto">Drop a file above — a one-time link appears here, ready to copy.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {activeShares.map((s) => {
              const val = getRingValue(s)
              const isExpired = s.expiresAt > 0 && Date.now() >= s.expiresAt
              const ringColor: 'primary' | 'warning' | 'muted' = isExpired ? 'muted' : val < 12 ? 'warning' : 'primary'
              const remaining = s.expiresAt > 0 ? formatRemaining(s.expiresAt) : '—'
              const label = shareLabel(s)
              return (
                <Card key={s.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-0">
                    <div className="flex flex-wrap items-center gap-3 px-3 py-3">
                      <ProgressRing value={val} size="sm" color={ringColor} aria-label={`${Math.round(val)} percent remaining`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm font-black tracking-wider text-primary" title={s.code}>
                          {s.code}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground flex items-center gap-1" title={`${label} · ${formatBytes(s.fileSize)}`}>
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate">{label}</span>
                          <span className="shrink-0">· {formatBytes(s.fileSize)}</span>
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
                        <Timer className="h-3 w-3" />
                        {s.expiresAt > 0 ? `${remaining} left` : '—'}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2.5 text-[11px] font-bold"
                          onClick={() => copyLink(s)}
                        >
                          {copiedId === s.id ? <Check className="h-3 w-3 text-[rgb(var(--success))]" /> : <Copy className="h-3 w-3" />}
                          {copiedId === s.id ? 'Copied ✓' : 'Copy Link'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          aria-label="Show QR"
                          onClick={() => setQrShare(s)}
                        >
                          <QrCode className="h-3.5 w-3.5" />
                        </Button>
                        <div className="flex items-center gap-1 rounded-full border border-border/40 bg-muted/20 p-0.5">
                          <button
                            onClick={() => extendShare(s, 15)}
                            className="rounded-full px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
                            title="Extend 15 minutes"
                          >
                            +15m
                          </button>
                          <button
                            onClick={() => extendShare(s, 60)}
                            className="rounded-full px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
                            title="Extend 1 hour"
                          >
                            +1h
                          </button>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] font-bold text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => revokeShare(s)}
                        >
                          <XCircle className="mr-1 h-3 w-3" /> Revoke
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Your devices (preserved) ────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
            <Network className="h-4 w-4 text-[rgb(var(--meshdrop-cyan))]" /> Your Devices
            <span className="rounded-full border border-border/30 bg-muted/30 px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
              {onlineDevices.length} online
            </span>
          </h3>
          <Button variant="ghost" size="sm" className="gap-1 text-xs font-semibold text-primary" onClick={() => navigate('/devices')}>
            Manage ({devices.length}) <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {onlineDevices.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground border border-border/30">
                <Network className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-foreground">No devices connected</p>
                <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                  You can still share files with anyone using a link above. Pair your other devices for direct transfers.
                </p>
              </div>
              <Button size="sm" className="gap-1.5 font-bold" onClick={() => navigate('/devices')}>
                <Network className="h-3.5 w-3.5" /> Pair a Device
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {onlineDevices.map((dev) => (
              <DeviceCard
                key={dev.id}
                device={dev}
                onSend={(d) => d.isOnline && sendFileToDevice(d)}
                onSendDrop={handleSendDrop}
                onViewDetails={setInspectingDevice}
                onToggleTrust={(d) => toggleTrustDevice(d.id)}
                onToggleFavorite={(d) => toggleFavoriteDevice(d.id)}
                onRemove={(d, opts) => removeDevice(d.id, opts)}
                onRename={(d, n) => renameDevice(d.id, n)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Recent activity (preserved) ─────────────────────────────── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border/30 pb-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-[rgb(var(--meshdrop-cyan))]" /> Recent Activity
            </h3>
            <button onClick={() => navigate('/history')} className="text-[11px] font-semibold text-primary hover:underline">
              History
            </button>
          </div>
          {recentActivity.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No recent activity.</div>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate('/activity')}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/40 p-2.5 text-left transition-colors hover:bg-accent/50 text-xs"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate font-bold text-foreground" title={item.title}>
                      {item.title}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground" title={item.description || formatTime(item.timestamp)}>
                      {item.description || formatTime(item.timestamp)}
                    </p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* QR quick-view */}
      <Modal
        open={!!qrShare}
        onOpenChange={(o) => !o && setQrShare(null)}
        title={qrShare ? `QR — ${qrShare.code}` : 'QR Code'}
        description={qrShare ? `${shareLabel(qrShare)} · ${formatBytes(qrShare.fileSize)}` : undefined}
      >
        {qrShare && (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="rounded-2xl border border-border/40 bg-white p-3 shadow-sm dark:bg-slate-900">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={`QR for ${qrShare.code}`} className="h-52 w-52 object-contain" />
              ) : (
                <div className="flex h-52 w-52 items-center justify-center rounded-xl bg-muted/40">
                  <QrCode className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <p className="text-center font-mono text-sm font-black tracking-widest text-primary">{qrShare.code}</p>
            <p className="text-center text-[11px] text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-[rgb(var(--success))]" /> Scan with MeshDrop Go — direct P2P download
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 font-bold"
              onClick={() => {
                if (!qrShare) return
                navigator.clipboard.writeText(buildShareLink(qrShare.code, shareLinkMeta(qrShare))).then(
                  () => toast.success('Link Copied', `${qrShare.code} copied — paste it anywhere.`),
                  () => toast.error('Copy Failed', 'Could not copy the link.')
                )
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy Link
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.name ?? 'Device'}?`}
        description="The device will be unpaired and removed from your device list. This cannot be undone."
        confirmLabel="Remove Device"
        onConfirm={() => removeTarget && removeDevice(removeTarget.id)}
      />
    </div>
  )
}
