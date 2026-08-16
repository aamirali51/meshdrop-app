import { useMemo, useState, useEffect, useRef } from 'react'
import {
  FolderPlus,
  RefreshCw,
  Trash2,
  Folder,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Loader2,
  Pause,
  Play,
  ArrowLeftRight,
  ShieldCheck,
  Laptop
} from 'lucide-react'
import { useSync } from '@/hooks/useSync'
import { useDevices } from '@/hooks/useDevices'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EVENTS } from '@/types/protocol'
import { on } from '@/lib/ipc'

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  scanning: 'Scanning…',
  syncing: 'Syncing…',
  waiting_peer: 'Waiting for device',
  up_to_date: 'Up to date',
  paused: 'Paused',
  error: 'Error'
}

const STATUS_STYLE: Record<string, string> = {
  idle: 'text-muted-foreground border-border/40 bg-muted/20',
  scanning: 'text-primary border-primary/30 bg-primary/10 animate-pulse',
  syncing: 'text-primary border-primary/30 bg-primary/10 animate-pulse',
  waiting_peer: 'text-amber-500 border-amber-500/30 bg-amber-500/10',
  up_to_date: 'text-status-online border-status-online/30 bg-status-online/10',
  paused: 'text-muted-foreground border-border/40 bg-muted/20',
  error: 'text-destructive border-destructive/30 bg-destructive/10'
}

