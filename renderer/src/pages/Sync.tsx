import { useMemo, useState, useEffect, useRef } from 'react'
import {
  FolderPlus,
  RefreshCw,
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
  Info,
  Check,
  ChevronDown,
  Clock3,
  WifiOff
} from 'lucide-react'
import { useSync, SyncLibrary } from '@/hooks/useSync'
import { useDevices } from '@/hooks/useDevices'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/Modal'
import { ProgressRing } from '@/ui/primitives/ProgressRing'
import { DeviceAvatar } from '@/ui/primitives/DeviceAvatar'
import { cn } from '@/lib/utils'
import { EVENTS, METHODS } from '@/types/protocol'
import { on, call } from '@/lib/ipc'
import { isWeb, openPath, pickFolder as pickFolderCap } from '@/lib/capabilities'

const STATUS_LABEL: Record<string, string> = {
  idle: 'Synchronized',
  scanning: 'Scanning…',
  syncing: 'Syncing…',
  waiting_peer: 'Waiting for device',
  blocked_unpaired: 'Pairing required',
  revoked: 'Device removed',
  up_to_date: 'Synchronized',
  paused: 'Paused',
  error: 'Sync Error'
}

const STATUS_STYLE: Record<string, string> = {
  idle: 'text-status-online border-status-online/30 bg-status-online/10',
  scanning: 'text-primary border-primary/30 bg-primary/10 animate-pulse',
  syncing: 'text-primary border-primary/30 bg-primary/10 animate-pulse',
  waiting_peer: 'text-amber-500 border-amber-500/30 bg-amber-500/10',
  blocked_unpaired: 'text-amber-500 border-amber-500/30 bg-amber-500/10',
  revoked: 'text-muted-foreground border-border/40 bg-muted/20',
  up_to_date: 'text-status-online border-status-online/30 bg-status-online/10',
  paused: 'text-muted-foreground border-border/40 bg-muted/20',
  error: 'text-destructive border-destructive/30 bg-destructive/10'
}

