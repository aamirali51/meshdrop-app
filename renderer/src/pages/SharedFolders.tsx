import { useEffect, useState, useCallback } from 'react'
import { Globe, FolderPlus, Plus, Copy, Trash2, KeyRound, UserPlus, Loader2, MonitorUp, FolderOpen, ArrowRight, LogOut, Eye, Pencil, Settings2, Search, Grid3X3, List, Play, FileText, X, Clock, Inbox, RefreshCw, Folder, ChevronRight, ChevronDown, HardDrive, Wifi, WifiOff } from 'lucide-react'
import { useSharedFolders, type SiteRecord, type ReceivedSite } from '@/hooks/useSharedFolders'
import { useDevices } from '@/hooks/useDevices'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Modal, ConfirmDialog } from '@/components/Modal'
import { FolderBrowser } from '@/components/FolderBrowser'
import { FilePreviewModal, type PreviewFile } from '@/components/FilePreviewModal'
import { cn } from '@/lib/utils'

type Tab = 'host' | 'visit'

type SiteEntry = { name: string; path: string; type: string; size?: number; mtimeMs?: number }

function allowlistEntries(s: SiteRecord | null): { key: string; role: string }[] {
  if (!s || !Array.isArray(s.allowlist)) return []
  return s.allowlist.map((e) => typeof e === 'string' ? { key: e, role: 'viewer' } : { key: (e as { key: string }).key, role: (e as { key: string; role: string }).role || 'viewer' })
}

