import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  Download,
  Upload,
  Pause,
  Play,
  XCircle,
  RotateCcw,
  Trash2,
  FileUp,
  Link2,
  ShieldCheck,
  FolderOpen,
  Film,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
  ChevronDown,
} from 'lucide-react'
import { useTransfers } from '@/hooks/useTransfers'
import { useDevices } from '@/hooks/useDevices'
import { useShares } from '@/hooks/useShares'
import { useToast } from '@/hooks/useToast'
import { useFirstRun } from '@/hooks/useFirstRun'
import { formatBytes, formatSpeed, formatEta, formatTime } from '@/lib/format'
import { downloadUrl, isWeb, showItemInFolder } from '@/lib/capabilities'
import { Button } from '@/ui/primitives/Button'
import { Card, CardContent } from '@/ui/primitives/Card'
import { ProgressRing } from '@/ui/primitives/ProgressRing'
import { DeviceAvatar } from '@/ui/primitives/DeviceAvatar'
import { FileIcon } from '@/ui/primitives/FileIcon'
import { StatTile } from '@/ui/primitives/StatTile'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/primitives/Tooltip'
import { ContextMenu } from '@/components/ContextMenu'
import { ConfirmDialog } from '@/components/Modal'
import { WatchPartyModal } from '@/components/WatchPartyModal'
import { FirstRunGuide } from '@/components/FirstRunGuide'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { TransferRecord, TransferStatus } from '@/types'

const STATUS_LABEL: Record<TransferStatus, string> = {
  queued: 'Queued',
  active: 'Transferring',
  paused: 'Paused',
  interrupted: 'Interrupted',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  pending_approval: 'Awaiting Approval',
  waiting_peer: 'Waiting for sender',
}

const STATUS_STYLE: Record<TransferStatus, string> = {
  queued: 'text-muted-foreground border-border/40 bg-muted/30',
  active: 'text-[rgb(var(--meshdrop-cyan))] border-[rgb(var(--meshdrop-cyan)/0.25)] bg-[rgb(var(--meshdrop-cyan)/0.1)]',
  paused: 'text-amber-600 dark:text-amber-400 border-amber-500/25 bg-amber-500/10',
  interrupted: 'text-amber-600 dark:text-amber-400 border-amber-500/25 bg-amber-500/10 border-dashed',
  completed: 'text-[rgb(var(--success))] border-[rgb(var(--success)/0.25)] bg-[rgb(var(--success)/0.12)]',
  failed: 'text-destructive border-destructive/25 bg-destructive/10',
  cancelled: 'text-muted-foreground border-border/40 bg-muted/20',
  pending_approval: 'text-primary border-primary/25 bg-primary/10',
  waiting_peer: 'text-amber-600 dark:text-amber-400 border-amber-500/25 bg-amber-500/10 border-dashed',
}

// F05: a receive can wait on "waiting_peer" forever when the sender never
// comes online (engine timing deliberately untouched — this is UI affordance).
// Default wait is 5 minutes; override with localStorage
// 'meshdrop.waitingTimeoutMin' (minutes). The countdown, the timed-out state
// and Retry/Cancel live here in the renderer.
const DEFAULT_WAIT_TIMEOUT_MS = 5 * 60 * 1000