const MODE_META: Record<string, { label: string; shortLabel: string; icon: typeof ArrowLeftRight; desc: string; shortDesc: string; badge: string }> = {
  'two-way': {
    label: 'Two-Way',
    shortLabel: 'Two-Way',
    icon: ArrowLeftRight,
    desc: 'Bidirectional sync. Changes on either device propagate automatically.',
    shortDesc: 'Changes flow both ways',
    badge: 'bg-primary/15 text-primary border-primary/30'
  },
  push: {
    label: 'Send-Only',
    shortLabel: 'Send-Only',
    icon: ArrowUpRight,
    desc: 'One-way sync: this folder is the source. Files are copied to the remote device only.',
    shortDesc: 'This folder is the source — the other device gets a copy',
    badge: 'bg-meshdrop-cyan/15 text-meshdrop-cyan border-meshdrop-cyan/30'
  },
  receive_only: {
    label: 'Receive-Only',
    shortLabel: 'Receive-Only',
    icon: ArrowDownLeft,
    desc: 'One-way sync: the remote device is the source. Nothing on this device is ever uploaded.',
    shortDesc: 'The other device is the source — this folder follows along',
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

function formatRelativeTime(timestamp?: number | string | Date): string {
  if (!timestamp) return 'Awaiting initial sync'
  const t = timestamp instanceof Date ? timestamp.getTime() : typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
  if (isNaN(t) || t <= 0) return 'Awaiting initial sync'
  const diff = Date.now() - t
  if (diff < 15000) return 'Just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function getRingProps(status: string, progress?: { progress: number }, phase?: { phase: string; total: number; done: number }, hasError?: boolean) {
  if (hasError || status === 'error') return { value: 100, color: 'warning' as const, spin: false }
  if (status === 'paused') return { value: 0, color: 'muted' as const, spin: false }
  if (status === 'scanning' || phase?.phase === 'analyzing') {
    const v = phase && phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 38
    return { value: v, color: 'primary' as const, spin: true }
  }
  if (status === 'syncing' || phase?.phase === 'transferring' || progress) {
    const v = progress?.progress ?? (phase && phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 62)
    return { value: Math.min(100, Math.max(0, v)), color: 'primary' as const, spin: !progress }
  }
  if (status === 'waiting_peer' || status === 'blocked_unpaired' || status === 'revoked') return { value: 0, color: 'warning' as const, spin: false }
  if (status === 'conflict') return { value: 100, color: 'warning' as const, spin: false }
  return { value: 100, color: 'success' as const, spin: false }
}

export function Sync() {
  const { libraries, transferProgress, phases, addSyncLibrary, removeSyncLibrary, triggerSync, pauseSync, resumeSync, refresh } =
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pairRequired, setPairRequired] = useState<Record<string, boolean>>({})
  const waitingSinceRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now()
      setPairRequired((prev) => {
        const next = { ...prev }
        let changed = false
        for (const lib of libraries) {
          if (lib.status === 'waiting_peer') {
            if (!waitingSinceRef.current[lib.id]) waitingSinceRef.current[lib.id] = now
            if (now - waitingSinceRef.current[lib.id] > 30000 && !next[lib.id]) {
              next[lib.id] = true
              changed = true
            }
          } else if (lib.status !== 'blocked_unpaired' && (next[lib.id] || waitingSinceRef.current[lib.id])) {
            delete next[lib.id]
            delete waitingSinceRef.current[lib.id]
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 5000)
    return () => clearInterval(iv)
  }, [libraries])

  const pairNow = async (lib: SyncLibrary) => {
    const deviceName = deviceMap.get(lib.peerId)?.name || 'the device'
    try {
      await call(METHODS.DEVICES_CONFIRM_LAN as string, { publicKey: lib.peerId })
      toast.success('Device Paired', `"${lib.name}" will resume syncing automatically.`)
      refresh()
    } catch {
      toast.info(
        'Device not detected right now',
        `Open MeshDrop Go on ${deviceName} and try again, or pair via code from the Devices page.`
      )
    }
  }

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

    const unsubDenied = on(EVENTS.SYNC_DENIED, (data: any) => {
      const name = data?.name || 'a folder'
      toastRef.current.info(
        'Sync Requires Pairing',
        `Folder sync for "${name}" is paused until the devices are paired.`
      )
      if (data?.id || data?.libraryId) {
        const libId = data.id || data.libraryId
        setPairRequired((prev) => (prev[libId] ? prev : { ...prev, [libId]: true }))
      }
      setActivityLog((prev) => [
        {
          id: `act-${Date.now()}-${Math.random()}`,
          type: 'error',
          title: 'Sync Requires Pairing',
          detail: `The device sharing "${name}" is detected but not paired.`,
          timestamp: new Date()
        },
        ...prev.slice(0, 19)
      ])
    })

    return () => {
      unsubCompleted()
      unsubDeleted()
      unsubConflict()
      unsubError()
      unsubDenied()
    }
  }, [])

  const pickFolder = async () => {
    try {
      const picked = await pickFolderCap()
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
    if (isWeb) {
      toast.info('Desktop Only', 'Open the folder in the MeshDrop Go desktop app to reveal it here.')
      return
    }
    const res = await openPath(path)
    if (res?.error) {
      toast.error('Cannot Open Folder', res.error)
    }
  }

  const handleOpenTrash = async (localPath: string) => {
    if (isWeb) return
    const trashPath = `${localPath.replace(/[\\/]+$/, '')}/.meshdrop-trash`
    const res = await openPath(trashPath)
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

  const wizardStep1Done = !!folderPath
  const wizardStep3Done = selectedPeerIds.length > 0
  const wizardValid = wizardStep1Done && wizardStep3Done
  const activeSyncCount = libraries.filter((l) => !l.paused).length
  const isAnySyncing = libraries.some((l) => l.status === 'syncing' || l.status === 'scanning')
  const hasErrors = libraries.some((l) => l.status === 'error' || Boolean(libraryErrors[l.id]))

  return (
    <div className='space-y-6 pb-12 max-w-6xl mx-auto'>
      {/* ── Calm status strip ─────────────────────────────────────────────── */}
      <div className='flex flex-wrap items-center gap-2 text-xs'>
        <span className='inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card px-3 py-1.5 font-semibold text-muted-foreground'>
          <HardDrive className='h-3.5 w-3.5' />
          {libraries.length} folder{libraries.length === 1 ? '' : 's'} tracked
        </span>
        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold', isAnySyncing ? 'border-primary/30 bg-primary/10 text-primary' : hasErrors ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-status-online/20 bg-status-online/10 text-status-online')}>
          <span className={cn('h-1.5 w-1.5 rounded-full', isAnySyncing ? 'bg-primary animate-pulse' : hasErrors ? 'bg-destructive' : 'bg-status-online')} />
          {isAnySyncing ? 'Syncing…' : hasErrors ? 'Attention needed' : activeSyncCount > 0 ? 'All synchronized' : 'Idle — set and forget'}
        </span>
        <span className='inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card px-3 py-1.5 font-medium text-muted-foreground'>
          <Laptop className='h-3.5 w-3.5' />
          {onlineDevices.length > 0 ? `${onlineDevices.length} trusted device${onlineDevices.length === 1 ? '' : 's'} online` : 'No trusted devices online'}
        </span>
      </div>

      {/* ── Wizard: 3 steps with progress dots ───────────────────────────── */}
      <div className='rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden'>
        <div className='px-6 pt-6 pb-2'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <h2 className='text-[15px] font-black tracking-tight text-foreground flex items-center gap-2'>
                <span className='inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20'>
                  <FolderPlus className='h-4 w-4' />
                </span>
                Set up folder sync
              </h2>
              <p className='mt-1 text-xs text-muted-foreground'>Guided setup — pick a folder, choose a direction, select who to sync with. Set and forget.</p>
            </div>
            <span className='hidden sm:inline-flex items-center gap-1 rounded-full border border-border/40 bg-muted/40 px-2.5 py-1 font-mono text-[10px] text-muted-foreground'>
              <ShieldCheck className='h-3 w-3 text-status-online' /> P2P encrypted · No cloud
            </span>
          </div>

          {/* Progress dots — 3-step wizard */}
          <div className='mt-5 flex items-center gap-2' role='progressbar' aria-valuenow={wizardStep1Done && wizardStep3Done ? 3 : wizardStep1Done || wizardStep3Done ? 2 : 1} aria-valuemin={1} aria-valuemax={3} aria-label='Setup progress'>
            {([1, 2, 3] as const).map((n) => {
              const done = n === 1 ? wizardStep1Done : n === 2 ? true : wizardStep3Done
              const connectorDone = (n === 1 && wizardStep1Done) || (n === 2 && wizardStep3Done)
              return (
                <div key={n} className='flex items-center gap-2 flex-1'>
                  <div className='flex items-center gap-2'>
                    <span className={cn('flex h-7 w-7 items-center justify-center rounded-full border text-xs font-black transition-colors', done ? 'bg-primary text-white border-primary' : 'bg-primary/10 text-primary border-primary/30')}>
                      {done ? <Check className='h-3.5 w-3.5' /> : n}
                    </span>
                    <span className={cn('hidden sm:inline text-xs font-bold', done ? 'text-foreground' : 'text-muted-foreground')}>
                      {n === 1 ? 'Choose folder' : n === 2 ? 'Direction' : 'Devices'}
                    </span>
                  </div>
                  {n < 3 && <span className={cn('h-0.5 flex-1 rounded-full transition-colors', connectorDone ? 'bg-primary/40' : 'bg-border/60')} />}
                </div>
              )
            })}
          </div>
        </div>

        <div className='px-6 pb-6 space-y-5 pt-4'>
          {/* Step 1: Choose folder — capabilities-aware picker */}
          <div className='rounded-xl border border-border/50 bg-muted/20 p-4'>
            <div className='flex items-center justify-between gap-2 mb-2'>
              <span className='text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5'>
                <span className='flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[10px] font-black'>1</span>
                Choose folder
              </span>
              {folderPath && <span className='inline-flex items-center gap-1 text-[11px] font-bold text-status-online'><CheckCircle2 className='h-3.5 w-3.5' /> Selected</span>}
            </div>
            <button
              onClick={pickFolder}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 text-left transition-all cursor-pointer',
                folderPath ? 'border-primary/40 bg-primary/[0.06] hover:bg-primary/[0.09]' : 'border-border/60 bg-card hover:border-primary/40 hover:bg-primary/[0.04]'
              )}
            >
              <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20'>
                <FolderPlus className='h-5 w-5' />
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block text-sm font-bold text-foreground truncate'>{folderPath ? folderPath.split(/[\\/]/).pop() || folderPath : 'Choose a folder to synchronize'}</span>
                <span className='block truncate text-xs text-muted-foreground font-mono' title={folderPath || 'Click to browse — uses the in-app picker in the browser, native dialog on desktop'}>
                  {folderPath ? <span title={folderPath}>{folderPath}</span> : 'Click to browse local folders on this device'}
                </span>
              </span>
              <Folder className='h-4 w-4 shrink-0 text-muted-foreground' />
            </button>
            <p className='mt-2 text-[11px] leading-relaxed text-muted-foreground flex items-center gap-1.5'>
              <Info className='h-3 w-3 shrink-0' />
              {isWeb ? 'In the browser, the in-app picker walks this computer’s real drives — no OS dialog.' : 'On desktop, this opens the native folder picker. The path is used directly by the sync engine.'}
            </p>
          </div>

          {/* Step 2: Direction — three selectable cards, F14 copy preserved */}
          <div>
            <span className='mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground'>
              <span className='flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[10px] font-black'>2</span>
              Direction
            </span>
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
                      'flex flex-col rounded-xl border p-3.5 text-left transition-all cursor-pointer',
                      active ? 'border-primary/40 bg-primary/[0.07] shadow-sm' : 'border-border/50 bg-card hover:border-border hover:bg-muted/30'
                    )}
                  >
                    <span className='flex items-center justify-between gap-2 mb-1.5'>
                      <span className='inline-flex items-center gap-1.5 text-xs font-black text-foreground'>
                        <Icon className={cn('h-3.5 w-3.5', active ? 'text-primary' : 'text-muted-foreground')} />
                        {meta.label}
                      </span>
                      {active && <span className='flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white'><Check className='h-3 w-3' /></span>}
                    </span>
                    <span className='text-xs font-semibold leading-snug text-foreground'>{meta.shortDesc}</span>
                    <span className='mt-1 text-[11px] leading-snug text-muted-foreground'>{meta.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Step 3: Target devices — multi-select DeviceAvatars, trusted only */}
          <div className='rounded-xl border border-border/50 bg-muted/20 p-4'>
            <div className='flex items-center justify-between gap-2 mb-3'>
              <span className='text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5'>
                <span className='flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[10px] font-black'>3</span>
                Target devices
                <span className='font-normal normal-case tracking-normal text-muted-foreground/80'>· {selectedPeerIds.length} selected</span>
              </span>
              {onlineDevices.length > 1 && (
                <button type='button' onClick={toggleSelectAll} className='text-[11px] font-bold text-primary hover:underline cursor-pointer'>
                  {selectedPeerIds.length === onlineDevices.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>
            {onlineDevices.length === 0 ? (
              <div className='flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-3'>
                <WifiOff className='h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5' />
                <div className='min-w-0'>
                  <p className='text-xs font-bold text-foreground'>No trusted devices online</p>
                  <p className='mt-0.5 text-xs leading-relaxed text-muted-foreground'>Pair a device from <span className='font-semibold text-foreground'>Devices</span>. Only trusted peers appear here — the engine also gates untrusted peers.</p>
                </div>
              </div>
            ) : (
              <div className='flex flex-wrap gap-2.5'>
                {onlineDevices.map((d) => {
                  const selected = selectedPeerIds.includes(d.publicKey!)
                  return (
                    <button
                      key={d.id}
                      type='button'
                      onClick={() => togglePeer(d.publicKey!)}
                      className={cn(
                        'group flex items-center gap-2.5 rounded-2xl border px-2.5 py-2 pr-3 text-left transition-all cursor-pointer',
                        selected ? 'border-primary/40 bg-primary/10 shadow-sm' : 'border-border/50 bg-card hover:border-border hover:bg-muted/30'
                      )}
                    >
                      <DeviceAvatar name={d.name} os={d.os as any} size='sm' presence={d.isOnline ? 'online' : 'offline'} pulse={selected && !!d.isOnline} />
                      <span className='min-w-0'>
                        <span className={cn('block max-w-[14ch] truncate text-xs font-bold', selected ? 'text-primary' : 'text-foreground')}>{d.name}</span>
                        <span className='block text-[10px] font-mono text-muted-foreground'>{d.isOnline ? 'online' : 'offline'} · trusted</span>
                      </span>
                      <span className={cn('ml-1 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition-colors', selected ? 'bg-primary border-primary text-white' : 'border-border bg-muted/60 text-muted-foreground group-hover:border-primary/30')}>
                        {selected ? <Check className='h-3 w-3' /> : <span className='h-1.5 w-1.5 rounded-full bg-muted-foreground/60' />}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <Button
            onClick={startSync}
            disabled={!wizardValid || busy}
            className='w-full gap-2 font-bold h-11 cursor-pointer'
          >
            {busy ? (
              <>
                <Loader2 className='h-4 w-4 animate-spin' /> Initializing sync…
              </>
            ) : (
              <>
                <RefreshCw className='h-4 w-4' /> Start continuous synchronization
              </>
            )}
          </Button>
          {!wizardValid && (
            <p className='text-center text-[11px] font-medium text-muted-foreground' role='status' aria-live='polite'>
              {!folderPath && selectedPeerIds.length === 0
                ? 'Select a folder (step 1) and at least one trusted device (step 3) to start'
                : !folderPath
                  ? 'Select a folder in step 1 to continue'
                  : 'Select at least one trusted device in step 3'}
            </p>
          )}
        </div>
      </div>

      {/* ── Library cards with calm ProgressRing ────────────────────────── */}
      {libraries.length === 0 ? (
        <div className='rounded-2xl border border-dashed border-border/60 bg-card/40 p-8 text-center'>
          <div className='mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20'>
            <HardDrive className='h-6 w-6' />
          </div>
          <p className='text-sm font-bold text-foreground'>No active folder syncs yet</p>
          <p className='mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground'>Complete the 3 steps above — choose a folder, a direction, and a trusted device — to start a continuous, end-to-end encrypted sync.</p>
        </div>
      ) : (
        <div className='space-y-3'>
          <div className='flex items-center gap-2'>
            <span className='text-[11px] font-bold uppercase tracking-widest text-muted-foreground'>Active synchronized folders</span>
            <span className='rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground'>{libraries.length}</span>
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
            const hasError = Boolean(libError) || lib.status === 'error'
            const ring = getRingProps(lib.status, progress, phase, hasError)
            const perLibEvents = activityLog.filter((a) => a.title.includes(lib.name) || a.detail.includes(lib.name)).slice(0, 6)
            const expanded = expandedId === lib.id
            const lastSyncTs = lib.lastSyncAt || lib.lastScanAt

            return (
              <div
                key={lib.id}
                className={cn(
                  'overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors',
                  hasError ? 'border-destructive/30 bg-destructive/[0.04]' : 'border-border/50'
                )}
              >
                <div className='flex gap-3 p-4 md:gap-4'>
                  <div className='hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/15'>
                    <Folder className='h-5 w-5' />
                  </div>

                  <div className='min-w-0 flex-1 space-y-1.5'>
                    <div className='flex flex-wrap items-center gap-1.5'>
                      <span className='truncate text-sm font-bold text-foreground' title={lib.name}>{lib.name}</span>
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide', modeMeta.badge)}>
                        <ModeIcon className='h-2.5 w-2.5' />{modeMeta.label}
                      </span>
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold', hasError ? 'border-destructive/30 bg-destructive/10 text-destructive' : ring.color === 'success' ? 'border-status-online/20 bg-status-online/10 text-status-online' : ring.color === 'warning' ? 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-primary/20 bg-primary/10 text-primary')}>
                        {hasError ? 'error' : lib.status === 'paused' ? 'paused' : lib.status === 'scanning' ? 'scanning' : lib.status === 'syncing' ? 'syncing' : lib.status === 'waiting_peer' || pairRequired[lib.id] ? 'waiting' : 'up to date'}
                      </span>
                    </div>

                    <p className='flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground' title={lib.localPath}>
                      <span className='truncate' title={lib.localPath}>{lib.localPath}</span>
                      <button onClick={() => handleOpenFolder(lib.localPath)} className='shrink-0 rounded p-0.5 hover:bg-muted hover:text-foreground' title='Open folder'><FolderOpen className='h-3 w-3' /></button>
                    </p>

                    <div className='flex flex-wrap items-center gap-2 text-xs'>
                      <span className='inline-flex items-center gap-1.5'>
                        {targetDev ? (
                          <>
                            <DeviceAvatar name={targetDev.name} os={targetDev.os as any} size='sm' presence={targetDev.isOnline ? 'online' : 'offline'} />
                            <span className='font-semibold text-foreground truncate max-w-[16ch]' title={targetDev.name}>{targetDev.name}</span>
                            <span className={cn('h-1.5 w-1.5 rounded-full', targetDev.isOnline ? 'bg-status-online' : 'bg-muted-foreground/60')} />
                          </>
                        ) : (
                          <span className='font-mono text-[11px] text-muted-foreground truncate max-w-[20ch]' title={lib.peerId}>{lib.peerId.slice(0, 12)}…</span>
                        )}
                      </span>
                      <span className='text-muted-foreground/60'>·</span>
                      <span className='inline-flex items-center gap-1 text-[11px] text-muted-foreground'><Clock3 className='h-3 w-3' />{formatRelativeTime(lastSyncTs)}</span>
                      <span className='text-muted-foreground/60'>·</span>
                      <span className='text-[11px] text-muted-foreground'>{lib.fileCount} file{lib.fileCount === 1 ? '' : 's'} · {formatBytes(lib.totalSize)}</span>
                    </div>

                    {hasError && (
                      <div className='flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-2.5 py-1.5 text-[11px] font-medium text-destructive'>
                        <AlertCircle className='h-3.5 w-3.5 shrink-0' /><span className='truncate' title={libError}>{libError || 'Folder sync encountered an issue. Check permissions or peer connection.'}</span>
                      </div>
                    )}

                    {(lib.status === 'blocked_unpaired' || lib.status === 'revoked' || pairRequired[lib.id]) && (
                      <div className='flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300'>
                        <AlertCircle className='h-3.5 w-3.5 shrink-0' />
                        <span className='min-w-0 flex-1 truncate'>{lib.status === 'revoked' ? 'This device was removed — re-pair to resume.' : `Waiting for ${deviceMap.get(lib.peerId)?.name || 'device'} — folder sync requires pairing.`}</span>
                        {lib.status !== 'revoked' && (
                          <Button size='sm' variant='outline' className='h-7 shrink-0 border-amber-500/30 text-[11px] font-bold' onClick={() => pairNow(lib)}>Pair now</Button>
                        )}
                      </div>
                    )}

                    <div className='flex min-h-[18px] items-center gap-1.5 font-mono text-[11px] text-muted-foreground'>
                      {isAnalyzing ? (
                        <span className='inline-flex items-center gap-1 font-semibold text-primary'><Loader2 className='h-3 w-3 animate-spin' />{phase.total > 0 ? `Analyzing ${phase.total} files… (${phase.done}/${phase.total})` : 'Comparing index…'}</span>
                      ) : progress ? (
                        <>
                          <span className='shrink-0 font-semibold text-primary'>{progress.direction === 'send' ? 'Sending' : 'Receiving'}</span>
                          <span className='min-w-0 flex-1 truncate' title={progress.filename}>{progress.filename}</span>
                          <span className='shrink-0 font-bold text-foreground'>{progress.progress}%</span>
                          {progress.speed ? <span className='shrink-0 text-primary'>· {(progress.speed / 1024 / 1024).toFixed(1)} MB/s</span> : null}
                          {isTransferring && phase.total > 0 ? <span className='shrink-0 text-muted-foreground/70'>· {phase.done}/{phase.total} files</span> : null}
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className='flex shrink-0 flex-col items-center gap-1.5 self-start'>
                    <div className={cn(ring.spin && 'animate-[spin_1.8s_linear_infinite]')} style={ring.spin ? { animation: 'spin 1.8s linear infinite' } as any : undefined}>
                      <ProgressRing value={ring.value} color={ring.color} size='sm' showLabel aria-label={`${lib.name} sync status ${STATUS_LABEL[lib.status] || lib.status}`} />
                    </div>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-extrabold leading-none', STATUS_STYLE[lib.status] || STATUS_STYLE.idle)}>{STATUS_LABEL[lib.status] || lib.status}</span>
                    <span className='font-mono text-[10px] text-muted-foreground'>{lib.paused ? 'paused' : formatRelativeTime(lastSyncTs)}</span>
                  </div>
                </div>

                <div className='flex flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-muted/20 px-3 py-2'>
                  <span className='inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground'>
                    <History className='h-3.5 w-3.5' /> Recent events
                    {perLibEvents.length > 0 && <span className='rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary'>{perLibEvents.length}</span>}
                  </span>
                  <div className='flex items-center gap-1'>
                    <Button size='sm' variant='ghost' className='h-7 w-7 p-0 cursor-pointer' onClick={() => handleSyncNow(lib.id)} title='Sync now — rescan & push'>
                      <RefreshCw className={cn('h-3.5 w-3.5', isSyncingThis && 'animate-spin text-primary')} />
                    </Button>
                    <Button size='sm' variant='ghost' className='h-7 w-7 p-0 cursor-pointer' onClick={() => handleTogglePause(lib)} title={lib.paused ? 'Resume sync' : 'Pause sync'}>
                      {lib.paused ? <Play className='h-3.5 w-3.5 text-status-online' /> : <Pause className='h-3.5 w-3.5' />}
                    </Button>
                    <Button size='sm' variant='ghost' className='h-7 w-7 p-0 text-destructive hover:bg-destructive/10 cursor-pointer' onClick={() => handleRemove(lib)} title='Remove sync'>
                      <Unlink className='h-3.5 w-3.5' />
                    </Button>
                    <Button size='sm' variant='ghost' className='h-7 gap-1 px-2 cursor-pointer' onClick={() => setExpandedId(expanded ? null : lib.id)}>
                      {expanded ? 'Hide' : 'Show'} <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <div className='border-t border-border/40 bg-card px-3 py-3'>
                    {perLibEvents.length === 0 ? (
                      <p className='rounded-lg border border-dashed border-border/50 bg-muted/20 px-3 py-3 text-center text-xs text-muted-foreground'>No recent events for this folder yet. Events from <code className='font-mono text-foreground'>sync.*</code> will appear here live — completed, archived, and conflicts.</p>
                    ) : (
                      <ul className='space-y-1.5'>
                        {perLibEvents.map((e) => (
                          <li key={e.id} className='flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-muted/20 px-2.5 py-2'>
                            <span className='flex min-w-0 items-center gap-2 text-xs'>
                              {e.type === 'completed' && <CheckCircle2 className='h-3.5 w-3.5 shrink-0 text-status-online' />}
                              {e.type === 'deleted' && <Archive className='h-3.5 w-3.5 shrink-0 text-amber-500' />}
                              {e.type === 'conflict' && <AlertCircle className='h-3.5 w-3.5 shrink-0 text-destructive' />}
                              {e.type === 'error' && <AlertCircle className='h-3.5 w-3.5 shrink-0 text-amber-600' />}
                              <span className='truncate font-semibold text-foreground'>{e.title}</span>
                              <span className='hidden sm:inline truncate font-mono text-[11px] text-muted-foreground'>{e.detail}</span>
                            </span>
                            <span className='shrink-0 font-mono text-[10px] text-muted-foreground' title={e.timestamp.toLocaleString()}>{formatRelativeTime(e.timestamp)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className='mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground'>
                      <Info className='h-3 w-3 shrink-0' /> Live — events update from <code className='font-mono text-foreground'>sync.completed</code>, <code className='font-mono text-foreground'>sync.deleted</code>, <code className='font-mono text-foreground'>sync.conflict</code>, <code className='font-mono text-foreground'>sync.error</code> and <code className='font-mono text-foreground'>sync.denied</code>.
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Trash — calm retention card ───────────────────────────────── */}
      <div className='rounded-2xl border border-border/40 bg-card p-4 shadow-sm'>
        <div className='flex items-start gap-3'>
          <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/40 text-muted-foreground'>
            <Archive className='h-5 w-5' />
          </span>
          <div className='min-w-0 flex-1 space-y-1'>
            <p className='text-sm font-bold text-foreground flex items-center gap-1.5'><ShieldCheck className='h-4 w-4 text-status-online' /> Safe trash</p>
            <p className='text-xs leading-relaxed text-muted-foreground'>
              When a file is deleted on one side, MeshDrop Go never erases it immediately. It moves to <code className='rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground'>.meshdrop-trash</code> inside that folder so you can restore it. Items are kept for <span className='font-semibold text-foreground'>30 days</span> before automatic cleanup — your data is never lost without warning.
            </p>
            {libraries.length > 0 && (
              <div className='flex flex-wrap gap-1.5 pt-1'>
                {libraries.slice(0, 3).map((lib) => (
                  <button key={lib.id} onClick={() => handleOpenTrash(lib.localPath)} className='inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer' title={`Open trash for ${lib.name}`}>
                    <FolderOpen className='h-3 w-3' />{lib.name} trash
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Global recent activity (when no per-library expansion) ─────── */}
      {activityLog.length > 0 && !libraries.some((l) => expandedId === l.id) && (
        <div className='rounded-2xl border border-border/50 bg-card p-4 shadow-sm space-y-3'>
          <div className='flex items-center gap-2 text-xs font-bold text-foreground'>
            <History className='h-4 w-4 text-primary' />
            <span>Recent sync activity</span>
            <span className='rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground'>{activityLog.length}</span>
          </div>
          <div className='space-y-1.5 max-h-52 overflow-y-auto pr-1'>
            {activityLog.slice(0, 8).map((act) => (
              <div key={act.id} className='flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-muted/20 px-2.5 py-2 text-xs'>
                <span className='flex min-w-0 items-center gap-2'>
                  {act.type === 'completed' && <CheckCircle2 className='h-3.5 w-3.5 shrink-0 text-status-online' />}
                  {act.type === 'deleted' && <Archive className='h-3.5 w-3.5 shrink-0 text-amber-500' />}
                  {act.type === 'conflict' && <AlertCircle className='h-3.5 w-3.5 shrink-0 text-destructive' />}
                  {act.type === 'error' && <AlertCircle className='h-3.5 w-3.5 shrink-0 text-amber-600' />}
                  <span className='truncate font-bold text-foreground'>{act.title}</span>
                  <span className='hidden sm:inline truncate font-mono text-[11px] text-muted-foreground'>{act.detail}</span>
                </span>
                <span className='shrink-0 font-mono text-[10px] text-muted-foreground' title={act.timestamp.toLocaleString()}>{formatRelativeTime(act.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(removingLib)}
        onOpenChange={(open) => !open && setRemovingLib(null)}
        title='Remove sync'
        description={`Stop synchronizing "${removingLib?.name}"? Your local files on disk will NOT be deleted. The linked peer will be notified to disconnect this sync link.`}
        confirmLabel='Unlink sync'
        onConfirm={confirmRemove}
      />
    </div>
  )
}