export function SharedFolders() {
  const { sites, active, received, loading, publishSite, updateSite, unpublishSite, addVisitor, updateVisitorRole, removeVisitor, openShare, closeShare, removeReceivedSite, getGatewayUrl, listFiles, getSiteStats, refresh } = useSharedFolders()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('visit')
  const [publishOpen, setPublishOpen] = useState(false)
  const [addVisitorFor, setAddVisitorFor] = useState<SiteRecord | null>(null)
  const [visitorRole, setVisitorRole] = useState<'viewer' | 'editor'>('viewer')
  const [visitCode, setVisitCode] = useState('')
  const [visitOpen, setVisitOpen] = useState(false)
  const [confirmRemoveSite, setConfirmRemoveSite] = useState<SiteRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)
  // The share currently being browsed in the full file-manager view.
  const [browsing, setBrowsing] = useState<ReceivedSite | null>(null)
  const [browserPath, setBrowserPath] = useState('/')
  // In-app media preview (video/image/audio player).
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null)
  const [gatewayBase, setGatewayBase] = useState<string | null>(null)
  const activeSites: SiteRecord[] = Array.isArray(active?.activeSites) ? active.activeSites : (active?.hosting ? [active.hosting] : [])
  const openSiteIds = new Set((active?.visits || []).filter((v) => v.siteId).map((v) => v.siteId as string))

  // Lazily resolve the gateway base (token) once and cache it; per-share raw
  // URLs are built from it + siteId so each share's preview stays isolated.
  const ensureGatewayBase = useCallback(async () => {
    if (gatewayBase) return gatewayBase
    const url = await getGatewayUrl()
    if (url) setGatewayBase(url)
    return url
  }, [gatewayBase, getGatewayUrl])

  const buildRawUrl = useCallback((entryPath: string): string | null => {
    if (!gatewayBase || !browsing?.siteId) return null
    try {
      const base = new URL(gatewayBase)
      const t = base.searchParams.get('t') || ''
      const u = new URL('/raw', base)
      if (t) u.searchParams.set('t', t)
      u.searchParams.set('siteId', browsing.siteId)
      u.searchParams.set('path', entryPath)
      return u.toString()
    } catch { return null }
  }, [gatewayBase, browsing])

  const handlePreview = useCallback(async (entry: SiteEntry) => {
    await ensureGatewayBase()
    setPreviewFile({ name: entry.name, path: entry.path, type: 'file', size: entry.size, mtimeMs: entry.mtimeMs })
  }, [ensureGatewayBase])

  // When a new share arrives (site.invite_received) the provider refreshes; we
  // reload the received list on mount + whenever it grows
  useEffect(() => { refresh() }, [refresh])
  const handlePublish = async (folderPath: string, name: string, writeMode: string, spa: boolean, expirationPreset: string) => {
    setBusy(true)
    try { await publishSite({ folderPath, name: name || folderPath.split(/[\\/]/).filter(Boolean).pop() || 'My Drive', writeMode, spa, expirationPreset }); setPublishOpen(false); toast.success('Folder Shared', 'Live — allow your trusted devices to open it.') } catch (err) { toast.error('Share Failed', (err as Error)?.message || String(err)) } finally { setBusy(false) }
  }
  const handleAddVisitor = async (codeOrKey: string) => {
    if (!addVisitorFor) return
    setBusy(true)
    try {
      await addVisitor(addVisitorFor.siteId, codeOrKey, visitorRole)
      setAddVisitorFor(null)
      toast.success('Access Granted', `${visitorRole === 'editor' ? 'Editor' : 'Viewer'} — they'll get a notification`)
    } catch (err) { toast.error('Add Failed', (err as Error)?.message || String(err)) } finally { setBusy(false) }
  }
  const handleVisit = async () => {
    setBusy(true)
    try { await openShare(visitCode.trim().toUpperCase()); setVisitOpen(false); setVisitCode(''); setTab('visit'); toast.success('Folder Opened', 'Browsing inside MeshDrop') } catch (err) { toast.error('Could Not Open', (err as Error)?.message || 'Host may be offline') } finally { setBusy(false) }
  }
  const handleOpenReceived = async (site: ReceivedSite) => {
    setOpening(site.siteId)
    try {
      await openShare(site.code)
      toast.success('Folder Opened', `${site.name || site.code} is now browsable`)
    } catch (err) {
      toast.error('Could Not Open', (err as Error)?.message || 'Host may be offline — try again later')
    } finally { setOpening(null) }
  }
  const handleBrowse = async (site: ReceivedSite) => {
    // Ensure the share is connected before entering its file manager.
    if (!openSiteIds.has(site.siteId) && !site.code) return
    if (!openSiteIds.has(site.siteId)) {
      try { await openShare(site.code) } catch { return }
    }
    setBrowsing(site)
    setBrowserPath('/')
    // The gateway token rotates on visit start/stop; re-resolve per share.
    setGatewayBase(null)
  }
  const handleOpenInBrowser = async () => {
    try { const url = await getGatewayUrl(); if (!url) { toast.error('Not Ready', 'Open a shared folder first.'); return } if (window.bridge?.openExternal) window.bridge.openExternal(url); else window.open(url, '_blank') } catch { toast.error('Open Failed', 'Could not start gateway.') }
  }
  const openPath = (p: string) => { if (window.bridge?.openPath) window.bridge.openPath(p) }
  const navigateInBrowser = useCallback(async (p: string) => listFiles(p, browsing?.siteId), [listFiles, browsing?.siteId])
  const closeBrowse = () => setBrowsing(null)

  return (
    <div className='flex h-full flex-col'>
      <div className='mb-5 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-xl font-black tracking-tight text-foreground'>Shared Folders</h1>
          <p className='mt-0.5 text-xs text-muted-foreground'>Private folders, browsed in your browser over the mesh — no cloud, no open ports. {activeSites.length > 0 && <span className='font-bold text-primary'>{activeSites.length} live</span>}</p>
        </div>
        <div className='flex rounded-xl border border-hairline/10 bg-muted/30 p-0.5 text-xs font-bold'>
          <button onClick={() => setTab('host')} className={cn('rounded-lg px-3 py-1.5', tab === 'host' ? 'bg-primary text-white' : 'text-muted-foreground')}>Share</button>
          <button onClick={() => setTab('visit')} className={cn('rounded-lg px-3 py-1.5', tab === 'visit' ? 'bg-primary text-white' : 'text-muted-foreground')}>Browse</button>
        </div>
      </div>

      {loading ? <div className='flex flex-1 items-center justify-center text-muted-foreground'><Loader2 className='mr-2 h-4 w-4 animate-spin' /> Loading…</div>
        : tab === 'host' ? <HostView sites={sites} activeSites={activeSites} onPublish={() => setPublishOpen(true)} onUpdateSite={updateSite} onAddVisitor={(s) => setAddVisitorFor(s)} onUpdateRole={updateVisitorRole} onRemoveVisitor={(s, k) => removeVisitor(s.siteId, k)} onUnpublish={(s) => setConfirmRemoveSite(s)} onOpenFolder={(s) => openPath(s.folderPath)} />
          : browsing ? (
            <FolderBrowser
              share={browsing}
              connected={!!browsing.siteId && openSiteIds.has(browsing.siteId)}
              connecting={opening === browsing.siteId}
              initialPath={browserPath}
              onNavigatePath={navigateInBrowser}
              onPreview={handlePreview}
              onDownload={handlePreview}
              onBack={closeBrowse}
              onClose={(siteId) => { closeShare(siteId); closeBrowse() }}
            />
          ) : (
            <BrowseView received={received} openVisits={active?.visits || []} opening={opening} onOpen={handleOpenReceived} onRemove={removeReceivedSite} onManualVisit={() => setVisitOpen(true)} onEnterCode={(code) => { setVisitCode(code); setVisitOpen(true) }} onOpenInBrowser={handleOpenInBrowser} listPath={listFiles} onClose={closeShare} getSiteStats={getSiteStats} onBrowse={handleBrowse} />
          )}

      <FilePreviewModal
        open={!!previewFile}
        file={previewFile}
        rawUrl={buildRawUrl}
        onDownload={(f) => { const u = buildRawUrl(f.path); if (u) window.open(u.replace('/raw?', '/download?'), '_blank') }}
        onOpenExternal={(f) => { const u = buildRawUrl(f.path); if (u) { if (window.bridge?.openExternal) window.bridge.openExternal(u); else window.open(u, '_blank') } }}
        onClose={() => setPreviewFile(null)}
      />

      <Modal open={publishOpen} onOpenChange={setPublishOpen} title='Share a Folder' description='Pick a folder — allowed peers browse it in their browser. No cloud upload.'>
        <PublishForm busy={busy} onSubmit={handlePublish} onCancel={() => setPublishOpen(false)} />
      </Modal>
      <Modal open={!!addVisitorFor} onOpenChange={(o) => !o && setAddVisitorFor(null)} title='Allow a Visitor' description={addVisitorFor ? `Paste ${addVisitorFor.name}'s MD- code.` : ''}>
        {addVisitorFor && (
          <div className='space-y-3'>
            <div className='flex gap-1.5'>
              <button onClick={() => setVisitorRole('viewer')} className={cn('flex-1 rounded-lg border px-3 py-2 text-xs font-bold', visitorRole === 'viewer' ? 'border-primary bg-primary/10 text-primary' : 'border-border')}> <Eye className='mr-1 inline h-3 w-3' /> Viewer</button>
              <button onClick={() => setVisitorRole('editor')} className={cn('flex-1 rounded-lg border px-3 py-2 text-xs font-bold', visitorRole === 'editor' ? 'border-primary bg-primary/10 text-primary' : 'border-border')}> <Pencil className='mr-1 inline h-3 w-3' /> Editor</button>
            </div>
            <VisitorCodeForm busy={busy} onSubmit={handleAddVisitor} onCancel={() => setAddVisitorFor(null)} />
          </div>
        )}
      </Modal>
      <Modal open={visitOpen} onOpenChange={setVisitOpen} title='Visit a Shared Folder' description='Enter the SITE- code shared with you.'>
        <form onSubmit={(e) => { e.preventDefault(); if (visitCode.trim()) handleVisit() }} className='space-y-4'>
          <input value={visitCode} onChange={(e) => setVisitCode(e.target.value.toUpperCase())} placeholder='SITE-ABCD-EFGH' className='w-full rounded-xl border border-border bg-card px-4 py-2.5 text-center font-mono text-sm uppercase tracking-wider text-foreground placeholder:text-muted-foreground outline-none focus:border-primary' autoFocus />
          <div className='flex justify-end gap-2'>
            <Button type='button' variant='ghost' size='sm' onClick={() => setVisitOpen(false)}>Cancel</Button>
            <Button type='submit' size='sm' className='gap-1.5 font-bold' disabled={busy || !visitCode.trim()}>{busy ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <ArrowRight className='h-3.5 w-3.5' />} Connect</Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog open={!!confirmRemoveSite} onOpenChange={(o) => !o && setConfirmRemoveSite(null)} title='Unpublish this site?' description='Stops serving and invalidates its SITE- code.' confirmLabel='Unpublish' onConfirm={async () => { if (!confirmRemoveSite) return; await unpublishSite(confirmRemoveSite.siteId); setConfirmRemoveSite(null); toast.success('Unpublished', 'Site stopped.') }} />
    </div>
  )
}

