import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { METHODS, EVENTS } from '@/types/protocol'
import { call, on } from '@/lib/ipc'
import { useToast } from '@/hooks/useToast'

export interface SiteRecord {
  id: string
  siteId: string
  code: string
  name: string
  folderPath: string
  createdAt: number
  allowlist: ({ key: string; role: 'viewer' | 'editor' } | string)[]
  writeMode?: 'read-only' | 'collab'
  spa?: boolean
}

export interface ActiveVisit {
  siteId: string | null
  code: string | null
  name: string | null
  hostPeerId: string | null
}

export interface ActiveState {
  hosting: SiteRecord | null
  activeSites: SiteRecord[]
  visiting: ActiveVisit | null
  // Every folder this device is currently browsing (multi-visit). A visit is
  // "open" from the moment its SITE_HELLO completes until leaveSite(siteId).
  visits: ActiveVisit[]
}

export interface ReceivedSite {
  siteId: string
  code: string
  name: string
  expiresAt: number
  hostPeerId: string
  addedAt: number
  /** Display name of the sharing device (attached to SITE_INVITE by the host). */
  hostName?: string
  hostDeviceId?: string
}

export interface SiteStats {
  fileCount: number
  dirCount: number
  totalBytes: number
  newestMtimeMs: number
  partial?: boolean
}

interface SharedFoldersContextValue {
  sites: SiteRecord[]
  active: ActiveState
  received: ReceivedSite[]
  loading: boolean
  pendingVisitCode: string | null
  clearPendingVisitCode: () => void
  refresh: () => void
  publishSite: (params: { folderPath: string; name?: string; writeMode?: string; spa?: boolean; expirationPreset?: string }) => Promise<SiteRecord>
  updateSite: (siteId: string, patch: Record<string, unknown>) => Promise<SiteRecord>
  unpublishSite: (siteId: string) => Promise<void>
  addVisitor: (siteId: string, code: string, role?: string) => Promise<{ publicKey: string }>
  updateVisitorRole: (siteId: string, publicKey: string, role: string) => Promise<void>
  removeVisitor: (siteId: string, publicKey: string) => Promise<void>
  visitSite: (code: string) => Promise<ActiveVisit>
  leaveSite: (siteId?: string) => Promise<void>
  openShare: (code: string) => Promise<ActiveVisit>
  closeShare: (siteId: string) => Promise<void>
  getSiteStats: (siteId: string) => Promise<SiteStats>
  removeReceivedSite: (siteId: string) => Promise<void>
  getGatewayUrl: () => Promise<string | null>
  writeFile: (path: string, dataBase64: string, siteId?: string) => Promise<void>
  mkdir: (path: string, siteId?: string) => Promise<void>
  deletePath: (path: string, siteId?: string) => Promise<void>
  listFiles: (path: string, siteId?: string) => Promise<unknown[]>
}

const SharedFoldersContext = createContext<SharedFoldersContextValue | null>(null)

function normalizeAllowlist(raw: unknown): SiteRecord['allowlist'] {
  if (!Array.isArray(raw)) return []
  return raw.map((e: unknown) => {
    if (typeof e === 'string') return { key: e, role: 'viewer' as const }
    const o = e as { key: string; role: string }
    return { key: o.key, role: o.role === 'editor' ? 'editor' as const : 'viewer' as const }
  })
}

