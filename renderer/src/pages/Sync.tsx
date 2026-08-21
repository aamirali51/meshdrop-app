import { useMemo, useState, useEffect, useRef } from 'react'
import {
  FolderPlus,
  RefreshCw,
  Trash2,
  Unlink,
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
  Laptop,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  Archive,
  Info
} from 'lucide-react'
import { useSync, SyncLibrary } from '@/hooks/useSync'
import { useDevices } from '@/hooks/useDevices'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/Modal'
import { cn } from '@/lib/utils'
import { EVENTS } from '@/types/protocol'
import { on } from '@/lib/ipc'

const STATUS_LABEL: Record<string, string> = {
  idle: 'Synchronized',
  scanning: 'Scanning…',
  syncing: 'Syncing…',
  waiting_peer: 'Waiting for device',
  up_to_date: 'Synchronized',
  paused: 'Paused',
  error: 'Sync Error'
}

const STATUS_STYLE: Record<string, string> = {
  idle: 'text-status-online border-status-online/30 bg-status-online/10',
  scanning: 'text-primary border-primary/30 bg-primary/10 animate-pulse',
  syncing: 'text-primary border-primary/30 bg-primary/10 animate-pulse',
  waiting_peer: 'text-amber-500 border-amber-500/30 bg-amber-500/10',
  up_to_date: 'text-status-online border-status-online/30 bg-status-online/10',
  paused: 'text-muted-foreground border-border/40 bg-muted/20',
  error: 'text-destructive border-destructive/30 bg-destructive/10'
}

const MODE_META: Record<string, { label: string; icon: typeof ArrowLeftRight; desc: string; badge: string }> = {
  'two-way': {
    label: 'Two-Way Sync',
    icon: ArrowLeftRight,
    desc: 'Bidirectional sync. Changes on either device propagate automatically.',
    badge: 'bg-primary/15 text-primary border-primary/30'
  },
  'push': {
    label: 'Send-Only (Backup)',
    icon: ArrowUpRight,
    desc: 'Local folder is master. Remote device is a read-only mirror.',
    badge: 'bg-meshdrop-cyan/15 text-meshdrop-cyan border-meshdrop-cyan/30'
  },
  'receive_only': {
    label: 'Receive-Only (Mirror)',
    icon: ArrowDownLeft,
    desc: 'Remote device is master. Local changes will never be pushed.',
    badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30'
  }
}