export function Sync() {
  const { libraries, transferProgress, phases, addSyncLibrary, removeSyncLibrary, triggerSync, pauseSync, resumeSync } =
    useSync()
  const { devices } = useDevices()
  const { toast } = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const lastToastTimeRef = useRef<number>(0)

  const [folderPath, setFolderPath] = useState('')
  const [selectedPeerIds, setSelectedPeerIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const onlineDevices = useMemo(
    () => devices.filter((d) => d.publicKey && d.isTrusted !== false && d.isOnline !== false),
    [devices]
  )

  const deviceMap = useMemo(() => {
    const map = new Map<string, (typeof devices)[0]>()
    devices.forEach((d) => {
      if (d.publicKey) map.set(d.publicKey, d)
    })
    return map
  }, [devices])

  const togglePeer = (publicKey: string) => {
    setSelectedPeerIds((prev) =>
      prev.includes(publicKey) ? prev.filter((id) => id !== publicKey) : [...prev, publicKey]
    )
  }

  const toggleSelectAll = () => {
    if (selectedPeerIds.length === onlineDevices.length) {
      setSelectedPeerIds([])
    } else {
      setSelectedPeerIds(onlineDevices.map((d) => d.publicKey!))
    }
  }

  // Live Toast Notifications for SYNC events across any device side (throttled to prevent toast flooding)
  useEffect(() => {
    const unsubCompleted = on(EVENTS.SYNC_COMPLETED, (data: any) => {
      if (data && (data.pushed > 0 || data.deleted > 0)) {
        const now = Date.now()
        if (now - lastToastTimeRef.current < 20000) return
        lastToastTimeRef.current = now
        toastRef.current.success(
          'Folder Synced Live',
          `${data.pushed || 0} file(s) updated, ${data.deleted || 0} removed across devices.`
        )
      }
    })
    const unsubDeleted = on(EVENTS.SYNC_DELETED, (data: any) => {
      if (data?.rel) {
        toastRef.current.info('File Archived', `"${data.rel}" was moved to trash safety folder.`)
      }
    })
    const unsubError = on(EVENTS.SYNC_ERROR, (data: any) => {
      toastRef.current.error('Sync Error', data?.message || 'Folder sync encountered an issue.')
    })
    return () => {
      unsubCompleted()
      unsubDeleted()
      unsubError()
    }
  }, [])

  const pickFolder = async () => {
    if (!window.bridge?.openFolderDialog) {
      toast.error('Unavailable', 'Folder dialogs are only available in the desktop app')
      return
    }
    try {
      const picked = await window.bridge.openFolderDialog()
      if (picked) setFolderPath(picked)
    } catch {
      toast.error('Pick Failed', 'Could not open the folder picker.')
    }
  }

  const startSync = async () => {
    if (!folderPath || selectedPeerIds.length === 0) {
      toast.error('Incomplete', 'Choose a folder and at least one target device to sync to.')
      return
    }

    setBusy(true)
    let addedCount = 0
    const folderName = folderPath.split(/[\\/]/).pop() || 'Sync'

    try {
      for (const pId of selectedPeerIds) {
        const existing = libraries.find(
          (lib) => lib.localPath.toLowerCase() === folderPath.toLowerCase() && lib.peerId === pId
        )
        if (existing) continue
        await addSyncLibrary({
          path: folderPath,
          peerId: pId,
          name: folderName
        })
        addedCount++
      }

      if (addedCount > 0) {
        toast.success(
          'Sync Started',
          `"${folderName}" is now syncing across ${addedCount} selected device(s).`
        )
        setFolderPath('')
        setSelectedPeerIds([])
      } else {
        toast.info('Already Syncing', 'This folder is already syncing with the selected device(s).')
      }
    } catch (err: any) {
      toast.error('Sync Failed', err?.message || 'Could not start syncing.')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await removeSyncLibrary(id)
      toast.success('Sync Removed', 'The folder is no longer being synced.')
    } catch (err: any) {
      toast.error('Remove Failed', err?.message || 'Could not remove the sync.')
    }
  }

  const handleSyncNow = async (id: string) => {
    setSyncingId(id)
    try {
      await triggerSync(id)
      toast.success('Sync Triggered', 'Rescanned and pushed live changes.')
    } catch (err: any) {
      toast.error('Sync Failed', err?.message || 'Could not trigger a sync.')
    } finally {
      setTimeout(() => setSyncingId(null), 1000)
    }
  }

  const handleOpenFolder = async (path: string) => {
    if (window.bridge?.openPath) {
      const res = await window.bridge.openPath(path)
      if (res?.error) {
        toast.error('Cannot Open Folder', res.error)
      }
    } else {
      toast.error('Unavailable', 'Opening folders is only available in the desktop app.')
    }
  }

  const handleTogglePause = async (lib: { id: string; paused: boolean; name: string }) => {
    try {
      if (lib.paused) {
        await resumeSync(lib.id)
        toast.success('Sync Resumed', `${lib.name} is syncing again.`)
      } else {
        await pauseSync(lib.id)
        toast.success('Sync Paused', `${lib.name} is paused.`)
      }
    } catch (err: any) {
      toast.error('Update Failed', err?.message || 'Could not update the sync.')
    }
  }

  const activeSyncCount = libraries.filter((l) => !l.paused).length
  const isAnySyncing = libraries.some((l) => l.status === 'syncing' || l.status === 'scanning')

  return (
    <div className='space-y-6 pb-12'>
      {/* ── Live Sync Status Overview Bar ──────────────────────────────── */}
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
        <div className='glass-card rounded-2xl border border-border/60 p-4 flex items-center gap-3'>
          <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20'>
            <HardDrive className='h-5 w-5' />
          </div>
          <div>
            <p className='text-xs text-muted-foreground font-semibold'>Synced Folders</p>
            <p className='text-lg font-black text-foreground'>{libraries.length}</p>
          </div>
        </div>

        <div className='glass-card rounded-2xl border border-border/60 p-4 flex items-center gap-3'>
          <div className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
            isAnySyncing
              ? 'bg-primary/10 text-primary border-primary/25 animate-spin'
              : 'bg-status-online/10 text-status-online border-status-online/25'
          )}>
            <ArrowLeftRight className='h-5 w-5' />
          </div>
          <div>
            <p className='text-xs text-muted-foreground font-semibold'>Live Engine Status</p>
            <p className='text-xs font-bold flex items-center gap-1.5 text-foreground'>
              <span className={cn('h-2 w-2 rounded-full', isAnySyncing ? 'bg-primary animate-ping' : 'bg-status-online')} />
              {isAnySyncing ? 'Syncing changes…' : activeSyncCount > 0 ? 'All up to date' : 'Idle'}
            </p>
          </div>
        </div>

        <div className='glass-card rounded-2xl border border-border/60 p-4 flex items-center gap-3'>
          <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-meshdrop-cyan/10 text-meshdrop-cyan border border-meshdrop-cyan/25'>
            <Laptop className='h-5 w-5' />
          </div>
          <div>
            <p className='text-xs text-muted-foreground font-semibold'>Online Target Devices</p>
            <p className='text-xs font-bold text-foreground flex items-center gap-1.5'>
              <span className={cn('h-2 w-2 rounded-full', onlineDevices.length > 0 ? 'bg-status-online' : 'bg-muted-foreground')} />
              {onlineDevices.length > 0 ? `${onlineDevices.length} device(s) ready` : 'No devices online'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Hero: Create a sync ─────────────────────────────────────────── */}
      <div className='glass-card gradient-border overflow-hidden relative'>
        <div className='absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl' />
        <div className='relative z-10 p-6 md:p-7 space-y-5'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='rounded-full border border-meshdrop-cyan/30 bg-meshdrop-cyan/10 px-3 py-1 text-[11px] font-bold text-meshdrop-cyan flex items-center gap-1.5 w-fit'>
              <ArrowLeftRight className='h-3.5 w-3.5' /> Two-Way Continuous P2P Sync
            </span>
            <span className='flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground'>
              <ShieldCheck className='h-3.5 w-3.5 text-status-online' /> End-to-End Encrypted Noise Stream
            </span>
          </div>

          <div className='space-y-4'>
            {/* Folder picker */}
            <button
              onClick={pickFolder}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border border-dashed px-4 py-4 text-left transition-all cursor-pointer',
                folderPath
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-hairline/15 bg-muted/20 hover:border-primary/50 hover:bg-primary/5'
              )}
            >
              <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/25'>
                <FolderPlus className='h-5 w-5' />
              </div>
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-bold text-foreground'>
                  {folderPath ? 'Folder selected' : 'Choose a folder to sync'}
                </p>
                <p className='truncate text-xs text-muted-foreground'>
                  {folderPath || 'New files and edits push to your target device automatically'}
                </p>
              </div>
              <Folder className='h-4 w-4 shrink-0 text-muted-foreground' />
            </button>

            {/* Device picker (multi-device) */}
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <span className='block text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                  Select Target Devices ({selectedPeerIds.length} selected)
                </span>
                {onlineDevices.length > 1 && (
                  <button
                    type='button'
                    onClick={toggleSelectAll}
                    className='text-[10px] font-bold text-primary hover:underline cursor-pointer'
                  >
                    {selectedPeerIds.length === onlineDevices.length ? 'Deselect All' : 'Select All Devices'}
                  </button>
                )}
              </div>
              {onlineDevices.length === 0 ? (
                <p className='rounded-xl border border-border/40 bg-card/40 p-3 text-xs text-muted-foreground'>
                  No trusted devices are online. Pair a device from{' '}
                  <span className='font-semibold text-foreground'>My Devices</span> and it will
                  appear here.
                </p>
              ) : (
                <div className='flex flex-wrap gap-1.5'>
                  {onlineDevices.map((d) => {
                    const selected = selectedPeerIds.includes(d.publicKey!)
                    return (
                      <button
                        key={d.id}
                        type='button'
                        onClick={() => togglePeer(d.publicKey!)}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all cursor-pointer border',
                          selected
                            ? 'bg-primary/15 text-primary border-primary/40 shadow-sm'
                            : 'border-border/60 bg-card/40 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <span className={cn('h-2 w-2 rounded-full', d.isOnline ? 'bg-status-online' : 'bg-muted-foreground')} />
                        <span>{d.name}</span>
                        {selected && <CheckCircle2 className='h-3.5 w-3.5 text-primary shrink-0' />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <Button
              onClick={startSync}
              disabled={!folderPath || selectedPeerIds.length === 0 || busy}
              className='w-full gap-2 font-bold cursor-pointer'
            >
              {busy ? (
                <>
                  <Loader2 className='h-4 w-4 animate-spin' /> Starting Sync…
                </>
              ) : (
                <>
                  <RefreshCw className='h-4 w-4' /> Start Continuous Sync
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Library List (Active Sync Cards) ────────────────────────────── */}
      {libraries.length === 0 ? (
        <div className='glass-card rounded-2xl border border-border/60 p-8 text-center'>
          <div className='mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/25'>
            <HardDrive className='h-6 w-6' />
          </div>
          <p className='text-sm font-bold text-foreground'>No active folder syncs</p>
          <p className='mx-auto mt-1 max-w-sm text-xs text-muted-foreground'>
            Select a folder and a target device above — MeshDrop keeps files synchronized bidirectionally across your devices.
          </p>
        </div>
      ) : (
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <span className='block text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
              Active Live Syncs ({libraries.length})
            </span>
          </div>

          {libraries.map((lib) => {
            const targetDev = deviceMap.get(lib.peerId)
            const isSyncingThis = syncingId === lib.id || lib.status === 'syncing' || lib.status === 'scanning'
            const progress = transferProgress[lib.id]
            const phase = phases[lib.id]
            const isAnalyzing = phase?.phase === 'analyzing'
            const isTransferring = phase?.phase === 'transferring'

            return (
              <div
                key={lib.id}
                className='glass-card rounded-2xl border border-border/60 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-border'
              >
                <div className='flex items-start gap-3 min-w-0 flex-1'>
                  <div
                    onClick={() => handleOpenFolder(lib.localPath)}
                    className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 cursor-pointer hover:bg-primary/20 transition-colors'
                    title='Click to open folder'
                  >
                    <Folder className='h-5 w-5' />
                  </div>
                  <div className='min-w-0 flex-1 space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <p
                        onClick={() => handleOpenFolder(lib.localPath)}
                        className='truncate text-sm font-bold text-foreground hover:text-primary cursor-pointer transition-colors'
                      >
                        {lib.name}
                      </p>
                      {lib.autoCreated && (
                        <span className='shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-primary'>
                          Linked
                        </span>
                      )}
                      {targetDev && (
                        <span className='flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground'>
                          <span className={cn('h-1.5 w-1.5 rounded-full', targetDev.isOnline ? 'bg-status-online' : 'bg-muted-foreground')} />
                          {targetDev.name}
                        </span>
                      )}
                    </div>
                    <p
                      onClick={() => handleOpenFolder(lib.localPath)}
                      className='truncate text-[11px] font-mono text-muted-foreground hover:text-foreground cursor-pointer transition-colors'
                    >
                      {lib.localPath}
                    </p>
                    <div className='flex items-center gap-3 text-[10px] text-muted-foreground/80 font-medium'>
                      <span>{lib.fileCount} file{lib.fileCount === 1 ? '' : 's'}</span>
                      <span>·</span>
                      <span>Continuous P2P</span>
                    </div>
                    {/* Live transfer status — a compact text row showing what is
                        currently happening. The analysis phase (comparing
                        existing files) renders as an explicit counter, NOT a
                        progress bar — only real payload transfers get one. The
                        row always reserves space so the card never changes size */}
                    <div className='mt-1.5 flex h-4 items-center gap-1.5 overflow-hidden font-mono text-[10px] text-muted-foreground'>
                      {isAnalyzing ? (
                        <span className='shrink-0 font-semibold text-muted-foreground'>
                          {phase.total > 0
                            ? `Analyzing ${phase.total} files… (${phase.done}/${phase.total})`
                            : 'Analyzing files…'}
                        </span>
                      ) : progress ? (
                        <>
                          <span className='shrink-0 font-semibold text-primary'>
                            {progress.direction === 'send' ? 'Sending' : 'Receiving'}
                          </span>
                          <span className='min-w-0 flex-1 truncate'>{progress.filename}</span>
                          <span className='shrink-0'>{progress.progress}%</span>
                          {progress.speed ? (
                            <span className='shrink-0'>
                              · {(progress.speed / 1024 / 1024).toFixed(1)} MB/s
                            </span>
                          ) : null}
                          {isTransferring && phase.total > 0 ? (
                            <span className='shrink-0 text-muted-foreground/70'>
                              · {phase.done}/{phase.total}
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className='flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/40'>
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold',
                      STATUS_STYLE[lib.status] || STATUS_STYLE.idle
                    )}
                  >
                    {STATUS_LABEL[lib.status] || lib.status}
                  </span>

                  <div className='flex items-center gap-1'>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='h-8 w-8 p-0 text-xs font-semibold hover:text-primary cursor-pointer'
                      onClick={() => handleOpenFolder(lib.localPath)}
                      title='Open folder in File Explorer'
                    >
                      <FolderOpen className='h-4 w-4' />
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='h-8 w-8 p-0 text-xs font-semibold cursor-pointer'
                      onClick={() => handleSyncNow(lib.id)}
                      title='Sync changes now'
                    >
                      <RefreshCw className={cn('h-4 w-4', isSyncingThis && 'animate-spin text-primary')} />
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='h-8 w-8 p-0 text-xs font-semibold cursor-pointer'
                      onClick={() => handleTogglePause(lib)}
                      title={lib.paused ? 'Resume sync' : 'Pause sync'}
                    >
                      {lib.paused ? (
                        <Play className='h-4 w-4 text-status-online' />
                      ) : (
                        <Pause className='h-4 w-4' />
                      )}
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='h-8 w-8 p-0 text-xs font-semibold text-destructive hover:bg-destructive/10 cursor-pointer'
                      onClick={() => handleRemove(lib.id)}
                      title='Remove sync'
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Continuous Sync Guarantee Footer ───────────────────────────── */}
      <div className='flex items-center gap-2 rounded-xl border border-border/40 bg-card/40 p-3 text-[11px] text-muted-foreground'>
        <CheckCircle2 className='h-3.5 w-3.5 shrink-0 text-status-online' />
        Files travel directly between your devices — end-to-end encrypted, no cloud in
        between. Edits on either side stay in sync; deleted files move to a trash folder,
        never a hard delete.
      </div>
    </div>
  )
}