export function SharedFoldersProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()
  const [sites, setSites] = useState<SiteRecord[]>([])
  const [received, setReceived] = useState<ReceivedSite[]>([])
  const [active, setActive] = useState<ActiveState>({ hosting: null, activeSites: [], visiting: null, visits: [] })
  const [loading, setLoading] = useState(true)
  const [pendingVisitCode, setPendingVisitCode] = useState<string | null>(null)

  const fetchAll = useCallback(() => {
    call(METHODS.SITES_LIST || 'sites.list', null)
      .then((res) => setSites(((res as SiteRecord[]) || []).map((s) => ({ ...s, allowlist: normalizeAllowlist((s as SiteRecord).allowlist) }))))
      .catch(() => {})
    call(METHODS.SITES_LIST_RECEIVED || 'sites.listReceived', null)
      .then((res) => setReceived(((res as ReceivedSite[]) || [])))
      .catch(() => {})
    call(METHODS.SITES_GET_ACTIVE || 'sites.getActive', null)
      .then((res) => {
        const r = (res || {}) as ActiveState & { visits?: ActiveVisit[] }
        const visits = Array.isArray(r.visits) ? r.visits : (r.visiting ? [r.visiting] : [])
        setActive({
          hosting: r.hosting ? { ...r.hosting, allowlist: normalizeAllowlist((r.hosting as SiteRecord).allowlist) } : null,
          activeSites: Array.isArray((r as unknown as { activeSites: SiteRecord[] }).activeSites) ? (r as unknown as { activeSites: SiteRecord[] }).activeSites.map((s) => ({ ...s, allowlist: normalizeAllowlist(s.allowlist) })) : (r.hosting ? [{ ...r.hosting, allowlist: normalizeAllowlist((r.hosting as SiteRecord).allowlist) }] : []),
          visiting: r.visiting || null,
          visits
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  const refresh = useCallback(() => { fetchAll() }, [fetchAll])
  const initialRefresh = fetchAll

  useEffect(() => {
    initialRefresh()
    let debounce: ReturnType<typeof setTimeout> | null = null
    const debouncedRefresh = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => refresh(), 250)
    }
    const events = [
      EVENTS.SITE_UPDATED || 'site.updated',
      EVENTS.SITE_VISITOR_ADDED || 'site.visitor_added',
      EVENTS.SITE_VISITOR_REMOVED || 'site.visitor_removed',
      EVENTS.SITE_VISITOR_FAILED || 'site.visitor_failed',
      EVENTS.SITE_VISIT_STARTED || 'site.visit_started',
      EVENTS.SITE_VISIT_STOPPED || 'site.visit_stopped',
      EVENTS.SITE_INVITE_RECEIVED || 'site.invite_received'
    ]
    const unsubs = events.map((e) => on(e, debouncedRefresh))
    // A share just landed — surface a toast so it's not silent
    const unsubInvite = on('site.invite_received' as string, (data: unknown) => {
      const d = data as { name?: string; code?: string } | null
      if (d && (d.name || d.code)) toast.success('Shared Folder Received', `"${d.name || d.code}" — tap Visit to open`)
    })
    const unsubDeepLink = window.bridge?.onDeepLink?.((data) => {
      const code = data.code?.trim().toUpperCase() || ''
      if (!code) return
      if (data.kind === 'site' || code.startsWith('SITE-')) setPendingVisitCode(code)
    })
    return () => { if (debounce) clearTimeout(debounce); unsubs.forEach((u) => u()); unsubInvite(); if (unsubDeepLink) unsubDeepLink() }
  }, [initialRefresh, refresh, toast])

  const publishSite = useCallback(async (params: { folderPath: string; name?: string; writeMode?: string; spa?: boolean; expirationPreset?: string }) => {
    return (await call(METHODS.SITES_PUBLISH || 'sites.publish', params)) as SiteRecord
  }, [])
  const updateSite = useCallback(async (siteId: string, patch: Record<string, unknown>) => {
    return (await call(METHODS.SITES_UPDATE || 'sites.update', { siteId, patch })) as SiteRecord
  }, [])
  const unpublishSite = useCallback(async (siteId: string) => { await call(METHODS.SITES_UNPUBLISH || 'sites.unpublish', { siteId }) }, [])
  const addVisitor = useCallback(async (siteId: string, code: string, role = 'viewer') => {
    if (/^[0-9a-fA-F]{64}$/.test(code.trim())) {
      try {
        return (await call(METHODS.SITES_ADD_VISITOR || 'sites.addVisitor', { siteId, code: code.trim(), role })) as { publicKey: string }
      } catch {
        await call(METHODS.SITES_UPDATE_VISITOR_ROLE || 'sites.updateVisitorRole', { siteId, publicKey: code.trim(), role })
        return { publicKey: code.trim() }
      }
    }
    return (await call(METHODS.SITES_ADD_VISITOR || 'sites.addVisitor', { siteId, code, role })) as { publicKey: string }
  }, [])
  const updateVisitorRole = useCallback(async (siteId: string, publicKey: string, role: string) => {
    await call(METHODS.SITES_UPDATE_VISITOR_ROLE || 'sites.updateVisitorRole', { siteId, publicKey, role })
  }, [])
  const removeVisitor = useCallback(async (siteId: string, publicKey: string) => { await call(METHODS.SITES_REMOVE_VISITOR || 'sites.removeVisitor', { siteId, publicKey }) }, [])
  const visitSite = useCallback(async (code: string) => {
    try { return (await call(METHODS.SITES_VISIT || 'sites.visit', { code })) as ActiveVisit } catch (err) { toast.error('Visit Failed', (err as Error)?.message || String(err)); throw err }
  }, [toast])
  const leaveSite = useCallback(async (siteId?: string) => { await call(METHODS.SITES_LEAVE || 'sites.leave', { siteId }) }, [])
  const removeReceivedSite = useCallback(async (siteId: string) => { await call(METHODS.SITES_REMOVE_RECEIVED || 'sites.removeReceived', { siteId }); refresh() }, [refresh])
  const getGatewayUrl = useCallback(async () => { const res = (await call(METHODS.SITES_GET_URL || 'sites.getUrl', null)) as { url: string | null }; return res?.url || null }, [])
  const writeFile = useCallback(async (path: string, dataBase64: string, siteId?: string) => { await call(METHODS.SITES_WRITE_FILE || 'sites.writeFile', { path, dataBase64, siteId }) }, [])
  const mkdir = useCallback(async (path: string, siteId?: string) => { await call(METHODS.SITES_MKDIR || 'sites.mkdir', { path, siteId }) }, [])
  const deletePath = useCallback(async (path: string, siteId?: string) => { await call(METHODS.SITES_DELETE || 'sites.delete', { path, siteId }) }, [])
  const listFiles = useCallback(async (path: string, siteId?: string) => {
    // Explicit siteId path when given; fall back to the legacy single-visit call.
    const method = (METHODS as unknown as Record<string, string>).SITES_LIST_PATH || 'sites.listPath'
    const res = siteId
      ? await call(method, { siteId, path })
      : await call(METHODS.SITES_LIST_FILES || 'sites.listFiles', { path })
    return (res as unknown[]) || []
  }, [])
  const clearPendingVisitCode = useCallback(() => setPendingVisitCode(null), [])

  // Open (connect to) a received share by its code — multiple shares can be
  // open at once. `visitSite` is idempotent-ish: re-visiting an open share
  // rejects, so callers should only open shares that aren't already open.
  const openShare = useCallback(async (code: string) => {
    return visitSite(code)
  }, [visitSite])

  const closeShare = useCallback(async (siteId: string) => {
    try {
      await leaveSite(siteId)
    } catch (err) {
      toast.error('Close Failed', (err as Error)?.message || String(err))
    }
  }, [leaveSite, toast])

  const getSiteStats = useCallback(async (siteId: string) => {
    const method = (METHODS as unknown as Record<string, string>).SITES_GET_STATS || 'sites.getStats'
    return (await call(method, { siteId })) as SiteStats
  }, [])

  return (
    <SharedFoldersContext.Provider value={{ sites, active, received, loading, pendingVisitCode, clearPendingVisitCode, refresh, publishSite, updateSite, unpublishSite, addVisitor, updateVisitorRole, removeVisitor, visitSite, leaveSite, openShare, closeShare, getSiteStats, removeReceivedSite, getGatewayUrl, writeFile, mkdir, deletePath, listFiles }}>
      {children}
    </SharedFoldersContext.Provider>
  )
}

export function useSharedFolders() {
  const ctx = useContext(SharedFoldersContext)
  if (!ctx) throw new Error('useSharedFolders must be used within SharedFoldersProvider')
  return ctx
}