interface ActivityItem {
  id: string
  type: 'completed' | 'deleted' | 'conflict' | 'error'
  title: string
  detail: string
  timestamp: Date
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let val = bytes
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function formatRelativeTime(timestamp?: number | string): string {
  if (!timestamp) return 'Awaiting initial sync'
  const t = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
  if (isNaN(t) || t <= 0) return 'Awaiting initial sync'
  const diff = Date.now() - t
  if (diff < 15000) return 'Just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
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
  const [syncMode, setSyncMode] = useState<'two-way' | 'push' | 'receive_only'>('two-way')
  const [busy, setBusy] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([])
  const [libraryErrors, setLibraryErrors] = useState<Record<string, string>>({})
  const [removingLib, setRemovingLib] = useState<SyncLibrary | null>(null)

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

  // Live event listeners for user feedback and activity logging
  useEffect(() => {
    const unsubCompleted = on(EVENTS.SYNC_COMPLETED, (data: any) => {
      if (data && (data.pushed > 0 || data.deleted > 0)) {
        const now = Date.now()
        if (now - lastToastTimeRef.current > 10000) {
          lastToastTimeRef.current = now
          toastRef.current.success(
            'Folder Synced',
            `"${data.name || 'Folder'}" synchronized ${data.pushed || 0} file(s).`
          )
        }
        if (data.id || data.libraryId) {
          setLibraryErrors((prev) => {
            const copy = { ...prev }
            delete copy[data.id || data.libraryId]
            return copy
          })
        }
        setActivityLog((prev) => [
          {
            id: `act-${Date.now()}-${Math.random()}`,
            type: 'completed',
            title: `Synced "${data.name || 'Folder'}"`,
            detail: `${data.pushed || 0} updated, ${data.deleted || 0} removed`,
            timestamp: new Date()
          },
          ...prev.slice(0, 19)
        ])
      }
    })

    const unsubDeleted = on(EVENTS.SYNC_DELETED, (data: any) => {
      if (data?.rel) {
        setActivityLog((prev) => [
          {
            id: `act-${Date.now()}-${Math.random()}`,
            type: 'deleted',
            title: 'File Archived to Trash',
            detail: data.rel,
            timestamp: new Date()
          },
          ...prev.slice(0, 19)
        ])
      }
    })

    const unsubConflict = on(EVENTS.SYNC_CONFLICT, (data: any) => {
      if (data?.rel) {
        toastRef.current.error('Sync Conflict', `Simultaneous edit on "${data.rel}". Saved copy safely.`)
        setActivityLog((prev) => [
          {
            id: `act-${Date.now()}-${Math.random()}`,
            type: 'conflict',
            title: 'Concurrent Edit Conflict',
            detail: data.rel,
            timestamp: new Date()
          },
          ...prev.slice(0, 19)
        ])
      }
    })

    const unsubError = on(EVENTS.SYNC_ERROR, (data: any) => {
      const errMsg = data?.message || data?.error || 'Folder sync encountered an issue.'
      toastRef.current.error('Sync Error', errMsg)
      if (data?.id || data?.libraryId) {
        setLibraryErrors((prev) => ({
          ...prev,
          [data.id || data.libraryId]: errMsg
        }))
      }
    })

    return () => {
      unsubCompleted()
      unsubDeleted()
      unsubConflict()
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
      toast.error('Incomplete Selection', 'Choose a folder and select at least one target device.')
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
          name: folderName,
          mode: syncMode
        })
        addedCount++
      }

      if (addedCount > 0) {
        toast.success(
          'Sync Started',
          `"${folderName}" is now active in ${MODE_META[syncMode]?.label || 'Sync'} mode across ${addedCount} device(s).`
        )
        setFolderPath('')
        setSelectedPeerIds([])
      } else {
        toast.info('Already Syncing', 'This folder is already linked to the selected device(s).')
      }
    } catch (err: any) {
      toast.error('Sync Failed', err?.message || 'Could not start syncing.')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = (lib: SyncLibrary) => {
    setRemovingLib(lib)
  }

  const confirmRemove = async () => {
    if (!removingLib) return
    try {
      await removeSyncLibrary(removingLib.id)
      toast.success('Sync Removed', `"${removingLib.name}" sync link was removed.`)
    } catch (err: any) {
      toast.error('Remove Failed', err?.message || 'Could not remove sync.')
    } finally {
      setRemovingLib(null)
    }
  }

  const handleSyncNow = async (id: string) => {
    setSyncingId(id)
    try {
      await triggerSync(id)
      toast.success('Sync Rescanned', 'Examined folder and pushed pending changes.')
    } catch (err: any) {
      toast.error('Sync Failed', err?.message || 'Could not trigger sync.')
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
      toast.error('Unavailable', 'Opening folders is only available in desktop app.')
    }
  }

  const handleOpenTrash = async (localPath: string) => {
    if (!window.bridge?.openPath) return
    const trashPath = `${localPath.replace(/[\\/]+$/, '')}/.meshdrop-trash`
    const res = await window.bridge.openPath(trashPath)
    if (res?.error) {
      toast.info('Trash Empty', 'No archived files have been moved to safety trash yet.')
    }
  }

  const handleTogglePause = async (lib: { id: string; paused: boolean; name: string }) => {
    try {
      if (lib.paused) {
        await resumeSync(lib.id)
        toast.success('Sync Resumed', `${lib.name} is actively syncing again.`)
      } else {
        await pauseSync(lib.id)
        toast.success('Sync Paused', `${lib.name} has been paused.`)
      }
    } catch (err: any) {
      toast.error('Update Failed', err?.message || 'Could not update sync state.')
    }
  }

  const activeSyncCount = libraries.filter((l) => !l.paused).length
  const isAnySyncing = libraries.some((l) => l.status === 'syncing' || l.status === 'scanning')
  const hasErrors = libraries.some((l) => l.status === 'error' || Boolean(libraryErrors[l.id]))

  return (
    <div className='space-y-6 pb-12 max-w-6xl mx-auto'>
      {/* ── Live Sync Status Overview Bar ──────────────────────────────── */}
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
        <div className='glass-card rounded-2xl border border-border/60 p-4 flex items-center gap-3'>
          <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20'>
            <HardDrive className='h-5 w-5' />
          </div>
          <div>
            <p className='text-xs text-muted-foreground font-semibold'>Tracked Folders</p>
            <p className='text-lg font-black text-foreground'>{libraries.length}</p>
          </div>
        </div>

        <div className='glass-card rounded-2xl border border-border/60 p-4 flex items-center gap-3'>
          <div className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
            isAnySyncing
              ? 'bg-primary/10 text-primary border-primary/25 animate-spin'
              : hasErrors
              ? 'bg-destructive/10 text-destructive border-destructive/25'
              : 'bg-status-online/10 text-status-online border-status-online/25'
          )}>
            <ArrowLeftRight className='h-5 w-5' />
          </div>
          <div>
            <p className='text-xs text-muted-foreground font-semibold'>Engine State</p>
            <p className='text-xs font-bold flex items-center gap-1.5 text-foreground'>
              <span className={cn(
                'h-2 w-2 rounded-full',
                isAnySyncing ? 'bg-primary animate-ping' : hasErrors ? 'bg-destructive' : 'bg-status-online'
              )} />
              {isAnySyncing
                ? 'Synchronizing changes…'
                : hasErrors
                ? 'Attention Needed'
                : activeSyncCount > 0
                ? 'All Synchronized'
                : 'Idle'}
            </p>
          </div>
        </div>