function HostView({ sites, activeSites, onPublish, onUpdateSite, onAddVisitor, onUpdateRole, onRemoveVisitor, onUnpublish, onOpenFolder }: {
  sites: SiteRecord[]; activeSites: SiteRecord[]; onPublish: () => void; onUpdateSite: (id: string, patch: Record<string, unknown>) => Promise<unknown>; onAddVisitor: (s: SiteRecord) => void; onUpdateRole: (siteId: string, key: string, role: string) => Promise<void>; onRemoveVisitor: (s: SiteRecord, key: string) => void; onUnpublish: (s: SiteRecord) => void; onOpenFolder: (s: SiteRecord) => void
}) {
  const { toast } = useToast()
  const activeIds = new Set(activeSites.map((s) => s.siteId))
  if (sites.length === 0 && activeSites.length === 0) {
    return (
      <Card className='glass-card flex flex-1 flex-col items-center justify-center border-hairline/10 p-10 text-center'>
        <div className='mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary'><Globe className='h-7 w-7' /></div>
        <h3 className='text-base font-black'>Share a private folder</h3>
        <p className='mt-1 max-w-sm text-xs text-muted-foreground'>Pick a folder — allowed peers browse it right in their browser. No cloud copy, no open ports, host must stay online.</p>
        <p className='mt-2 text-[11px] text-muted-foreground'>How it's different from Sync: Sync copies everything locally and keeps it mirrored. Shared Folders stream — no local copy, browse-only unless you allow edits, expires when you say so.</p>
        <Button onClick={onPublish} className='mt-5 gap-2 font-bold'><FolderPlus className='h-4 w-4' /> Share a Folder</Button>
      </Card>
    )
  }
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
        {activeSites.map((site) => {
          const entries = allowlistEntries(site)
          return (
            <Card key={site.siteId} className='glass-card border-primary/30'>
              <CardContent className='p-5'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <MonitorUp className='h-4 w-4 text-meshdrop-cyan' />
                      <span className='text-sm font-black'>{site.name}</span>
                      <span className='rounded-full bg-meshdrop-cyan/15 px-2 py-0.5 font-mono text-[9px] font-extrabold uppercase text-meshdrop-cyan'>Live</span>
                      {site.spa && <span className='rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold text-primary'>SPA</span>}
                      {site.writeMode === 'collab' && <span className='rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-600'>Collab</span>}
                    </div>
                    <p className='mt-1 truncate font-mono text-[11px] text-muted-foreground'>{site.folderPath}</p>
                    <button onClick={() => { navigator.clipboard?.writeText(site.code); toast.success('Copied', site.code) }} className='mt-1 flex items-center gap-1 font-mono text-xs font-bold text-primary hover:underline'>{site.code} <Copy className='h-3 w-3' /></button>
                  </div>
                  <div className='flex flex-col gap-1.5'>
                    <Button variant='outline' size='sm' onClick={() => onOpenFolder(site)} className='gap-1'><FolderOpen className='h-3 w-3' /> Open</Button>
                    <Button variant='ghost' size='sm' onClick={() => onUnpublish(site)} className='text-destructive'><Trash2 className='h-3 w-3' /> Unpublish</Button>
                  </div>
                </div>
                <div className='mt-3 flex gap-1.5'>
                  <button onClick={() => onUpdateSite(site.siteId, { spa: !site.spa })} className={cn('rounded-lg border px-2.5 py-1 text-[11px] font-bold', site.spa ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>SPA {site.spa ? 'On' : 'Off'}</button>
                  <button onClick={() => onUpdateSite(site.siteId, { writeMode: site.writeMode === 'collab' ? 'read-only' : 'collab' })} className={cn('rounded-lg border px-2.5 py-1 text-[11px] font-bold flex items-center gap-1', site.writeMode === 'collab' ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-border')}><Settings2 className='h-3 w-3' /> {site.writeMode === 'collab' ? 'Collab' : 'Read-only'}</button>
                </div>
                <div className='mt-3 border-t border-hairline/10 pt-3'>
                  <div className='mb-2 flex items-center justify-between'>
                    <span className='text-[10px] font-black uppercase tracking-widest text-muted-foreground'>Allowed ({entries.length})</span>
                    <Button size='sm' variant='outline' onClick={() => onAddVisitor(site)} className='gap-1'><UserPlus className='h-3 w-3' /> Allow</Button>
                  </div>
                  {entries.length === 0 ? <p className='rounded-xl border border-dashed px-3 py-3 text-center text-xs text-muted-foreground'>No one yet — paste a visitor's MD- code.</p>
                    : <ul className='divide-y rounded-xl border'>
                      {entries.map((e) => (
                        <li key={e.key} className='flex items-center justify-between gap-2 px-3 py-2'>
                          <span className='flex items-center gap-1.5 font-mono text-xs'><KeyRound className='h-3 w-3 text-muted-foreground' /> {e.key.slice(0, 10)}…{e.key.slice(-4)} <span className={cn('ml-1 rounded px-1.5 py-0.5 text-[9px] font-bold', e.role === 'editor' ? 'bg-amber-500/15 text-amber-600' : 'bg-muted text-muted-foreground')}>{e.role}</span></span>
                          <span className='flex gap-1'>
                            <button onClick={() => onUpdateRole(site.siteId, e.key, e.role === 'editor' ? 'viewer' : 'editor')} className='text-xs text-primary hover:underline'>{e.role === 'editor' ? '→ viewer' : '→ editor'}</button>
                            <button onClick={() => onRemoveVisitor(site, e.key)} className='text-muted-foreground hover:text-destructive'><Trash2 className='h-3 w-3' /></button>
                          </span>
                        </li>
                      ))}
                    </ul>}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      {sites.filter((s) => !activeIds.has(s.siteId)).map((s) => (
        <Card key={s.siteId} className='glass-card border-hairline/10'>
          <CardContent className='flex items-center justify-between p-4'>
            <div className='min-w-0'><span className='text-sm font-bold'>{s.name}</span><span className='ml-2 font-mono text-xs text-muted-foreground'>{s.code}</span></div>
            <div className='flex gap-1'><Button variant='outline' size='sm' onClick={onPublish}><Plus className='h-3 w-3' /> Publish</Button><Button variant='ghost' size='sm' onClick={() => onUnpublish(s)} className='text-destructive'><Trash2 className='h-3 w-3' /></Button></div>
          </CardContent>
        </Card>
      ))}
      <Button onClick={onPublish} className='w-full gap-2 font-bold'><FolderPlus className='h-4 w-4' /> Share Another Folder</Button>
    </div>
  )
}

// Premium folder-card grid: every received share is a polished card showing
// who shared it, item count/size, last-updated time and connection status.
// "Open" enters that single share in the full FolderBrowser (per-share
// isolation — each share stays a separate resource with its own path state).
function BrowseView({ received, openVisits, opening, onOpen, onRemove, onManualVisit, onEnterCode, onOpenInBrowser, listPath, onClose, getSiteStats, onBrowse }: {
  received: ReceivedSite[]
  openVisits: { siteId: string | null; code: string | null; name: string | null }[]
  opening: string | null
  onOpen: (s: ReceivedSite) => void
  onRemove: (siteId: string) => void
  onManualVisit: () => void
  onEnterCode: (code: string) => void
  onOpenInBrowser: () => void
  listPath: (path: string, siteId?: string) => Promise<unknown[]>
  onClose: (siteId: string) => void
  getSiteStats: (siteId: string) => Promise<{ fileCount: number; dirCount: number; totalBytes: number; newestMtimeMs: number; partial?: boolean }>
  onBrowse: (s: ReceivedSite) => void
}) {
  const { toast } = useToast()
  const [code, setCode] = useState('')
  const openSiteIds = new Set(openVisits.filter((v) => v.siteId).map((v) => v.siteId as string))
  const visitedCodes = new Set(openVisits.filter((v) => v.code).map((v) => v.code as string))

  const handleRemove = (r: ReceivedSite) => {
    if (r.siteId && openSiteIds.has(r.siteId)) onClose(r.siteId)
    onRemove(r.siteId)
    toast.info('Removed', 'Share removed from your list')
  }

  return (
    <div className='flex h-full flex-col gap-3 overflow-y-auto'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-base font-black tracking-tight text-foreground'>Shared with you</h2>
          <p className='text-[11px] text-muted-foreground'>{received.length} folder{received.length === 1 ? '' : 's'} from your devices</p>
        </div>
        <div className='flex items-center gap-2'>
          <Button size='sm' variant='ghost' onClick={onOpenInBrowser} className='gap-1 text-xs'><Globe className='h-3 w-3' /> Open in Browser</Button>
          <Button size='sm' variant='outline' onClick={() => { onManualVisit(); setCode('') }} className='gap-1 text-xs'><KeyRound className='h-3 w-3' /> Enter SITE Code</Button>
        </div>
      </div>

      {received.length === 0 ? (
        <Card className='glass-card flex flex-1 flex-col items-center justify-center border-hairline/10 p-10 text-center'>
          <div className='mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary'><Inbox className='h-7 w-7' /></div>
          <h3 className='text-base font-black'>Nothing shared with you yet</h3>
          <p className='mt-1 max-w-sm text-xs text-muted-foreground'>When someone allows you on a folder, it appears here. Or enter a SITE- code someone gave you.</p>
          <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) { onEnterCode(code.trim().toUpperCase()); setCode('') } }} className='mt-5 flex w-full max-w-sm gap-2'>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder='SITE-ABCD-EFGH' className='flex-1 rounded-xl border border-border bg-card px-3 py-2 text-center font-mono text-sm uppercase tracking-wider text-foreground placeholder:text-muted-foreground outline-none focus:border-primary' />
            <Button type='submit' className='gap-1.5 font-bold'><ArrowRight className='h-3.5 w-3.5' /> Open</Button>
          </form>
        </Card>
      ) : (
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {received.map((r) => {
            const isOpen = !!(r.siteId && openSiteIds.has(r.siteId)) || visitedCodes.has(r.code)
            const isConnecting = opening === r.siteId
            return (
              <FolderCard
                key={r.siteId || r.code}
                share={r}
                isOpen={isOpen}
                connecting={isConnecting}
                onOpen={() => onOpen(r)}
                onBrowse={() => onBrowse(r)}
                onRemove={() => handleRemove(r)}
                getSiteStats={getSiteStats}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function fmtBytes(v: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let x = v
  let i = 0
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++ }
  return `${x.toFixed(x >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function FolderCard({ share, isOpen, connecting, onOpen, onBrowse, onRemove, getSiteStats }: {
  share: ReceivedSite
  isOpen: boolean
  connecting: boolean
  onOpen: () => void
  onBrowse: () => void
  onRemove: () => void
  getSiteStats: (siteId: string) => Promise<{ fileCount: number; dirCount: number; totalBytes: number; newestMtimeMs: number; partial?: boolean }>
}) {
  const [stats, setStats] = useState<{ fileCount: number; dirCount: number; totalBytes: number; newestMtimeMs: number; partial?: boolean } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Fetch live stats once the share is open/connected (host computes cheaply).
  useEffect(() => {
    let alive = true
    if (isOpen && share.siteId && !stats) {
      setStatsLoading(true)
      getSiteStats(share.siteId)
        .then((s) => { if (alive) setStats(s) })
        .catch(() => { if (alive) setStats({ fileCount: 0, dirCount: 0, totalBytes: 0, newestMtimeMs: 0 }) })
        .finally(() => { if (alive) setStatsLoading(false) })
    }
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, share.siteId])

  const fileCount = stats?.fileCount
  const totalBytes = stats?.totalBytes ?? 0
  const newestMtime = stats?.newestMtimeMs

  const sourceName = share.hostName || share.hostPeerId?.slice(0, 8) || 'Unknown device'

  return (
    <Card className='glass-card group overflow-hidden border-border/60 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg'>
      <CardContent className='p-0'>
        {/* Header band */}
        <div className='flex items-start justify-between gap-2 bg-gradient-to-br from-primary/10 via-transparent to-transparent p-4 pb-3'>
          <div className='flex min-w-0 items-center gap-3'>
            <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-sm transition-colors', isOpen ? 'border-primary/30 bg-primary/15 text-primary' : 'border-border bg-muted/40 text-muted-foreground')}>
              {connecting ? <Loader2 className='h-5 w-5 animate-spin' /> : isOpen ? <Wifi className='h-5 w-5' /> : <HardDrive className='h-5 w-5' />}
            </div>
            <div className='min-w-0'>
              <h3 className='truncate text-sm font-black text-foreground' title={share.name || share.code}>{share.name || 'Shared folder'}</h3>
              <p className='mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground'>
                <span>Shared by</span>
                <span className='max-w-[140px] truncate font-semibold text-foreground/80'>{sourceName}</span>
              </p>
            </div>
          </div>
          <button onClick={onRemove} className='rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100' title='Remove share'>
            <Trash2 className='h-4 w-4' />
          </button>
        </div>

        {/* Body: meta */}
        <div className='space-y-2 px-4 pb-3'>
          <div className='flex items-center gap-2 text-[11px] text-muted-foreground'>
            {statsLoading ? (
              <span className='flex items-center gap-1'><Loader2 className='h-3 w-3 animate-spin' /> Reading folder…</span>
            ) : fileCount != null ? (
              <>
                <span className='font-semibold text-foreground/90'>{fileCount} file{fileCount === 1 ? '' : 's'}</span>
                <span className='text-muted-foreground/40'>·</span>
                <span>{totalBytes > 0 ? fmtBytes(totalBytes) : '—'}</span>
                {stats?.partial && <span className='rounded bg-muted/40 px-1 py-px text-[9px]'>(partial)</span>}
              </>
            ) : (
              <span>Folder details available once connected</span>
            )}
            {newestMtime ? (
              <>
                <span className='text-muted-foreground/40'>·</span>
                <span>Updated {new Date(newestMtime).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
              </>
            ) : null}
          </div>

          {/* Connection status */}
          <div className='flex items-center gap-1.5 text-[11px]'>
            {connecting ? (
              <span className='flex items-center gap-1.5 font-medium text-amber-500'><Loader2 className='h-3 w-3 animate-spin' /> Connecting…</span>
            ) : isOpen ? (
              <span className='flex items-center gap-1.5 font-medium text-emerald-500'><Wifi className='h-3 w-3' /> Connected</span>
            ) : (
              <span className='flex items-center gap-1.5 font-medium text-muted-foreground'><WifiOff className='h-3 w-3' /> Not open</span>
            )}
            <span className='ml-auto truncate font-mono text-[10px] text-muted-foreground/70'>{share.code}</span>
          </div>
        </div>

        {/* Footer actions */}
        <div className='flex items-center gap-2 border-t border-border/40 px-4 py-2.5'>
          <Button size='sm' className='flex-1 gap-1.5 font-bold' disabled={connecting} onClick={onBrowse}>
            {connecting ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <FolderOpen className='h-3.5 w-3.5' />}
            Open
          </Button>
          {isOpen && share.siteId && (
            <Button size='sm' variant='ghost' onClick={() => onClose(share.siteId as string)} className='gap-1 text-muted-foreground'>
              <LogOut className='h-3.5 w-3.5' /> Close
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function PublishForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (folderPath: string, name: string, writeMode: string, spa: boolean, expirationPreset: string) => void; onCancel: () => void }) {
  const [folderPath, setFolderPath] = useState('')
  const [name, setName] = useState('')
  const [writeMode, setWriteMode] = useState<'read-only' | 'collab'>('read-only')
  const [spa, setSpa] = useState(false)
  const [expirationPreset, setExpirationPreset] = useState<string>(() => localStorage.getItem('meshdrop:sites_expiry') || 'never')
  const { toast } = useToast()
  const pickFolder = async () => {
    if (!window.bridge?.openFolderDialog) { toast.error('Unavailable', 'Desktop only'); return }
    try { const picked = await window.bridge.openFolderDialog(); if (picked) { setFolderPath(picked); if (!name) setName(picked.split(/[\\/]/).filter(Boolean).pop() || 'My Drive') } } catch { toast.error('Pick Failed', 'Could not open picker.') }
  }
  useEffect(() => { localStorage.setItem('meshdrop:sites_expiry', expirationPreset) }, [expirationPreset])
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (folderPath.trim()) onSubmit(folderPath.trim(), name.trim(), writeMode, spa, expirationPreset) }} className='space-y-4'>
      <button type='button' onClick={pickFolder} className='flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary'><FolderOpen className='h-4 w-4' />{folderPath || 'Choose folder…'}</button>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder='Share name (e.g. Project Photos)' className='w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary' />
      <p className='text-[11px] text-muted-foreground'>Tip: pick the folder that <em>contains</em> index.html — or any folder of files/photos. Visitors see a clean browser view.</p>
      <div className='flex flex-wrap gap-1.5'>
        {(['never','30m','1h','6h','24h','7d'] as const).map((p) => (
          <button key={p} type='button' onClick={() => setExpirationPreset(p)} className={cn('rounded-lg border px-2.5 py-1 text-[11px] font-bold', expirationPreset === p ? 'border-primary bg-primary/10 text-primary' : 'border-border')}><Clock className='mr-1 inline h-3 w-3' />{p === 'never' ? 'Never' : p}</button>
        ))}
      </div>
      <div className='flex gap-2'>
        <button type='button' onClick={() => setWriteMode('read-only')} className={cn('flex-1 rounded-xl border px-3 py-2 text-xs font-bold', writeMode === 'read-only' ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>View only</button>
        <button type='button' onClick={() => setWriteMode('collab')} className={cn('flex-1 rounded-xl border px-3 py-2 text-xs font-bold', writeMode === 'collab' ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-border')}>Allow edits (collab)</button>
      </div>
      <label className='flex items-center gap-2 text-xs'><input type='checkbox' checked={spa} onChange={(e) => setSpa(e.target.checked)} /> Single-page app (unknown routes → index.html)</label>
      <div className='flex justify-end gap-2'><Button type='button' variant='ghost' size='sm' onClick={onCancel}>Cancel</Button><Button type='submit' size='sm' className='gap-1.5 font-bold' disabled={busy || !folderPath.trim()}>{busy ? <Loader2 className='h-3 w-3 animate-spin' /> : <Globe className='h-3 w-3' />} Share</Button></div>
    </form>
  )
}

function VisitorCodeForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (code: string) => void; onCancel: () => void }) {
  const [code, setCode] = useState('')
  const { devices } = useDevices()
  const { toast } = useToast()
  const trusted = devices.filter((d) => d.isTrusted)
  const online = devices.filter((d) => d.isOnline && !d.isTrusted)
  const handleDeviceAdd = async (d: typeof trusted[number]) => {
    // One-tap for trusted peers: we already have their publicKey — no code needed
    // But Sites v1 requires MD- code verification; so for trusted we add directly by key
    // Fallback: ask user to paste code if we don't have their pairing code
    if (d.publicKey) {
      onSubmit(d.publicKey) // handled as direct key when length===64
    } else {
      toast.info('Need Code', `Ask ${d.name} for their MD- code from My Devices`)
    }
  }
  return (
    <div className='space-y-3'>
      {trusted.length > 0 && (
        <div className='space-y-1.5'>
          <p className='text-[11px] font-bold uppercase tracking-widest text-primary'>✓ Trusted devices — one tap to share</p>
          <div className='grid gap-1.5 max-h-36 overflow-auto pr-1'>
            {trusted.map((d) => (
              <button key={d.id} type='button' onClick={() => handleDeviceAdd(d)} className='flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-left hover:bg-primary/10'>
                <span className='flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white'>{d.name.slice(0, 1)}</span>
                <span className='text-xs font-bold'>{d.name}</span><span className='ml-auto text-[10px] text-primary font-bold'>Tap to allow →</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {online.length > 0 && (
        <div className='space-y-1.5'>
          <p className='text-[11px] font-bold uppercase tracking-widest text-muted-foreground'>Online (not yet trusted)</p>
          <div className='grid gap-1.5 max-h-28 overflow-auto pr-1'>
            {online.map((d) => (
              <button key={d.id} type='button' onClick={() => handleDeviceAdd(d)} className='flex items-center gap-2 rounded-xl border bg-card/40 px-3 py-2 text-left hover:bg-accent'>
                <span className='flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-black'>{d.name.slice(0, 1)}</span>
                <span className='text-xs font-bold'>{d.name}</span><span className='ml-auto text-[10px] text-muted-foreground'>Online</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className='relative flex items-center gap-2 text-[10px] text-muted-foreground'><span className='h-px flex-1 bg-border' /> or paste MD- code <span className='h-px flex-1 bg-border' /></div>
      <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) onSubmit(code.trim().toUpperCase()) }} className='space-y-3'>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder='MD-ABCD-EFGH-JKLM-NPQR' className='w-full rounded-xl border border-border bg-card px-4 py-2.5 text-center font-mono text-sm uppercase tracking-wider text-foreground placeholder:text-muted-foreground outline-none focus:border-primary' />
        <div className='flex justify-end gap-2'><Button type='button' variant='ghost' size='sm' onClick={onCancel}>Cancel</Button><Button type='submit' size='sm' className='gap-1.5 font-bold' disabled={busy || !code.trim()}>{busy ? <Loader2 className='h-3 w-3 animate-spin' /> : <UserPlus className='h-3 w-3' />} Allow</Button></div>
      </form>
    </div>
  )
}
