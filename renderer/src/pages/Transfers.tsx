import { useState } from 'react'
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
  FolderOpen
} from 'lucide-react'
import { useTransfers } from '@/hooks/useTransfers'
import { useDevices } from '@/hooks/useDevices'
import { useShares } from '@/hooks/useShares'
import { useToast } from '@/hooks/useToast'
import { formatBytes, formatSpeed, formatEta, formatTime } from '@/lib/format'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ContextMenu } from '@/components/ContextMenu'
import { ConfirmDialog } from '@/components/Modal'
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
  waiting_peer: 'Waiting for sender'
}

const STATUS_STYLE: Record<TransferStatus, string> = {
  queued: 'text-status-away border-status-away/30 bg-status-away/10',
  active: 'text-meshdrop-cyan border-meshdrop-cyan/30 bg-meshdrop-cyan/10',
  paused: 'text-status-away border-status-away/30 bg-status-away/10',
  interrupted: 'text-status-away border-status-away/30 bg-status-away/10',
  completed: 'text-status-online border-status-online/30 bg-status-online/10',
  failed: 'text-destructive border-destructive/30 bg-destructive/10',
  cancelled: 'text-muted-foreground border-border/40 bg-muted/20',
  pending_approval: 'text-primary border-primary/30 bg-primary/10',
  waiting_peer: 'text-status-away border-status-away/30 bg-status-away/10'
}

