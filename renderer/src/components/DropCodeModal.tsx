import { useEffect, useState } from 'react'
import {
  Link2,
  Copy,
  Check,
  FileText,
  Files,
  Clock,
  ShieldCheck,
  FolderOpen,
  Folder,
  QrCode
} from 'lucide-react'
import QRCode from 'qrcode'
import { useShares } from '@/hooks/useShares'
import { useTheme } from '@/hooks/useTheme'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/Modal'
import { formatBytes } from '@/lib/format'
import { buildShareLink, shareLinkMeta } from '@/lib/shareLinks'
import type { PendingShare, PendingShareStatus } from '@/types'

type ExpirationPreset = '5m' | '15m' | '30m' | '1h' | '6h' | '24h' | '3d' | '7d'

const PRESETS: { value: ExpirationPreset; label: string }[] = [
  { value: '5m', label: '5 min' },
  { value: '15m', label: '15 min' },
  { value: '30m', label: '30 min' },
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' }
]

// 0 = unlimited downloads until expiry.
const MAX_DOWNLOADS: { value: number; label: string }[] = [
  { value: 0, label: 'Unlimited' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 5, label: '5' },
  { value: 10, label: '10' }
]

interface PickedFile {
  filePath: string
  filename: string
  fileSize: number
}

type PickedSource =
  | { kind: 'files'; files: PickedFile[] }
  | { kind: 'folder'; folderPath: string; name: string }

interface DropShare extends Partial<PendingShare> {
  id: string
  code: string
  filename: string
  fileSize: number
  expiresAt: number
  expirationPreset: string
  status: PendingShareStatus
}

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

// Human summary of a share for lists: "name (3 files)" / "folder (12 files)" / name.
function shareLabel(share: { filename: string; files?: { filename: string }[]; folderName?: string | null }): string {
  const count = share.files?.length || 1
  if (share.folderName) return `${share.folderName} (${count} file${count === 1 ? '' : 's'})`
  if (count > 1) return `${count} files`
  return share.filename
}

function sourceTotalSize(source: PickedSource | null): number {
  if (!source) return 0
  if (source.kind === 'files') return source.files.reduce((a, f) => a + f.fileSize, 0)
  return 0 // folder total is unknown until the engine enumerates it
}

