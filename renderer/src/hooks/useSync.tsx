import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { METHODS, EVENTS } from '@/types/protocol'
import { call, on } from '@/lib/ipc'

export interface SyncLibrary {
  id: string
  name: string
  localPath: string
  peerId: string
  status: 'idle' | 'scanning' | 'syncing' | 'waiting_peer' | 'up_to_date' | 'paused' | 'error'
  mode?: 'two-way' | 'push' | 'receive_only'
  paused: boolean
  autoCreated: boolean
  fileCount: number
  totalSize?: number
  lastScanAt?: number
  lastSyncAt?: number
  phase?: string
}

interface SyncContextValue {
  libraries: SyncLibrary[]
  transferProgress: Record<string, { filename: string; direction: string; progress: number; speed: number }>
  phases: Record<string, { phase: string; total: number; done: number }>
  refresh: () => void
  addSyncLibrary: (params: { path: string; peerId: string; name?: string; mode?: 'two-way' | 'push' | 'receive_only' }) => Promise<SyncLibrary>
  removeSyncLibrary: (id: string) => Promise<void>
  triggerSync: (id: string) => Promise<void>
  pauseSync: (id: string) => Promise<void>
  resumeSync: (id: string) => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

// Live list of one-way sync libraries. The engine pushes new/changed files to
// the target paired device on its own schedule; this provider just keeps the
// UI's list + statuses in sync with the engine's events.
export function SyncProvider({ children }: { children: ReactNode }) {
  const [libraries, setLibraries] = useState<SyncLibrary[]>([])
  // Library id -> live transfer progress (real verified bytes from the event
  // stream — never polled).
  const [transferProgress, setTransferProgress] = useState<Record<string, { filename: string; direction: string; progress: number; speed: number }>>({})
  // Library id -> sync run phase (analyzing/transferring/synced) with counters.
  const [phases, setPhases] = useState<Record<string, { phase: string; total: number; done: number }>>({})

  const refresh = useCallback(() => {
    call(METHODS.SYNC_LIST || 'sync.list', null)
      .then((res) => setLibraries((res as SyncLibrary[]) || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const events = [
      EVENTS.SYNC_LIBRARY_ADDED || 'sync:libraryAdded',
      EVENTS.SYNC_LIBRARY_REMOVED || 'sync:libraryRemoved',
      EVENTS.SYNC_SCAN || 'sync:scan',
      EVENTS.SYNC_UP_TO_DATE || 'sync:upToDate',
      EVENTS.SYNC_COMPLETED || 'sync:completed',
      EVENTS.SYNC_DELETED || 'sync:deleted',
      EVENTS.SYNC_CONFLICT || 'sync:conflict',
      EVENTS.SYNC_ERROR || 'sync:error'
    ]
    const unsubs = events.map((e) => on(e, refresh))

    // Live per-library progress. Stable references: return the previous state
    // when nothing changed so the cards don't re-render on every event.
    const unsubProgress = on(EVENTS.TRANSFER_PROGRESS || 'transfer.progress', (delta: any) => {
      if (!delta || delta.source !== 'sync' || !delta.syncLibraryId) return
      setTransferProgress((prev) => {
        const p = Math.min(100, Math.round(delta.progress || 0))
        const s = delta.speed || 0
        const cur = prev[delta.syncLibraryId]
        if (cur && cur.progress === p && cur.speed === s) return prev
        return { ...prev, [delta.syncLibraryId]: { filename: (cur && cur.filename) || 'file', direction: (cur && cur.direction) || 'receive', progress: p, speed: s } }
      })
    })
    const unsubStarted = on(EVENTS.TRANSFER_STARTED || 'transfer.started', (t: any) => {
      if (!t || t.source !== 'sync' || !t.syncLibraryId) return
      setTransferProgress((prev) => ({
        ...prev,
        [t.syncLibraryId]: { filename: t.filename || 'file', direction: t.direction || 'receive', progress: 0, speed: 0 },
      }))
    })
    const clearProgress = (t: any) => {
      if (!t || t.source !== 'sync' || !t.syncLibraryId) return
      setTransferProgress((prev) => {
        if (!prev[t.syncLibraryId]) return prev
        const next = { ...prev }
        delete next[t.syncLibraryId]
        return next
      })
    }
    const unsubDone = on(EVENTS.TRANSFER_COMPLETED || 'transfer.completed', clearProgress)
    const unsubFailed = on(EVENTS.TRANSFER_FAILED || 'transfer.failed', clearProgress)
    const unsubCancelled = on(EVENTS.TRANSFER_CANCELLED || 'transfer.cancelled', clearProgress)

    // Run phases (analyzing → transferring → synced) with counters.
    const unsubPhase = on(EVENTS.SYNC_PHASE || 'sync:phase', (p: any) => {
      if (!p || !p.id) return
      setPhases((prev) => {
        const cur = prev[p.id]
        if (cur && cur.phase === p.phase && cur.total === (p.total || 0) && cur.done === (p.done || 0)) {
          return prev
        }
        return { ...prev, [p.id]: { phase: p.phase, total: p.total || 0, done: p.done || 0 } }
      })
    })

    return () => {
      unsubs.forEach((u) => u())
      unsubProgress()
      unsubStarted()
      unsubDone()
      unsubFailed()
      unsubCancelled()
      unsubPhase()
    }
  }, [refresh])

  const addSyncLibrary = useCallback(
    async (params: { path: string; peerId: string; name?: string }) => {
      const lib = (await call(METHODS.SYNC_ADD || 'sync.add', params)) as SyncLibrary
      refresh()
      return lib
    },
    [refresh]
  )

  const removeSyncLibrary = useCallback(
    async (id: string) => {
      await call(METHODS.SYNC_REMOVE || 'sync.remove', { id })
      refresh()
    },
    [refresh]
  )

  const triggerSync = useCallback(
    async (id: string) => {
      await call(METHODS.SYNC_TRIGGER || 'sync.trigger', { id })
      refresh()
    },
    [refresh]
  )

  const pauseSync = useCallback(
    async (id: string) => {
      await call(METHODS.SYNC_PAUSE || 'sync.pause', { id })
      refresh()
    },
    [refresh]
  )

  const resumeSync = useCallback(
    async (id: string) => {
      await call(METHODS.SYNC_RESUME || 'sync.resume', { id })
      refresh()
    },
    [refresh]
  )

  return (
    <SyncContext.Provider
      value={{ libraries, transferProgress, phases, refresh, addSyncLibrary, removeSyncLibrary, triggerSync, pauseSync, resumeSync }}
    >
      {children}
    </SyncContext.Provider>
  )
}

export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used within SyncProvider')
  return ctx
}