export function Transfers() {
  const {
    transfers,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    retryTransfer,
    clearTransfers,
    sendFileToDevice
  } = useTransfers()
  const { devices } = useDevices()
  const { toggleDropCodeModal } = useShares()
  const { toast } = useToast()
  const [targetId, setTargetId] = useState('')
  const [sending, setSending] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [rowMenu, setRowMenu] = useState<{ transfer: TransferRecord; x: number; y: number } | null>(
    null
  )

  const eligibleDevices = devices.filter((d) => d.isOnline && d.isTrusted && (d.publicKey || d.id))
  const activeCount = transfers.filter(
    (t) =>
      t.status === 'active' ||
      t.status === 'queued' ||
      t.status === 'pending_approval' ||
      t.status === 'waiting_peer'
  ).length
  const terminalCount = transfers.filter((t) =>
    ['completed', 'failed', 'cancelled', 'interrupted'].includes(t.status)
  ).length

  const handleSendFile = async () => {
    const device = eligibleDevices.find((d) => (d.publicKey || d.id) === targetId)
    if (!device) {
      toast.error('Select a Device', 'Choose an online device to send the file to.')
      return
    }
    setSending(true)
    try {
      const result = (await sendFileToDevice(device)) as any
      if (result) {
        toast.success('Transfer Started', `Sending to ${device.name}`)
      }
    } catch (err: any) {
      toast.error('Send Failed', err?.message || 'Could not start the transfer.')
    } finally {
      setSending(false)
    }
  }

  const actionButtons = (t: TransferRecord) => {
    if (t.status === 'waiting_peer') {
      // A claimed DROP code whose host has not come online yet.
      return (
        <Button
          size='sm'
          variant='ghost'
          className='h-7 px-2 text-[10px] font-bold text-destructive'
          onClick={() => cancelTransfer(t.id)}
        >
          <XCircle className='mr-1 h-3 w-3' /> Cancel
        </Button>
      )
    }
    if (t.status === 'active') {
      return (
        <div className='flex items-center gap-1.5'>
          <Button
            size='sm'
            variant='outline'
            className='h-7 px-2 text-[10px] font-bold'
            onClick={() => pauseTransfer(t.id)}
          >
            <Pause className='mr-1 h-3 w-3' /> Pause
          </Button>
          <Button
            size='sm'
            variant='ghost'
            className='h-7 px-2 text-[10px] font-bold text-destructive'
            onClick={() => cancelTransfer(t.id)}
          >
            <XCircle className='mr-1 h-3 w-3' /> Cancel
          </Button>
        </div>
      )
    }
    if (t.status === 'queued' || t.status === 'paused' || t.status === 'interrupted') {
      return (
        <div className='flex items-center gap-1.5'>
          <Button
            size='sm'
            variant='outline'
            className='h-7 px-2 text-[10px] font-bold'
            onClick={() => resumeTransfer(t.id)}
          >
            <Play className='mr-1 h-3 w-3' /> Resume
          </Button>
          <Button
            size='sm'
            variant='ghost'
            className='h-7 px-2 text-[10px] font-bold text-destructive'
            onClick={() => cancelTransfer(t.id)}
          >
            <XCircle className='mr-1 h-3 w-3' /> Cancel
          </Button>
        </div>
      )
    }
    if (t.status === 'failed') {
      return (
        <Button
          size='sm'
          variant='outline'
          className='h-7 px-2 text-[10px] font-bold'
          onClick={() => retryTransfer(t.id)}
        >
          <RotateCcw className='mr-1 h-3 w-3' /> Retry
        </Button>
      )
    }
    if (t.status === 'completed') {
      const localPath = t.destPath || t.filePath
      if (!localPath) return null
      return (
        <Button
          size='sm'
          variant='outline'
          className='h-7 px-2 text-[10px] font-bold'
          title='Reveal the file in your system file manager'
          onClick={() => {
            if (window.bridge?.showItemInFolder) window.bridge.showItemInFolder(localPath)
          }}
        >
          <FolderOpen className='mr-1 h-3 w-3' /> Show in Folder
        </Button>
      )
    }
    return null
  }

  return (
    <div className='space-y-6 pb-12'>
      <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
        <div>
          <h2 className='text-xl font-black text-foreground'>Transfers</h2>
          <p className='text-xs text-muted-foreground'>
            Encrypted file streams with SHA-256 integrity verification.
          </p>
        </div>

        <div className='flex flex-wrap items-stretch md:items-center gap-2'>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            aria-label='Choose a device to send to'
            className='h-9 rounded-xl border border-border/80 bg-background/80 px-3 text-xs font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
          >
            <option value=''>Send to device…</option>
            {eligibleDevices.map((d) => (
              <option key={d.id} value={d.publicKey || d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <Button
            variant='outline'
            className='h-9 gap-1.5 text-xs font-bold'
            onClick={() => toggleDropCodeModal()}
            title='Create a one-time DROP code for a file'
          >
            <Link2 className='h-4 w-4' />
            Share Code
          </Button>
          <Button
            className='h-9 font-bold text-xs gap-1.5'
            onClick={handleSendFile}
            disabled={sending}
          >
            <FileUp className='h-4 w-4' />
            {sending ? 'Sending…' : 'Send File'}
          </Button>
          {terminalCount > 0 && (
            <Button
              variant='ghost'
              className='h-9 text-xs font-bold text-muted-foreground hover:text-destructive gap-1.5'
              onClick={() => setClearOpen(true)}
              title='Clear all finished and cancelled transfers'
            >
              <Trash2 className='h-4 w-4' /> Clear Finished
            </Button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className='grid grid-cols-3 gap-4'>
        <Card className='glass-card border-border/60'>
          <CardContent className='p-4 flex items-center justify-between'>
            <div className='space-y-1'>
              <p className='text-xs font-semibold text-muted-foreground'>Active</p>
              <p className='text-2xl font-black text-foreground'>{activeCount}</p>
            </div>
            <div className='flex h-10 w-10 items-center justify-center rounded-2xl bg-meshdrop-cyan/10 text-meshdrop-cyan border border-meshdrop-cyan/20'>
              <ArrowLeftRight className='h-5 w-5' />
            </div>
          </CardContent>
        </Card>
        <Card className='glass-card border-border/60'>
          <CardContent className='p-4 flex items-center justify-between'>
            <div className='space-y-1'>
              <p className='text-xs font-semibold text-muted-foreground'>Files Sent</p>
              <p className='text-2xl font-black text-foreground'>
                {transfers.filter((t) => t.direction === 'send').length}
              </p>
            </div>
            <div className='flex h-10 w-10 items-center justify-center rounded-2xl bg-meshdrop-cyan/10 text-meshdrop-cyan border border-meshdrop-cyan/20'>
              <Upload className='h-5 w-5' />
            </div>
          </CardContent>
        </Card>
        <Card className='glass-card border-border/60'>
          <CardContent className='p-4 flex items-center justify-between'>
            <div className='space-y-1'>
              <p className='text-xs font-semibold text-muted-foreground'>Files Received</p>
              <p className='text-2xl font-black text-foreground'>
                {transfers.filter((t) => t.direction === 'receive').length}
              </p>
            </div>
            <div className='flex h-10 w-10 items-center justify-center rounded-2xl bg-meshdrop-cyan/10 text-meshdrop-cyan border border-meshdrop-cyan/20'>
              <Download className='h-5 w-5' />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transfer List */}
      <Card className='glass-card border-border/60'>
        <CardContent className='p-0 divide-y divide-border/40'>
          {transfers.length === 0 ? (
            <div className='p-12 text-center space-y-3'>
              <div className='mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-muted/40 text-muted-foreground border border-border/40'>
                <ArrowLeftRight className='h-7 w-7' />
              </div>
              <div className='space-y-1'>
                <h3 className='text-sm font-bold text-foreground'>Nothing here yet</h3>
                <p className='text-xs text-muted-foreground max-w-sm mx-auto'>
                  Drop a file on the home screen to share it with a link, or enter a DROP code to
                  receive one. Every byte is verified before it is written to disk.
                </p>
              </div>
            </div>
          ) : (
            transfers.map((t) => {
              const isActive = t.status === 'active'
              const done = t.status === 'completed'
              const directionIcon =
                t.direction === 'send' ? (
                  <ArrowUp className='h-4 w-4 text-primary' />
                ) : (
                  <ArrowDown className='h-4 w-4 text-accent' />
                )
              return (
                <div
                  key={t.id}
                  className='p-4 flex items-start gap-3'
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setRowMenu({ transfer: t, x: e.clientX, y: e.clientY })
                  }}
                >
                  <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40 border border-border/40 shrink-0'>
                    {directionIcon}
                  </div>

                  <div className='flex-1 min-w-0 space-y-1.5'>
                    <div className='flex items-center justify-between gap-2'>
                      <div className='min-w-0'>
                        <p className='text-sm font-bold text-foreground truncate'>{t.filename}</p>
                        {t.status === 'waiting_peer' ? (
                          <p className='text-[11px] text-muted-foreground'>
                            {t.claimCode || 'DROP code'} · the sender's device has not come online
                            yet — the download starts automatically when it does
                          </p>
                        ) : (
                          <p className='text-[11px] text-muted-foreground'>
                            {t.direction === 'send' ? 'to' : 'from'}{' '}
                            {t.peerName || 'Remote Peer'} · {formatBytes(t.fileSize)} ·{' '}
                            {formatTime(t.createdAt)}
                            {t.transferMethod
                              ? ` · ${t.transferMethod === 'lan' ? 'LAN' : 'Internet'}`
                              : ''}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-extrabold border shrink-0 ${STATUS_STYLE[t.status]}`}
                      >
                        {STATUS_LABEL[t.status]}
                      </span>
                    </div>

                    {(isActive || t.status === 'paused' || t.status === 'queued') && (
                      <div className='space-y-1'>
                        <div className='h-1.5 w-full rounded-full bg-muted/60 overflow-hidden'>
                          <div
                            className='h-full rounded-full bg-meshdrop-cyan transition-all shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                            style={{ width: `${Math.max(0, Math.min(100, t.progress || 0))}%` }}
                          />
                        </div>
                        <div className='flex items-center justify-between text-[10px] font-mono text-muted-foreground'>
                          <span className='text-meshdrop-cyan font-bold'>
                            {Math.round(t.progress || 0)}%
                          </span>
                          <span className='flex items-center gap-2'>
                            {isActive && t.speed > 0 ? (
                              <span className='text-meshdrop-cyan font-bold'>
                                {formatSpeed(t.speed)}
                              </span>
                            ) : null}
                            {isActive && t.eta > 0 ? `ETA ${formatEta(t.eta)}` : null}
                          </span>
                        </div>
                      </div>
                    )}

                    {done && t.summary?.checksum && (
                      <div className='flex flex-wrap items-center gap-1.5'>
                        <span className='inline-flex items-center gap-1 rounded-md border border-meshdrop-cyan/30 bg-meshdrop-cyan/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-meshdrop-cyan'>
                          SHA-256 {t.summary.checksum.slice(0, 16)}…
                        </span>
                        {t.summary.blocksVerified != null && (
                          <span className='inline-flex items-center gap-1 font-mono text-[9px] text-muted-foreground'>
                            <ShieldCheck className='h-3 w-3 text-status-online' />
                            {t.summary.blocksVerified} blocks ·{' '}
                            {formatBytes(t.summary.bytesVerified ?? 0)} verified
                          </span>
                        )}
                      </div>
                    )}

                    {done && t.summary && !t.summary.checksum && (
                      <div className='flex items-center gap-1.5 text-[10px] font-mono text-status-online'>
                        <ShieldCheck className='h-3 w-3' />
                        <span>
                          Verified · {t.summary.blocksVerified ?? '—'} blocks ·{' '}
                          {formatBytes(t.summary.bytesVerified ?? 0)}
                        </span>
                      </div>
                    )}

                    {t.status === 'failed' && t.error && (
                      <p className='text-[10px] text-destructive truncate'>Error: {t.error}</p>
                    )}
                  </div>

                  <div className='shrink-0'>{actionButtons(t)}</div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Clear Finished Confirmation */}
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title='Clear finished transfers?'
        description='Completed, failed, cancelled, and interrupted transfers will be removed from the list. Active transfers are kept.'
        confirmLabel='Clear Transfers'
        onConfirm={clearTransfers}
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
              icon:
                rowMenu.transfer.status === 'active' ? (
                  <Pause className='h-3.5 w-3.5' />
                ) : (
                  <Play className='h-3.5 w-3.5' />
                ),
              onClick: () =>
                rowMenu.transfer.status === 'active'
                  ? pauseTransfer(rowMenu.transfer.id)
                  : resumeTransfer(rowMenu.transfer.id),
              disabled: !['active', 'queued', 'paused', 'interrupted'].includes(
                rowMenu.transfer.status
              )
            },
            {
              label: 'Cancel Transfer',
              icon: <XCircle className='h-3.5 w-3.5' />,
              onClick: () => cancelTransfer(rowMenu.transfer.id),
              disabled: ![
                'active',
                'queued',
                'paused',
                'interrupted',
                'pending_approval',
                'waiting_peer'
              ].includes(rowMenu.transfer.status)
            },
            {
              label: 'Retry',
              icon: <RotateCcw className='h-3.5 w-3.5' />,
              onClick: () => retryTransfer(rowMenu.transfer.id),
              disabled: rowMenu.transfer.status !== 'failed'
            }
          ]}
        />
      )}
    </div>
  )
}