function waitingTimeoutMs(): number {
  try {
    const raw = localStorage.getItem('meshdrop.waitingTimeoutMin')
    const n = raw ? Number(raw) : NaN
    if (Number.isFinite(n) && n > 0) return Math.round(n * 60 * 1000)
  } catch {
    /* storage unavailable — default */
  }
  return DEFAULT_WAIT_TIMEOUT_MS
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function Transfers() {
  const {
    transfers,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    retryTransfer,
    acceptTransfer,
    declineTransfer,
    clearTransfers,
    deleteTransfer,
    sendFileToDevice,
  } = useTransfers()
  const { devices, identity } = useDevices()
  const { pendingShares, toggleDropCodeModal, openWatchParty, claimFileWithCode } = useShares()
  const { toast } = useToast()
  const shouldReduceMotion = useReducedMotion()
  const { firstRun, dismissFirstRun } = useFirstRun(
    devices.some((d) => d.isTrusted) || transfers.length > 0 || pendingShares.length > 0,
  )
  const [targetId, setTargetId] = useState('')
  const [sending, setSending] = useState(false)
  const [clearMode, setClearMode] = useState<'finished' | 'all' | null>(null)
  const [rowMenu, setRowMenu] = useState<{ transfer: TransferRecord; x: number; y: number } | null>(null)

  // F05 waiting_peer countdown: tick only while a row is actually waiting.
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [retriedAt, setRetriedAt] = useState<Record<string, number>>({})
  const hasWaitingPeer = transfers.some((t) => t.status === 'waiting_peer')
  useEffect(() => {
    if (!hasWaitingPeer) return
    const iv = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(iv)
  }, [hasWaitingPeer])

  const waitTimeoutMs = waitingTimeoutMs()
  // Engine records carry createdAt as an ISO string; some events use epoch ms.
  // NaN-safe parse — Number('2026-09-09T…') is NaN → 0, which made every
  // waiting row look instantly timed out and the countdown never ran.
  const createdAtMs = (t: TransferRecord) => {
    if (!t.createdAt) return 0
    const ts =
      typeof t.createdAt === 'string' ? Date.parse(t.createdAt) : new Date(t.createdAt as unknown as string).getTime()
    return Number.isFinite(ts) && ts > 0 ? ts : 0
  }
  const waitingElapsedMs = (t: TransferRecord) => nowTick - Math.max(createdAtMs(t), retriedAt[t.id] || 0)
  const waitingTimedOut = (t: TransferRecord) => t.status === 'waiting_peer' && waitingElapsedMs(t) >= waitTimeoutMs

  const handleRetryWait = async (t: TransferRecord) => {
    const code = t.claimCode
    if (!code) {
      toast.error('Cannot retry', 'This waiting transfer has no claim code to re-send.')
      return
    }
    try {
      await claimFileWithCode(code)
      setRetriedAt((prev) => ({ ...prev, [t.id]: Date.now() }))
      toast.success('Retrying', `Claim re-sent for "${t.filename}" — still waiting for the sender.`)
    } catch (err) {
      toast.error('Retry failed', (err as Error)?.message || 'Could not re-send the claim.')
    }
  }

  const eligibleDevices = devices.filter((d) => d.isOnline && d.isTrusted && (d.publicKey || d.id))
  const activeCount = transfers.filter(
    (t) => t.status === 'active' || t.status === 'queued' || t.status === 'pending_approval' || t.status === 'waiting_peer',
  ).length
  const terminalCount = transfers.filter((t) => ['completed', 'failed', 'cancelled', 'interrupted'].includes(t.status)).length

  const handleSendFile = async () => {
    const device = eligibleDevices.find((d) => (d.publicKey || d.id) === targetId)
    if (!device) {
      toast.error('Select a Device', 'Choose an online device to send the file to.')
      return
    }
    setSending(true)
    try {
      const result = (await sendFileToDevice(device)) as unknown
      if (result) {
        toast.success('Transfer Started', `Sending to ${device.name}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not start the transfer.'
      toast.error('Send Failed', msg)
    } finally {
      setSending(false)
    }
  }

  const handleDirectSend = async (device: (typeof eligibleDevices)[number]) => {
    setTargetId(device.publicKey || device.id)
    setSending(true)
    try {
      const result = (await sendFileToDevice(device)) as unknown
      if (result) toast.success('Transfer Started', `Sending to ${device.name}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not start the transfer.'
      toast.error('Send Failed', msg)
    } finally {
      setSending(false)
    }
  }

  const isVideoFile = (name?: string) => {
    return /\.(mp4|mkv|webm|avi|mov|m4v|ts|m2ts|mts|flv|wmv)$/i.test(name || '')
  }

  // Hero selection: most urgent non-terminal transfer, prioritized.
  const heroTransfer: TransferRecord | null = (() => {
    const prio: Record<string, number> = {
      active: 0,
      queued: 1,
      pending_approval: 2,
      waiting_peer: 3,
      paused: 4,
      interrupted: 5,
    }
    const cands = transfers.filter((t) => prio[t.status] !== undefined)
    if (cands.length === 0) return null
    cands.sort((a, b) => (prio[a.status] ?? 99) - (prio[b.status] ?? 99))
    return cands[0]
  })()

  const heroPeerDevice = heroTransfer ? devices.find((d) => (d.publicKey || d.id) === heroTransfer.peerId) : null

  const actionButtons = (t: TransferRecord) => {
    const isVideo = isVideoFile(t.filename)
    if (t.status === 'pending_approval') {
      return (
        <div className="flex items-center gap-1.5">
          <Button size="sm" className="h-7 px-2.5 text-[11px] font-bold" onClick={() => acceptTransfer(t.id)}>
            <Download className="mr-1 h-3 w-3" /> Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-[11px] font-bold text-destructive hover:bg-destructive/10"
            onClick={() => declineTransfer(t.id)}
          >
            <XCircle className="mr-1 h-3 w-3" /> Decline
          </Button>
        </div>
      )
    }
    if (t.status === 'waiting_peer') {
      return (
        <div className="flex items-center gap-1.5">
          {waitingTimedOut(t) && (
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] font-bold" onClick={() => handleRetryWait(t)}>
              <RotateCcw className="mr-1 h-3 w-3" /> Retry
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-[11px] font-bold text-destructive hover:text-destructive"
            onClick={() => cancelTransfer(t.id)}
          >
            <XCircle className="mr-1 h-3 w-3" /> Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            title="Delete log record"
            onClick={() => deleteTransfer(t.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )
    }
    if (t.status === 'active') {
      return (
        <div className="flex items-center gap-1.5">
          {isVideo && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-[11px] font-bold border-primary/25 bg-primary/5 text-primary hover:bg-primary/10"
              title="Stream video playback now"
              onClick={() => {
                openWatchParty({
                  transferId: t.id,
                  filePath: t.filePath || t.destPath,
                  roomTitle: t.filename,
                  roomCode: t.claimCode,
                  isHost: t.direction === 'send',
                })
              }}
            >
              <Film className="mr-1 h-3 w-3" /> Stream
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] font-bold" onClick={() => pauseTransfer(t.id)}>
            <Pause className="mr-1 h-3 w-3" /> Pause
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-[11px] font-bold text-destructive hover:text-destructive"
            onClick={() => cancelTransfer(t.id)}
          >
            <XCircle className="mr-1 h-3 w-3" /> Cancel
          </Button>
        </div>
      )
    }
    if (t.status === 'queued' || t.status === 'paused' || t.status === 'interrupted') {
      return (
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] font-bold" onClick={() => resumeTransfer(t.id)}>
            <Play className="mr-1 h-3 w-3" /> Resume
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-[11px] font-bold text-destructive hover:text-destructive"
            onClick={() => cancelTransfer(t.id)}
          >
            <XCircle className="mr-1 h-3 w-3" /> Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            title="Delete record"
            onClick={() => deleteTransfer(t.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )
    }
    if (t.status === 'failed' || t.status === 'cancelled') {
      return (
        <div className="flex items-center gap-1.5">
          {t.status === 'failed' && (
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] font-bold" onClick={() => retryTransfer(t.id)}>
              <RotateCcw className="mr-1 h-3 w-3" /> Retry
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            title="Delete record"
            onClick={() => deleteTransfer(t.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )
    }
    if (t.status === 'completed') {
      const localPath = t.destPath || t.filePath
      return (
        <div className="flex items-center gap-1.5">
          {isVideo && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-[11px] font-bold border-primary/25 bg-primary/5 text-primary hover:bg-primary/10"
              title="Watch video"
              onClick={() => {
                openWatchParty({
                  transferId: t.id,
                  filePath: localPath,
                  roomTitle: t.filename,
                  roomCode: t.claimCode,
                  isHost: t.direction === 'send',
                })
              }}
            >
              <Film className="mr-1 h-3 w-3" /> Watch
            </Button>
          )}
          {isWeb ? (
            t.direction === 'receive' ? (
              <a
                href={downloadUrl(t.id)}
                download={t.filename}
                className="inline-flex h-7 items-center rounded-lg border border-border/60 bg-card px-2.5 text-[11px] font-bold text-foreground transition-colors hover:bg-accent"
                title="Save the received file"
              >
                <Download className="mr-1 h-3 w-3" /> Save
              </a>
            ) : null
          ) : (
            localPath && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-[11px] font-bold"
                title="Reveal the file in your system file manager"
                onClick={() => showItemInFolder(localPath)}
              >
                <FolderOpen className="mr-1 h-3 w-3" /> Show in Folder
              </Button>
            )
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            title="Delete record"
            onClick={() => deleteTransfer(t.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )
    }
    return null
  }

  return (
    <ErrorBoundary>
      <TooltipProvider>
        <div className="space-y-5 pb-12">
          {/* Header — restyled, same flows: Send-to-device menu → QuickSend/pick, Share Code, Send File */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-[22px] font-black tracking-tight text-foreground">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <ArrowLeftRight className="h-4 w-4" />
                  </span>
                  Transfers
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground max-w-2xl">
                  Encrypted device-to-device streams · SHA-256 verified · drag a file anywhere to start
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Send to device — menu that picks a device then runs the QuickSend/picker flow (same sendFileToDevice) */}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 gap-1.5 rounded-xl border-border/70 bg-card px-3 text-xs font-bold shadow-sm hover:bg-accent"
                      aria-label="Send to device"
                    >
                      <Zap className="h-3.5 w-3.5 text-primary" />
                      Send to device
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={8}
                      className="z-50 min-w-[240px] rounded-xl border border-border bg-popover p-1.5 shadow-xl animate-in fade-in slide-in-from-top-1"
                    >
                      <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Online devices</div>
                      {eligibleDevices.length === 0 ? (
                        <div className="px-2 py-6 text-center">
                          <p className="text-xs font-semibold text-foreground">No online paired devices</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">Pair a device on the Devices page first.</p>
                        </div>
                      ) : (
                        eligibleDevices.map((d) => (
                          <DropdownMenu.Item
                            key={d.id}
                            onSelect={() => handleDirectSend(d)}
                            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground outline-none hover:bg-accent focus:bg-accent"
                          >
                            <DeviceAvatar name={d.name} os={String(d.os || 'windows')} size="sm" />
                            <span className="min-w-0 flex-1 truncate font-semibold">{d.name}</span>
                            <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--success))] shadow-sm" />
                          </DropdownMenu.Item>
                        ))
                      )}
                      <DropdownMenu.Separator className="my-1 h-px bg-border/60" />
                      <div className="px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">Picking a device opens your file picker — same flow as Send File.</div>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>

                <Button
                  variant="outline"
                  className="h-9 gap-1.5 rounded-xl border-border/70 bg-card px-3 text-xs font-bold shadow-sm hover:bg-accent"
                  onClick={() => toggleDropCodeModal()}
                  title="Create a one-time DROP code for a file"
                >
                  <Link2 className="h-4 w-4" />
                  Share Code
                </Button>

                <Button className="h-9 gap-1.5 rounded-xl px-4 text-xs font-bold shadow-sm" onClick={handleSendFile} disabled={sending}>
                  <FileUp className="h-4 w-4" />
                  {sending ? 'Sending…' : 'Send File'}
                </Button>

                {terminalCount > 0 && (
                  <Button
                    variant="ghost"
                    className="h-9 gap-1.5 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => setClearMode('finished')}
                    title="Clear completed and failed transfers"
                  >
                    <Trash2 className="h-4 w-4" /> Clear Finished
                  </Button>
                )}
                {transfers.length > 0 && (
                  <Button
                    variant="ghost"
                    className="h-9 gap-1.5 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setClearMode('all')}
                    title="Clear all transfer logs (including awaiting)"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" /> Clear All
                  </Button>
                )}
              </div>
            </div>

            {/* Pill row mirrors the native <select> for accessibility but hidden visually when menu is preferred:
                kept as a tiny accessible alternative + keeps Send File target choice operable via keyboard. */}
            {eligibleDevices.length > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="hidden text-[10px] font-bold uppercase tracking-widest md:inline">Target</span>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  aria-label="Choose a device to send to"
                  className="h-8 rounded-lg border border-border/60 bg-card px-2.5 text-xs font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Send to device…</option>
                  {eligibleDevices.map((d) => (
                    <option key={d.id} value={d.publicKey || d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <span className="hidden md:inline text-muted-foreground/70">or use the Send to device menu above</span>
              </div>
            )}
          </div>

          {/* Summary — StatTiles restyled (hidden for first-run per F27) */}
          {firstRun ? (
            <FirstRunGuide onShare={toggleDropCodeModal} onDismiss={dismissFirstRun} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile
                label="Active"
                value={<span className="tabular-nums">{activeCount}</span>}
                hint={activeCount === 1 ? '1 transfer in flight' : `${activeCount} transfers in flight`}
                icon={<ArrowLeftRight className="h-4 w-4" />}
              />
              <StatTile
                label="Files Sent"
                value={<span className="tabular-nums">{transfers.filter((t) => t.direction === 'send').length}</span>}
                hint="Lifetime sends on this host"
                icon={<Upload className="h-4 w-4" />}
              />
              <StatTile
                label="Files Received"
                value={<span className="tabular-nums">{transfers.filter((t) => t.direction === 'receive').length}</span>}
                hint="Lifetime receives on this host"
                icon={<Download className="h-4 w-4" />}
              />
            </div>
          )}

          {/* Hero — active transfer card (the showpiece). GPU-only motion, reduced-motion respected. */}
          <AnimatePresence mode="wait">
            {heroTransfer && (
              <motion.div
                key={heroTransfer.id}
                layout={!shouldReduceMotion}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-sm"
              >
                {/* top accent bar — animated width only via transform scaleX (GPU) */}
                <div className="h-1 w-full bg-muted/40 overflow-hidden">
                  <motion.div
                    className="h-full origin-left bg-gradient-to-r from-primary via-[rgb(var(--meshdrop-cyan))] to-primary"
                    style={{ scaleX: Math.max(0, Math.min(1, (heroTransfer.progress || 0) / 100)) }}
                    transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
                  />
                </div>

                <div className="p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 text-[10px] font-extrabold tracking-wide text-primary">
                        <Sparkles className="h-3 w-3" /> HERO
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${STATUS_STYLE[heroTransfer.status]}`}>
                        {STATUS_LABEL[heroTransfer.status]}
                      </span>
                      {heroTransfer.transferMethod && (
                        <span className="hidden sm:inline-flex rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                          {heroTransfer.transferMethod === 'lan' ? '⚡ LAN' : heroTransfer.transferMethod === 'relay' ? '🌐 Relay' : '🔗 P2P'}
                        </span>
                      )}
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatTime(heroTransfer.createdAt)}
                      <span className="text-muted-foreground/40">·</span>
                      <span className="truncate max-w-[160px]" title={heroTransfer.filename}>
                        {heroTransfer.filename}
                      </span>
                    </div>
                  </div>

                  {/* Device lane: source → animated conduit → destination (with ProgressRing on incoming side) */}
                  <div className="mt-4 flex items-center gap-3">
                    {/* source */}
                    <div className="flex shrink-0 flex-col items-center gap-1.5">
                      <DeviceAvatar
                        name={heroTransfer.direction === 'send' ? (identity.name || 'This device') : heroTransfer.peerName || 'Remote'}
                        os={String(heroTransfer.direction === 'send' ? (identity as unknown as { os?: string }).os || 'windows' : heroPeerDevice?.os || 'windows')}
                        size="md"
                      />
                      <span className="max-w-[80px] truncate text-center text-[10px] font-bold text-foreground" title={heroTransfer.direction === 'send' ? identity.name || 'This device' : heroTransfer.peerName || 'Remote'}>
                        {heroTransfer.direction === 'send' ? identity.name || 'This device' : heroTransfer.peerName || 'Remote'}
                      </span>
                      <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Source</span>
                    </div>

                    {/* conduit */}
                    <div className="relative flex flex-1 items-center gap-2 px-1">
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
                        {/* flowing highlight — x is transform-only (GPU) */}
                        {!shouldReduceMotion && heroTransfer.status === 'active' && (
                          <motion.div
                            className="absolute inset-y-0 -left-1/3 w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/25"
                            animate={{ x: ['0%', '420%'] }}
                            transition={{ duration: 1.35, repeat: Infinity, ease: 'linear' }}
                          />
                        )}
                        {/* packet dots — translate only */}
                        <div className="absolute inset-0 flex items-center gap-1.5 px-1">
                          {[0, 1, 2].map((i) => (
                            <motion.span
                              key={i}
                              className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--meshdrop-cyan))] shadow-[0_0_8px_rgba(6,182,212,0.7)]"
                              animate={
                                shouldReduceMotion
                                  ? undefined
                                  : heroTransfer.status === 'active'
                                    ? { x: [0, 8, 0], opacity: [0.9, 1, 0.9] }
                                    : heroTransfer.status === 'queued' || heroTransfer.status === 'waiting_peer'
                                      ? { opacity: [0.4, 1, 0.4] }
                                      : { x: 0 }
                              }
                              transition={
                                shouldReduceMotion
                                  ? undefined
                                  : { duration: 1.1 + i * 0.18, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }
                              }
                            />
                          ))}
                        </div>
                        {/* progress fill — scaleX transform only */}
                        <motion.div
                          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-[rgb(var(--meshdrop-cyan))] opacity-90"
                          style={{ scaleX: Math.max(0, Math.min(1, (heroTransfer.progress || 0) / 100)), transformOrigin: 'left' }}
                          transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 22 }}
                        />
                      </div>
                      <div className="hidden md:flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 bg-card text-muted-foreground">
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                      </div>
                    </div>

                    {/* destination — wrapped in ProgressRing when active/waiting */}
                    <div className="flex shrink-0 flex-col items-center gap-1.5">
                      <div className="relative">
                        {heroTransfer.status === 'active' || heroTransfer.status === 'queued' || heroTransfer.status === 'waiting_peer' ? (
                          <ProgressRing
                            value={heroTransfer.progress || 0}
                            size="sm"
                            color={heroTransfer.status === 'waiting_peer' ? 'warning' : 'primary'}
                            showLabel={false}
                            aria-label={`${Math.round(heroTransfer.progress || 0)} percent`}
                          />
                        ) : null}
                        <div
                          className={
                            heroTransfer.status === 'active' || heroTransfer.status === 'queued' || heroTransfer.status === 'waiting_peer'
                              ? 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
                              : ''
                          }
                        >
                          <DeviceAvatar
                            name={heroTransfer.direction === 'receive' ? (identity.name || 'This device') : heroTransfer.peerName || 'Remote'}
                            os={String(heroTransfer.direction === 'receive' ? (identity as unknown as { os?: string }).os || 'windows' : heroPeerDevice?.os || 'windows')}
                            size="md"
                          />
                        </div>
                        {/* completion check pop — scale only */}
                        <AnimatePresence>
                          {heroTransfer.status === 'completed' && (
                            <motion.span
                              key="hero-check"
                              initial={shouldReduceMotion ? false : { scale: 0.6, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.9, opacity: 0 }}
                              transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 14 }}
                              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-[rgb(var(--success))] text-white shadow-md"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                      <span className="max-w-[80px] truncate text-center text-[10px] font-bold text-foreground" title={heroTransfer.direction === 'receive' ? identity.name || 'This device' : heroTransfer.peerName || 'Remote'}>
                        {heroTransfer.direction === 'receive' ? identity.name || 'This device' : heroTransfer.peerName || 'Remote'}
                      </span>
                      <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Destination</span>
                    </div>
                  </div>

                  {/* Live meta + morphing message */}
                  <div className="mt-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="truncate text-sm font-bold text-foreground" title={heroTransfer.filename}>
                              {heroTransfer.filename}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[360px] break-all text-xs">
                            {heroTransfer.filename}
                          </TooltipContent>
                        </Tooltip>
                        <AnimatePresence mode="wait">
                          <motion.p
                            key={heroTransfer.status + (waitingTimedOut(heroTransfer) ? '-to' : '')}
                            initial={shouldReduceMotion ? false : { opacity: 0, y: 2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -2 }}
                            transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                            className="mt-0.5 text-[11px] leading-relaxed"
                          >
                            {heroTransfer.status === 'waiting_peer' ? (
                              waitingTimedOut(heroTransfer) ? (
                                <span className="font-semibold text-destructive">Sender didn&apos;t respond — check they&apos;re online, then Retry or Cancel.</span>
                              ) : (
                                <span className="text-muted-foreground">
                                  <span className="font-medium text-foreground">{heroTransfer.claimCode || 'DROP code'}</span> · waiting for the sender to accept — download starts automatically
                                  <span className="text-muted-foreground/60"> · times out in {formatCountdown(waitTimeoutMs - waitingElapsedMs(heroTransfer))}</span>
                                </span>
                              )
                            ) : heroTransfer.status === 'pending_approval' ? (
                              <span className="font-medium text-primary">Incoming offer — approve to start the encrypted stream.</span>
                            ) : heroTransfer.status === 'queued' ? (
                              <span className="text-muted-foreground">Queued — {formatBytes(heroTransfer.fileSize)} will start as soon as the conduit is ready.</span>
                            ) : heroTransfer.status === 'paused' ? (
                              <span className="text-muted-foreground">Paused at {Math.round(heroTransfer.progress || 0)}% — resume to continue.</span>
                            ) : heroTransfer.status === 'interrupted' ? (
                              <span className="text-amber-600 dark:text-amber-400">Interrupted — resume when you&apos;re back on the mesh.</span>
                            ) : heroTransfer.status === 'active' ? (
                              <span className="text-muted-foreground">
                                {heroTransfer.direction === 'send' ? 'Sending' : 'Receiving'} · {formatBytes(heroTransfer.fileSize)} · {heroTransfer.peerName || 'Remote peer'}
                              </span>
                            ) : heroTransfer.status === 'completed' ? (
                              <span className="inline-flex items-center gap-1.5 font-medium text-[rgb(var(--success))]">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Completed · {formatBytes(heroTransfer.fileSize)} verified
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                {heroTransfer.direction === 'send' ? 'to' : 'from'} {heroTransfer.peerName || 'Remote peer'} · {formatBytes(heroTransfer.fileSize)} · {formatTime(heroTransfer.createdAt)}
                              </span>
                            )}
                          </motion.p>
                        </AnimatePresence>
                      </div>

                      {/* live speed + ETA — tabular-nums avoids jitter */}
                      <div className="flex shrink-0 items-center gap-2">
                        {heroTransfer.status === 'active' && (
                          <>
                            <span className="rounded-full border border-[rgb(var(--meshdrop-cyan)/0.22)] bg-[rgb(var(--meshdrop-cyan)/0.1)] px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums text-[rgb(var(--meshdrop-cyan))]">
                              {heroTransfer.speed > 0 ? formatSpeed(heroTransfer.speed) : '—'}
                            </span>
                            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">ETA {heroTransfer.eta > 0 ? formatEta(heroTransfer.eta) : '—'}</span>
                          </>
                        )}
                        {heroTransfer.status !== 'active' && (
                          <span className="font-mono text-[11px] font-bold tabular-nums text-primary">{Math.round(heroTransfer.progress || 0)}%</span>
                        )}
                      </div>
                    </div>

                    {/* thin progress track under hero meta — GPU scaleX */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-[rgb(var(--meshdrop-cyan))] shadow-[0_0_12px_rgba(6,182,212,0.45)]"
                        style={{ scaleX: Math.max(0, Math.min(1, (heroTransfer.progress || 0) / 100)), transformOrigin: 'left' }}
                        transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 22 }}
                      />
                    </div>

                    {/* hero actions — same transfer.* calls, never new shapes */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">{actionButtons(heroTransfer)}</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Transfer List — preserves all sources, waiting states, Save/show-in-folder, truncate+tooltip, toasts */}
          <Card className="overflow-hidden border-border/60">
            <CardContent className="p-0 divide-y divide-border/40">
              {transfers.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground border border-border/40">
                    <ArrowLeftRight className="h-7 w-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-foreground">Nothing here yet</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                      Drop a file on the home screen to share it with a link, or enter a DROP code to receive one. Every byte is verified before it is written to disk.
                    </p>
                  </div>
                </div>
              ) : (
                transfers.map((t) => {
                  const isActive = t.status === 'active'
                  const done = t.status === 'completed'
                  const directionIcon =
                    t.direction === 'send' ? <ArrowUp className="h-4 w-4 text-primary" /> : <ArrowDown className="h-4 w-4 text-[rgb(var(--meshdrop-cyan))]" />
                  return (
                    <motion.div
                      key={t.id}
                      layout={!shouldReduceMotion}
                      initial={shouldReduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                      className="group flex items-start gap-3 p-4 hover:bg-muted/20 transition-colors"
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setRowMenu({ transfer: t, x: e.clientX, y: e.clientY })
                      }}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/40 border border-border/40">
                        {directionIcon}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {/* F10: truncate + tooltip */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="truncate text-sm font-bold text-foreground cursor-default" title={t.filename}>
                                  {t.filename}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[360px] break-all text-xs">
                                {t.filename}
                              </TooltipContent>
                            </Tooltip>
                            {t.status === 'waiting_peer' ? (
                              waitingTimedOut(t) ? (
                                <p className="text-[11px] font-semibold text-destructive leading-relaxed">
                                  Sender didn&apos;t respond — check they&apos;re online, then Retry or Cancel.
                                </p>
                              ) : (
                                <p className="text-[11px] leading-relaxed text-muted-foreground">
                                  <span className="font-medium text-foreground">{t.claimCode || 'DROP code'}</span> · waiting for the sender to accept — download starts automatically when they come online
                                  <span className="text-muted-foreground/60"> · times out in {formatCountdown(waitTimeoutMs - waitingElapsedMs(t))}</span>
                                </p>
                              )
                            ) : (
                              <p className="truncate text-[11px] text-muted-foreground">
                                {t.direction === 'send' ? 'to' : 'from'} {t.peerName || 'Remote Peer'} · {formatBytes(t.fileSize)} · {formatTime(t.createdAt)}
                                {t.transferMethod ? ` · ${t.transferMethod === 'lan' ? 'LAN' : 'Internet'}` : ''}
                              </p>
                            )}
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-mono font-extrabold ${STATUS_STYLE[t.status]}`}>
                            {STATUS_LABEL[t.status]}
                          </span>
                        </div>

                        {(isActive || t.status === 'paused' || t.status === 'queued') && (
                          <div className="space-y-1">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                              <motion.div
                                className="h-full rounded-full bg-gradient-to-r from-primary to-[rgb(var(--meshdrop-cyan))] shadow-[0_0_8px_rgba(6,182,212,0.45)]"
                                style={{ scaleX: Math.max(0, Math.min(1, t.progress || 0) / 100), transformOrigin: 'left' }}
                                transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 22 }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground tabular-nums">
                              <span className="font-bold text-[rgb(var(--meshdrop-cyan))]">{Math.round(t.progress || 0)}%</span>
                              <span className="flex items-center gap-2">
                                {isActive && t.speed > 0 ? <span className="font-bold text-[rgb(var(--meshdrop-cyan))]">{formatSpeed(t.speed)}</span> : null}
                                {isActive && t.eta > 0 ? `ETA ${formatEta(t.eta)}` : null}
                              </span>
                            </div>
                          </div>
                        )}

                        {done && t.summary?.checksum && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--meshdrop-cyan)/0.25)] bg-[rgb(var(--meshdrop-cyan)/0.1)] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[rgb(var(--meshdrop-cyan))]">
                              SHA-256 {t.summary.checksum.slice(0, 16)}…
                            </span>
                            {t.summary.blocksVerified != null && (
                              <span className="inline-flex items-center gap-1 font-mono text-[9px] text-muted-foreground">
                                <ShieldCheck className="h-3 w-3 text-[rgb(var(--success))]" />
                                {t.summary.blocksVerified} blocks · {formatBytes(t.summary.bytesVerified ?? 0)} verified
                              </span>
                            )}
                          </div>
                        )}

                        {done && t.summary && !t.summary.checksum && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[rgb(var(--success))]">
                            <ShieldCheck className="h-3 w-3" />
                            <span>
                              Verified · {t.summary.blocksVerified ?? '—'} blocks · {formatBytes(t.summary.bytesVerified ?? 0)}
                            </span>
                          </div>
                        )}

                        {t.status === 'failed' && t.error && (
                          <p className="truncate text-[10px] text-destructive" title={t.error}>
                            Error: {t.error}
                          </p>
                        )}

                        {/* Inline file icon + list sources hint */}
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <FileIcon filename={t.filename} size="sm" className="h-6 w-6 rounded-md" />
                          <span className="truncate" title={t.filePath || t.destPath || t.filename}>
                            {t.filePath || t.destPath || '—'}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 pt-0.5">{actionButtons(t)}</div>
                    </motion.div>
                  )
                })
              )}
            </CardContent>
          </Card>

          {/* Clear Confirmation Dialog */}
          <ConfirmDialog
            open={clearMode !== null}
            onOpenChange={(open) => {
              if (!open) setClearMode(null)
            }}
            title={clearMode === 'all' ? 'Clear ALL transfers? This cancels active ones.' : 'Clear finished transfers?'}
            description={
              clearMode === 'all'
                ? 'This will CANCEL active/queued transfers and delete all history. Type CLEAR below to confirm.'
                : 'Completed, failed, cancelled, and interrupted transfers will be removed. Active transfers will be kept.'
            }
            confirmLabel={clearMode === 'all' ? 'Type CLEAR to confirm' : 'Clear Finished'}
            requireConfirmText={clearMode === 'all' ? 'CLEAR' : undefined}
            onConfirm={() => {
              if (clearMode === 'all') {
                clearTransfers({ includePending: true })
              } else {
                clearTransfers()
              }
              setClearMode(null)
            }}
          />

          {/* Row Context Menu */}
          {rowMenu && (
            <ContextMenu
              x={rowMenu.x}
              y={rowMenu.y}
              onClose={() => setRowMenu(null)}
              items={[
                {
                  label: rowMenu.transfer.status === 'active' ? 'Pause' : 'Resume',
                  icon: rowMenu.transfer.status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />,
                  onClick: () => (rowMenu.transfer.status === 'active' ? pauseTransfer(rowMenu.transfer.id) : resumeTransfer(rowMenu.transfer.id)),
                  disabled: !['active', 'queued', 'paused', 'interrupted'].includes(rowMenu.transfer.status),
                },
                {
                  label: 'Cancel Transfer',
                  icon: <XCircle className="h-3.5 w-3.5" />,
                  onClick: () => cancelTransfer(rowMenu.transfer.id),
                  disabled: !['active', 'queued', 'paused', 'interrupted', 'pending_approval', 'waiting_peer'].includes(rowMenu.transfer.status),
                },
                {
                  label: 'Retry',
                  icon: <RotateCcw className="h-3.5 w-3.5" />,
                  onClick: () => retryTransfer(rowMenu.transfer.id),
                  disabled: rowMenu.transfer.status !== 'failed',
                },
                {
                  label: 'Delete Record',
                  icon: <Trash2 className="h-3.5 w-3.5 text-destructive" />,
                  onClick: () => deleteTransfer(rowMenu.transfer.id),
                },
              ]}
            />
          )}
        </div>
      </TooltipProvider>
    </ErrorBoundary>
  )
}