        <div className='glass-card rounded-2xl border border-border/60 p-4 flex items-center gap-3'>
          <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-meshdrop-cyan/10 text-meshdrop-cyan border border-meshdrop-cyan/25'>
            <Laptop className='h-5 w-5' />
          </div>
          <div>
            <p className='text-xs text-muted-foreground font-semibold'>Connected Devices</p>
            <p className='text-xs font-bold text-foreground flex items-center gap-1.5'>
              <span className={cn('h-2 w-2 rounded-full', onlineDevices.length > 0 ? 'bg-status-online' : 'bg-muted-foreground')} />
              {onlineDevices.length > 0 ? `${onlineDevices.length} device(s) online` : 'No devices online'}
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
              <ArrowLeftRight className='h-3.5 w-3.5' /> 3-Way Baseline Sync Engine
            </span>
            <span className='flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground'>
              <ShieldCheck className='h-3.5 w-3.5 text-status-online' /> P2P Encrypted · No Cloud Intermediaries
            </span>
          </div>

          <div className='space-y-4'>
            {/* Step 1: Folder picker */}
            <div>
              <label className='block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5'>
                1. Select Local Folder
              </label>
              <button
                onClick={pickFolder}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl border border-dashed px-4 py-4 text-left transition-all cursor-pointer',
                  folderPath
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-primary/5'
                )}
              >
                <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/25'>
                  <FolderPlus className='h-5 w-5' />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='text-sm font-bold text-foreground'>
                    {folderPath ? 'Folder selected' : 'Choose a folder to synchronize'}
                  </p>
                  <p className='truncate text-xs text-muted-foreground'>
                    {folderPath || 'Click to browse local folders on this device'}
                  </p>
                </div>
                <Folder className='h-4 w-4 shrink-0 text-muted-foreground' />
              </button>
            </div>

            {/* Step 2: Sync Mode Selection (Syncthing/FreeFileSync standard) */}
            <div>
              <label className='block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5'>
                2. Choose Synchronization Mode
              </label>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-2.5'>
                {(['two-way', 'push', 'receive_only'] as const).map((m) => {
                  const meta = MODE_META[m]
                  const Icon = meta.icon
                  const active = syncMode === m
                  return (
                    <button
                      key={m}
                      type='button'
                      onClick={() => setSyncMode(m)}
                      className={cn(
                        'flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer',
                        active
                          ? 'border-primary/50 bg-primary/10 shadow-sm'
                          : 'border-border/60 bg-card/40 hover:border-border hover:bg-muted/20'
                      )}
                    >
                      <div className='flex items-center justify-between mb-1'>
                        <div className='flex items-center gap-1.5 font-bold text-xs text-foreground'>
                          <Icon className={cn('h-3.5 w-3.5', active ? 'text-primary' : 'text-muted-foreground')} />
                          {meta.label}
                        </div>
                        {active && <CheckCircle2 className='h-3.5 w-3.5 text-primary' />}
                      </div>
                      <p className='text-[10px] text-muted-foreground leading-snug'>{meta.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Step 3: Target Devices Selection */}
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <label className='block text-[11px] font-bold uppercase tracking-wider text-muted-foreground'>
                  3. Select Target Devices ({selectedPeerIds.length} selected)
                </label>
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
                  No trusted devices are currently online. Pair a device from{' '}
                  <span className='font-semibold text-foreground'>My Devices</span> and it will appear here.
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
              className='w-full gap-2 font-bold cursor-pointer h-11'
            >
              {busy ? (
                <>
                  <Loader2 className='h-4 w-4 animate-spin' /> Initializing Sync…
                </>
              ) : (
                <>
                  <RefreshCw className='h-4 w-4' /> Start Continuous Synchronization
                </>
              )}
            </Button>

            {(!folderPath || selectedPeerIds.length === 0) && (
              <p className='text-center text-[11px] font-medium text-muted-foreground pt-0.5'>
                {!folderPath && selectedPeerIds.length === 0
                  ? '← Please select a local folder (Step 1) and choose at least one target device (Step 3)'
                  : !folderPath
                  ? '← Please select a local folder (Step 1) to synchronize'
                  : '← Please select at least one online target device (Step 3)'}
              </p>
            )}
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
            Select a folder and a target device above to start continuous peer-to-peer synchronization.
          </p>
        </div>
      ) : (
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <span className='block text-[11px] font-bold uppercase tracking-wider text-muted-foreground'>
              Active Synchronized Folders ({libraries.length})
            </span>
          </div>

          {libraries.map((lib) => {
            const targetDev = deviceMap.get(lib.peerId)
            const isSyncingThis = syncingId === lib.id || lib.status === 'syncing' || lib.status === 'scanning'
            const progress = transferProgress[lib.id]
            const phase = phases[lib.id]
            const isAnalyzing = phase?.phase === 'analyzing'
            const isTransferring = phase?.phase === 'transferring'
            const modeMeta = MODE_META[lib.mode || 'two-way'] || MODE_META['two-way']
            const ModeIcon = modeMeta.icon
            const libError = libraryErrors[lib.id]

            return (
              <div
                key={lib.id}
                className={cn(
                  'glass-card rounded-2xl border p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all',
                  lib.status === 'error' || libError
                    ? 'border-destructive/40 bg-destructive/5 hover:border-destructive/60'
                    : 'border-border/60 hover:border-border/90'
                )}
              >
                <div className='flex items-start gap-3.5 min-w-0 flex-1'>
                  <div
                    onClick={() => handleOpenFolder(lib.localPath)}
                    className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 cursor-pointer hover:bg-primary/20 transition-colors'
                    title='Open local folder in File Explorer'
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

                      {/* Sync Mode Badge */}
                      <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide', modeMeta.badge)}>
                        <ModeIcon className='h-2.5 w-2.5' />
                        {modeMeta.label}
                      </span>

                      {/* Linked Target Device Pill */}
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

                    {/* Inline error feedback if present */}
                    {(lib.status === 'error' || libError) && (
                      <div className='flex items-center gap-1.5 text-[11px] text-destructive font-medium bg-destructive/10 border border-destructive/20 rounded-md px-2 py-1 mt-1'>
                        <AlertCircle className='h-3.5 w-3.5 shrink-0' />
                        <span className='truncate'>{libError || 'Folder synchronization encountered an issue. Check folder permissions or peer connection.'}</span>
                      </div>
                    )}

                    <div className='flex items-center gap-3 text-[10px] text-muted-foreground font-medium pt-0.5'>
                      <span>{lib.fileCount} file{lib.fileCount === 1 ? '' : 's'}</span>
                      <span>·</span>
                      <span>{formatBytes(lib.totalSize)}</span>
                      <span>·</span>
                      <span>{lib.lastSyncAt || lib.lastScanAt ? `Replicated ${formatRelativeTime(lib.lastSyncAt || lib.lastScanAt)}` : 'Awaiting initial sync'}</span>
                    </div>

                    {/* Live Progress & Speed Telemetry */}
                    <div className='mt-1.5 flex h-4.5 items-center gap-1.5 overflow-hidden font-mono text-[10px] text-muted-foreground'>
                      {isAnalyzing ? (
                        <span className='shrink-0 font-semibold text-primary flex items-center gap-1'>
                          <Loader2 className='h-3 w-3 animate-spin' />
                          {phase.total > 0 ? `Analyzing ${phase.total} files… (${phase.done}/${phase.total})` : 'Comparing index…'}
                        </span>
                      ) : progress ? (
                        <>
                          <span className='shrink-0 font-semibold text-primary'>
                            {progress.direction === 'send' ? 'Sending' : 'Receiving'}
                          </span>
                          <span className='min-w-0 flex-1 truncate'>{progress.filename}</span>
                          <span className='shrink-0 font-bold text-foreground'>{progress.progress}%</span>
                          {progress.speed ? (
                            <span className='shrink-0 text-primary'>
                              · {(progress.speed / 1024 / 1024).toFixed(1)} MB/s
                            </span>
                          ) : null}
                          {isTransferring && phase.total > 0 ? (
                            <span className='shrink-0 text-muted-foreground/70'>
                              · {phase.done}/{phase.total} files
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Status Pill & Action Buttons */}
                <div className='flex items-center justify-between md:justify-end gap-2.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/40'>
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
                      className='h-8 w-8 p-0 hover:text-primary cursor-pointer'
                      onClick={() => handleOpenFolder(lib.localPath)}
                      title='Open folder in File Explorer'
                    >
                      <FolderOpen className='h-4 w-4' />
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='h-8 w-8 p-0 hover:text-amber-400 cursor-pointer'
                      onClick={() => handleOpenTrash(lib.localPath)}
                      title='View Deleted / Archived Files (.meshdrop-trash)'
                    >
                      <Archive className='h-4 w-4' />
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='h-8 w-8 p-0 cursor-pointer'
                      onClick={() => handleSyncNow(lib.id)}
                      title='Rescan & push changes now'
                    >
                      <RefreshCw className={cn('h-4 w-4', isSyncingThis && 'animate-spin text-primary')} />
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='h-8 w-8 p-0 cursor-pointer'
                      onClick={() => handleTogglePause(lib)}
                      title={lib.paused ? 'Resume sync' : 'Pause sync'}
                    >
                      {lib.paused ? (
                        <Play className='h-4 w-4 text-status-online' />
                      ) : (
                        <Pause className='h-4 w-4 text-muted-foreground' />
                      )}
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='h-8 w-8 p-0 text-destructive hover:bg-destructive/10 cursor-pointer'
                      onClick={() => handleRemove(lib)}
                      title='Unlink & remove sync folder'
                    >
                      <Unlink className='h-4 w-4' />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Live Activity Log (Recent Sync Events) ───────────────────────── */}
      {activityLog.length > 0 && (
        <div className='glass-card rounded-2xl border border-border/60 p-5 space-y-3'>
          <div className='flex items-center gap-2 text-xs font-bold text-foreground'>
            <History className='h-4 w-4 text-primary' />
            <span>Recent Sync Activity</span>
          </div>
          <div className='space-y-1.5 max-h-48 overflow-y-auto pr-1'>
            {activityLog.map((act) => (
              <div
                key={act.id}
                className='flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-card/40 border border-border/30'
              >
                <div className='flex items-center gap-2 min-w-0'>
                  {act.type === 'completed' && <CheckCircle2 className='h-3.5 w-3.5 text-status-online shrink-0' />}
                  {act.type === 'deleted' && <Archive className='h-3.5 w-3.5 text-amber-400 shrink-0' />}
                  {act.type === 'conflict' && <AlertCircle className='h-3.5 w-3.5 text-destructive shrink-0' />}
                  <span className='font-bold text-foreground truncate'>{act.title}</span>
                  <span className='text-muted-foreground truncate font-mono text-[11px]'>{act.detail}</span>
                </div>
                <span
                  className='text-[10px] text-muted-foreground shrink-0'
                  title={act.timestamp.toLocaleString()}
                >
                  {formatRelativeTime(act.timestamp.getTime())}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Continuous Sync Guarantee Footer ───────────────────────────── */}
      <div className='flex items-center gap-2 rounded-xl border border-border/40 bg-card/40 p-3 text-[11px] text-muted-foreground'>
        <CheckCircle2 className='h-3.5 w-3.5 shrink-0 text-status-online' />
        MeshDrop uses a 3-Way Baseline Snapshot Engine. Files stream directly between your devices with end-to-end encryption.
        Deleted files are safely moved to the local <code className='text-foreground font-mono'>.meshdrop-trash</code> archive, never permanently deleted without warning.
      </div>

      {/* ── Confirm Removal Dialog ─────────────────────────────────────── */}
      <ConfirmDialog
        open={Boolean(removingLib)}
        onOpenChange={(open) => !open && setRemovingLib(null)}
        title='Remove Sync Mapping'
        description={`Stop synchronizing "${removingLib?.name}"? Your local files on disk will NOT be deleted. The linked peer will be notified to disconnect this sync link.`}
        confirmLabel='Unlink Sync'
        onConfirm={confirmRemove}
      />
    </div>
  )
}