export function DropCodeModal() {
  const {
    isDropCodeModalOpen,
    toggleDropCodeModal,
    createDropCode,
    pendingShares,
    cancelShareCode,
    shareDraft,
    clearShareDraft
  } = useShares()
  const { theme } = useTheme()
  const { toast } = useToast()
  const [source, setSource] = useState<PickedSource | null>(null)
  const [preset, setPreset] = useState<ExpirationPreset>('30m')
  const [maxDownloads, setMaxDownloads] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [share, setShare] = useState<DropShare | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [tick, setTick] = useState(0) // re-render driver for the countdown

  useEffect(() => {
    if (!share?.code) {
      setQrDataUrl('')
      return
    }
    const isDark = theme === 'dark'
    QRCode.toDataURL(share.code, {
      width: 220,
      margin: 2,
      color: {
        dark: isDark ? '#ffffff' : '#0f172a',
        light: '#0f172a00'
      }
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('[DropCodeModal] Error generating QR code:', err))
  }, [share?.code, theme])

  useEffect(() => {
    if (!isDropCodeModalOpen) return
    const t = setInterval(() => setTick((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [isDropCodeModalOpen])

  // Pre-fill from a share draft (drop zone / global drag-and-drop), then clear
  // it so the next open starts blank.
  useEffect(() => {
    if (!shareDraft) return
    if (shareDraft.files && shareDraft.files.length > 0) {
      setSource({ kind: 'files', files: shareDraft.files })
    } else if (shareDraft.folderPath) {
      setSource({
        kind: 'folder',
        folderPath: shareDraft.folderPath,
        name: shareDraft.name || shareDraft.folderPath.split(/[\\/]/).pop() || shareDraft.folderPath
      })
    }
    setShare(null)
    setCopied(false)
    setLinkCopied(false)
    clearShareDraft()
  }, [shareDraft, clearShareDraft])

  const liveShare = share ? pendingShares.find((s) => s.id === share.id) || share : null
  const shareStatus: PendingShareStatus = liveShare?.status || 'waiting'
  const isExpired = liveShare ? liveShare.expiresAt > 0 && Date.now() >= liveShare.expiresAt : false

  const STATUS_LABEL: Record<PendingShareStatus, string> = {
    waiting: 'Waiting for receiver…',
    claimed: 'Download started',
    completed: 'Completed',
    expired: 'Expired',
    cancelled: 'Revoked'
  }

  const STATUS_STYLE: Record<PendingShareStatus, string> = {
    waiting: 'text-primary border-primary/30 bg-primary/10',
    claimed: 'text-accent border-accent/30 bg-accent/10',
    completed: 'text-status-online border-status-online/30 bg-status-online/10',
    expired: 'text-destructive border-destructive/30 bg-destructive/10',
    cancelled: 'text-muted-foreground border-border/40 bg-muted/20'
  }

  const handleRevoke = async () => {
    if (!share) return
    try {
      await cancelShareCode(share.id)
      toast.success('Code Revoked', `${share.code} is no longer valid.`)
    } catch (err: any) {
      toast.error('Revoke Failed', err?.message || 'Could not revoke the code.')
    }
  }

  const reset = () => {
    setSource(null)
    setPreset('30m')
    setMaxDownloads(0)
    setLoading(false)
    setError('')
    setShare(null)
    setCopied(false)
    setLinkCopied(false)
  }

  const handleClose = () => {
    // Closing the dialog does NOT stop the share: the code keeps advertising
    // in the worker until claimed, revoked, or expired. Say so explicitly so
    // the sender knows they can close the window and share the code later.
    if (share && (shareStatus === 'waiting' || shareStatus === 'claimed') && !isExpired) {
      const remaining = formatRemaining(liveShare?.expiresAt || share.expiresAt)
      toast.success(
        'Code Still Active',
        `${share.code} stays valid for ${remaining} even after closing this window.`
      )
    }
    reset()
    toggleDropCodeModal()
  }

  const handleChooseFiles = async () => {
    if (!window.bridge?.openFilesDialog) {
      toast.error('Unavailable', 'File dialogs are only available in the desktop app')
      return
    }
    setError('')
    try {
      const picked = await window.bridge.openFilesDialog()
      if (picked && picked.length > 0) {
        setSource({ kind: 'files', files: picked })
        setShare(null)
        setCopied(false)
      }
    } catch {
      toast.error('File Pick Failed', 'Could not open the file picker.')
    }
  }

  const handleChooseFolder = async () => {
    if (!window.bridge?.openFolderDialog) {
      toast.error('Unavailable', 'Folder dialogs are only available in the desktop app')
      return
    }
    setError('')
    try {
      const picked = await window.bridge.openFolderDialog()
      if (picked) {
        setSource({ kind: 'folder', folderPath: picked, name: picked.split(/[\\/]/).pop() || picked })
        setShare(null)
        setCopied(false)
      }
    } catch {
      toast.error('Folder Pick Failed', 'Could not open the folder picker.')
    }
  }

  const handleGenerate = async () => {
    if (!source) return
    setLoading(true)
    setError('')
    try {
      const params: {
        files?: PickedFile[]
        folderPath?: string
        expirationPreset: ExpirationPreset
        maxDownloads: number
      } = { expirationPreset: preset, maxDownloads }
      if (source.kind === 'files') params.files = source.files
      else params.folderPath = source.folderPath
      const result = (await createDropCode(params)) as DropShare
      setShare(result)
      // The whole point of a drop is the link — copy it immediately so there
      // is nothing left to do after clicking "Generate".
      try {
        await navigator.clipboard.writeText(buildShareLink(result.code, shareLinkMeta(result)))
        setLinkCopied(true)
        toast.success('Link Copied', `${result.code} copied — paste it anywhere.`)
      } catch {
        toast.success('Code Created', `${result.code} is ready to share.`)
      }
    } catch (err: any) {
      setError(err?.message || 'Could not create the share code.')
      toast.error('Share Failed', err?.message || 'Could not create the share code.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!share?.code) return
    try {
      await navigator.clipboard.writeText(share.code)
      setCopied(true)
      toast.success('Code Copied', `${share.code} copied to clipboard.`)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy Failed', 'Could not copy the code.')
    }
  }

  // Web link (https://…/d/<code>) — the P2P equivalent of a WeTransfer URL.
  // One link works for everyone: installed recipients get deep-linked through
  // the claim page, everyone else lands on the download funnel.
  const handleCopyLink = async () => {
    if (!share?.code) return
    try {
      await navigator.clipboard.writeText(buildShareLink(share.code, shareLinkMeta(share)))
      setLinkCopied(true)
      toast.success('Link Copied', 'Recipients open the link in the app or the web page.')
    } catch {
      toast.error('Copy Failed', 'Could not copy the link.')
    }
  }

  return (
    <Modal
      open={isDropCodeModalOpen}
      onOpenChange={(o) => !o && handleClose()}
      title='Share via One-Time Code'
      description='Create a DROP code that claims your files, securely'
      className={share ? 'max-w-xl' : 'max-w-lg'}
    >
      {share ? (
        /* ── Result: Generated Code & Side-by-Side Scannable QR Matrix ── */
        <div className='flex flex-col gap-y-4 py-1'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 items-center'>
            {/* Left: Scannable QR Matrix */}
            <div className='flex flex-col items-center justify-center gap-y-2.5 rounded-2xl border border-border/60 bg-card/40 p-4 text-center'>
              <div className='rounded-xl border border-slate-200 bg-white p-2.5 shadow-md dark:border-hairline/10 dark:bg-slate-900'>
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR Matrix for ${share.code}`}
                    className='h-36 w-36 object-contain'
                  />
                ) : (
                  <div className='flex h-36 w-36 animate-pulse items-center justify-center rounded-lg bg-slate-100 dark:bg-muted/40'>
                    <QrCode className='h-8 w-8 text-muted-foreground' />
                  </div>
                )}
              </div>
              <div className='space-y-0.5'>
                <span className='block text-[11px] font-bold text-foreground'>
                  Scan with MeshDrop Mobile
                </span>
                <span className='block text-[10px] text-muted-foreground'>
                  Direct P2P download without typing
                </span>
              </div>
            </div>

            {/* Right: Code & Link Controls */}
            <div className='flex flex-col gap-y-3'>
              <div className='space-y-1 text-left'>
                <span className='block text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                  One-Time Code
                </span>
                <div className='flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2'>
                  <span className='min-w-0 font-mono text-lg font-black tracking-widest text-primary truncate'>
                    {share.code}
                  </span>
                  <Button
                    size='icon'
                    variant='ghost'
                    onClick={handleCopy}
                    className='h-8 w-8 shrink-0 text-primary hover:bg-primary/15'
                    aria-label='Copy one-time code'
                  >
                    {copied ? (
                      <Check className='h-4 w-4 text-status-online' />
                    ) : (
                      <Copy className='h-4 w-4' />
                    )}
                  </Button>
                </div>
              </div>

              <div className='flex items-center gap-2'>
                <button
                  onClick={handleCopyLink}
                  className='flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary'
                >
                  <Link2 className='h-3.5 w-3.5' />
                  {linkCopied ? 'Link Copied ✓' : 'Copy Web Link'}
                </button>
              </div>

              <p className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
                <FileText className='h-3 w-3 shrink-0' />
                <span className='truncate'>{shareLabel(share)} · {formatBytes(share.fileSize)}</span>
              </p>

              <div className='rounded-xl border border-border/40 bg-card/40 p-2.5 text-xs space-y-1'>
                <div className='flex items-center justify-between'>
                  <span className='flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground'>
                    <Clock className='h-3 w-3 text-primary' /> Expires in
                  </span>
                  <span className='font-mono text-xs font-black tabular-nums text-foreground'>
                    {isExpired ? '0:00' : formatRemaining(liveShare?.expiresAt || share.expiresAt)}
                  </span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-[11px] font-semibold text-muted-foreground'>Status</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[9px] font-extrabold ${STATUS_STYLE[shareStatus]}`}
                  >
                    {STATUS_LABEL[shareStatus]}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className='flex items-center gap-1.5 border-t border-border/30 pt-2 text-[10px] text-muted-foreground'>
            <ShieldCheck className='h-3.5 w-3.5 shrink-0 text-status-online' />
            End-to-end encrypted · Zero cloud relays · No pairing records required.
          </div>

          <div className='flex w-full items-center gap-3 pt-1'>
            {shareStatus === 'waiting' || shareStatus === 'claimed' ? (
              <Button
                variant='ghost'
                onClick={handleRevoke}
                className='flex-1 font-semibold text-destructive hover:bg-destructive/10'
              >
                Revoke Code
              </Button>
            ) : (
              <Button variant='outline' onClick={reset} className='flex-1 font-semibold'>
                Share Another
              </Button>
            )}
            <Button onClick={handleClose} className='flex-1 font-bold'>
              Done
            </Button>
          </div>
        </div>
      ) : (
        /* ── Setup: pick files/folder and choose limits ─────────────── */
        <div className='space-y-4'>
          {pendingShares.filter((s) => s.status === 'waiting' || s.status === 'claimed').length >
            0 && (
            <div className='space-y-1.5'>
              <span className='block text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                Active One-Time Sends
              </span>
              {pendingShares
                .filter((s) => s.status === 'waiting' || s.status === 'claimed')
                .map((s) => (
                  <div
                    key={s.id}
                    className='flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-xs'
                  >
                    <span className='min-w-0 flex-1 truncate font-mono font-bold text-primary'>
                      {s.code}
                    </span>
                    <span className='min-w-0 flex-1 truncate text-muted-foreground'>
                      {shareLabel(s)}
                    </span>
                    <span className='font-mono tabular-nums text-muted-foreground'>
                      {s.expiresAt > 0 ? formatRemaining(s.expiresAt) : '—'}
                    </span>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='h-6 px-1.5 text-[10px] font-bold text-destructive'
                      onClick={() => {
                        cancelShareCode(s.id)
                          .then(() =>
                            toast.success('Code Revoked', `${s.code} is no longer valid.`)
                          )
                          .catch(() => {})
                      }}
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
            </div>
          )}

          {source ? (
            /* ── Picked source summary ─────────────────────────────── */
            <div className='space-y-1.5 rounded-xl border border-border/60 bg-card/40 p-3'>
              {source.kind === 'files' ? (
                <>
                  <div className='flex items-center gap-2'>
                    <Files className='h-4 w-4 shrink-0 text-primary' />
                    <span className='text-sm font-bold text-foreground'>
                      {source.files.length} file{source.files.length === 1 ? '' : 's'} ·{' '}
                      {formatBytes(sourceTotalSize(source))}
                    </span>
                  </div>
                  <div className='max-h-28 space-y-1 overflow-y-auto pr-1'>
                    {source.files.map((f) => (
                      <p key={f.filePath} className='truncate text-[11px] text-muted-foreground'>
                        {f.filename} · {formatBytes(f.fileSize)}
                      </p>
                    ))}
                  </div>
                </>
              ) : (
                <div className='flex items-center gap-2'>
                  <Folder className='h-4 w-4 shrink-0 text-primary' />
                  <span className='min-w-0 flex-1 truncate text-sm font-bold text-foreground'>
                    {source.name}
                  </span>
                  <span className='shrink-0 text-[11px] text-muted-foreground'>
                    all files inside
                  </span>
                </div>
              )}
              <div className='flex items-center gap-2 border-t border-border/30 pt-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-6 shrink-0 text-xs font-semibold'
                  onClick={() => source.kind === 'files' ? handleChooseFiles() : handleChooseFolder()}
                >
                  Change
                </Button>
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-6 shrink-0 text-xs font-semibold'
                  onClick={() => setSource(null)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            /* ── Empty state: pick files or a folder ───────────────── */
            <div className='space-y-2'>
              <button
                onClick={handleChooseFiles}
                className='flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-card/60'
              >
                <Files className='h-8 w-8 text-muted-foreground/50' />
                <span className='text-sm font-bold text-foreground'>Choose files to share</span>
                <span className='text-[11px] text-muted-foreground'>
                  Select one or more files
                </span>
              </button>
              <button
                onClick={handleChooseFolder}
                className='flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-card/60'
              >
                <FolderOpen className='h-8 w-8 text-muted-foreground/50' />
                <span className='text-sm font-bold text-foreground'>Share a folder</span>
                <span className='text-[11px] text-muted-foreground'>
                  Everything inside is included (up to 100 files)
                </span>
              </button>
            </div>
          )}

          <div className='space-y-2'>
            <span className='block text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
              Expiration
            </span>
            <div className='flex flex-wrap gap-1.5'>
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPreset(p.value)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                    preset === p.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'border border-border/60 bg-card/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className='space-y-2'>
            <span className='block text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
              Max Downloads
            </span>
            <div className='flex flex-wrap gap-1.5'>
              {MAX_DOWNLOADS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setMaxDownloads(d.value)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                    maxDownloads === d.value
                      ? 'bg-accent text-accent-foreground shadow-sm'
                      : 'border border-border/60 bg-card/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className='text-xs font-medium text-destructive'>{error}</p>}

          <div className='flex items-center gap-3 pt-1'>
            <Button variant='outline' onClick={handleClose} className='flex-1 font-semibold'>
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={!source || loading}
              className='flex-1 gap-2 font-bold'
            >
              {loading ? (
                <>
                  <span className='h-3.5 w-3.5 animate-spin rounded-full border-2 border-hairline/30 border-t-white' />
                  Creating…
                </>
              ) : (
                <>
                  <Link2 className='h-4 w-4' />
                  Generate Code
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
