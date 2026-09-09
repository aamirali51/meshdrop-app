import { useEffect, useState, useCallback } from 'react'
import {
  Globe,
  FolderPlus,
  Copy,
  Trash2,
  KeyRound,
  UserPlus,
  Loader2,
  MonitorUp,
  FolderOpen,
  ArrowRight,
  LogOut,
  Eye,
  Pencil,
  Settings2,
  X,
  Clock,
  Inbox,
  Folder,
  HardDrive,
  Wifi,
  WifiOff,
  ExternalLink,
  Check,
  Sparkles,
  ShieldCheck,
  Users,
  Plus,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { useSharedFolders, type SiteRecord, type ReceivedSite } from '@/hooks/useSharedFolders'
import { useDevices } from '@/hooks/useDevices'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/ui/primitives/Button'
import { Card, CardContent } from '@/ui/primitives/Card'
import { EmptyState } from '@/ui/primitives/EmptyState'
import { FileIcon } from '@/ui/primitives/FileIcon'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/ui/primitives/Sheet'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/ui/primitives/Tooltip'
import { Switch } from '@/components/ui/switch'
import { Modal, ConfirmDialog } from '@/components/Modal'
import { FolderBrowser, type SiteEntry } from '@/components/FolderBrowser'
import { FilePreviewModal, type PreviewFile } from '@/components/FilePreviewModal'
import { cn } from '@/lib/utils'
import { isWeb, openExternal as capOpenExternal, openPath as capOpenPath, pickFolder as capPickFolder } from '@/lib/capabilities'

// ── helpers ───────────────────────────────────────────────────────────────
type ShelfTab = 'byMe' | 'withMe'

function allowlistEntries(s: SiteRecord | null): { key: string; role: string }[] {
  if (!s || !Array.isArray(s.allowlist)) return []
  return s.allowlist.map((e) => (typeof e === 'string' ? { key: e, role: 'viewer' } : { key: (e as { key: string }).key, role: (e as { key: string; role: string }).role || 'viewer' }))
}

function fmtBytes(v: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let x = v
  let i = 0
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++ }
  return `${x.toFixed(x >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function shortKey(k: string) { return k.length <= 14 ? k : `${k.slice(0, 10)}…${k.slice(-4)}` }

// ── main page ────────────────────────────────────────────────────────────
export function SharedFolders() {
  const { sites, active, received, loading, publishSite, updateSite, unpublishSite, addVisitor, updateVisitorRole, removeVisitor, openShare, closeShare, removeReceivedSite, getGatewayUrl, listFiles, getSiteStats, writeFile, mkdir, deletePath, refresh } = useSharedFolders()
  const { toast } = useToast()
  const [tab, setTab] = useState<ShelfTab>('byMe')
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishedCode, setPublishedCode] = useState<string | null>(null)
  const [addVisitorFor, setAddVisitorFor] = useState<SiteRecord | null>(null)
  const [visitorRole, setVisitorRole] = useState<'viewer' | 'editor'>('viewer')
  const [visitCode, setVisitCode] = useState('')
  const [visitOpen, setVisitOpen] = useState(false)
  const [confirmRemoveSite, setConfirmRemoveSite] = useState<SiteRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState<ReceivedSite | null>(null)
  const [browserPath, setBrowserPath] = useState('/')
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null)
  const [gatewayBase, setGatewayBase] = useState<string | null>(null)

  const activeSites: SiteRecord[] = Array.isArray(active?.activeSites) ? active.activeSites : active?.hosting ? [active.hosting] : []
  const openSiteIds = new Set((active?.visits || []).filter((v) => v.siteId).map((v) => v.siteId as string))

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
    setPreviewFile({ name: entry.name ?? entry.path.split(/[\/]/).pop() ?? entry.path, path: entry.path, type: 'file', size: entry.size, mtimeMs: entry.mtimeMs })
  }, [ensureGatewayBase])

  useEffect(() => { refresh() }, [refresh])

  const handlePublish = async (folderPath: string, name: string, writeMode: string, spa: boolean, expirationPreset: string) => {
    setBusy(true)
    try {
      const rec = await publishSite({ folderPath, name: name || folderPath.split(/[\\/]/).filter(Boolean).pop() || 'My Drive', writeMode, spa, expirationPreset })
      const code = (rec as SiteRecord)?.code || ''
      if (code) setPublishedCode(code)
      toast.success('Folder Shared', code ? `${code} — share it with trusted peers` : 'Live — allow your trusted devices to open it.')
      // keep sheet open to show minted code
    } catch (err) { toast.error('Share Failed', (err as Error)?.message || String(err)) } finally { setBusy(false) }
  }

  const handleAddVisitor = async (codeOrKey: string) => {
    if (!addVisitorFor) return
    setBusy(true)
    try {
      await addVisitor(addVisitorFor.siteId, codeOrKey, visitorRole)
      setAddVisitorFor(null)
      toast.success('Access Granted', `${visitorRole === 'editor' ? 'Editor' : 'Viewer'} — they\'ll get a notification`)
    } catch (err) { toast.error('Add Failed', (err as Error)?.message || String(err)) } finally { setBusy(false) }
  }

  const handleVisit = async () => {
    setBusy(true)
    try { await openShare(visitCode.trim().toUpperCase()); setVisitOpen(false); setVisitCode(''); setTab('withMe'); toast.success('Folder Opened', 'Browsing inside MeshDrop') } catch (err) { toast.error('Could Not Open', (err as Error)?.message || 'Host may be offline') } finally { setBusy(false) }
  }

  const handleOpenReceived = async (site: ReceivedSite) => {
    setOpening(site.siteId)
    try { await openShare(site.code); toast.success('Folder Opened', `${site.name || site.code} is now browsable`) } catch (err) { toast.error('Could Not Open', (err as Error)?.message || 'Host may be offline — try again later') } finally { setOpening(null) }
  }

  const handleBrowse = async (site: ReceivedSite) => {
    if (!openSiteIds.has(site.siteId) && !site.code) return
    if (!openSiteIds.has(site.siteId)) { try { await openShare(site.code) } catch { return } }
    setBrowsing(site); setBrowserPath('/'); setGatewayBase(null)
  }

  const handleOpenInBrowser = async () => {
    try { const url = await getGatewayUrl(); if (!url) { toast.error('Not Ready', 'Open a shared folder first.'); return } capOpenExternal(url) } catch { toast.error('Open Failed', 'Could not start gateway.') }
  }

  const openPathLocal = (p: string) => {
    if (isWeb) { toast.info('Desktop Only', 'Open the folder in the MeshDrop desktop app to reveal it here.'); return }
    capOpenPath(p)
  }

  const navigateInBrowser = useCallback(async (p: string) => listFiles(p, browsing?.siteId), [listFiles, browsing?.siteId])
  const closeBrowse = () => setBrowsing(null)

  // segmented toggle
  return (
    <TooltipProvider>
    <div className='flex h-full flex-col pb-8'>
      <div className='mb-5 flex flex-wrap items-center justify-between gap-3'>
        <div className='min-w-0'>
          <h1 className='text-xl font-black tracking-tight text-foreground flex items-center gap-2'><FolderKanbanIcon />Shared Folders</h1>
          <p className='mt-0.5 text-xs text-muted-foreground'>Private folders, browsed in your browser over the mesh — no cloud, no open ports. {activeSites.length > 0 && <span className='font-bold text-primary'>{activeSites.length} live</span>}</p>
        </div>
        <div className='flex items-center gap-2'>
          <div className='flex rounded-full border border-border/50 bg-muted/40 p-1 text-xs font-bold'>
            <button onClick={() => setTab('byMe')} className={cn('rounded-full px-4 py-1.5 transition-colors', tab === 'byMe' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}>Shared by me</button>
            <button onClick={() => setTab('withMe')} className={cn('rounded-full px-4 py-1.5 transition-colors', tab === 'withMe' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}>Shared with me</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className='flex flex-1 items-center justify-center text-muted-foreground'><Loader2 className='mr-2 h-4 w-4 animate-spin' /> Loading…</div>
      ) : browsing ? (
        <FolderBrowser
          share={browsing}
          connected={!!browsing.siteId && openSiteIds.has(browsing.siteId)}
          connecting={opening === browsing.siteId}
          initialPath={browserPath}
          canWrite={true}
          onNavigatePath={navigateInBrowser}
          onPreview={handlePreview}
          onDownload={handlePreview}
          onMkdir={(p) => mkdir(p, browsing.siteId)}
          onWriteFile={(p, b64) => writeFile(p, b64, browsing.siteId)}
          onDeletePath={(p) => deletePath(p, browsing.siteId)}
          onBack={closeBrowse}
          onClose={(siteId) => { closeShare(siteId); closeBrowse() }}
        />
      ) : tab === 'byMe' ? (
        <ByMeView
          sites={sites}
          activeSites={activeSites}
          onPublish={() => { setPublishedCode(null); setPublishOpen(true) }}
          onUpdateSite={updateSite}
          onAddVisitor={(s) => setAddVisitorFor(s)}
          onUpdateRole={updateVisitorRole}
          onRemoveVisitor={(s, k) => removeVisitor(s.siteId, k)}
          onUnpublish={(s) => setConfirmRemoveSite(s)}
          onOpenFolder={(s) => openPathLocal(s.folderPath)}
          getGatewayUrl={getGatewayUrl}
          getSiteStats={getSiteStats}
          onOpenInBrowser={handleOpenInBrowser}
        />
      ) : (
        <WithMeView
          received={received}
          openVisits={active?.visits || []}
          opening={opening}
          onOpen={handleOpenReceived}
          onRemove={removeReceivedSite}
          onManualVisit={() => setVisitOpen(true)}
          onEnterCode={(code) => { setVisitCode(code); setVisitOpen(true) }}
          onOpenInBrowser={handleOpenInBrowser}
          onClose={closeShare}
          getSiteStats={getSiteStats}
          onBrowse={handleBrowse}
        />
      )}

      <FilePreviewModal
        open={!!previewFile}
        file={previewFile}
        rawUrl={buildRawUrl}
        onDownload={(f) => { const u = buildRawUrl(f.path); if (u) window.open(u.replace('/raw?', '/download?'), '_blank') }}
        onOpenExternal={(f) => { const u = buildRawUrl(f.path); if (u) capOpenExternal(u) }}
        onClose={() => setPreviewFile(null)}
      />

      {/* Publish Sheet — F36 capabilities-aware picker, writeMode, SPA toggle, expiry chips */}
      <Sheet open={publishOpen} onOpenChange={(o) => { setPublishOpen(o); if (!o) setPublishedCode(null) }}>
        <SheetContent side='bottom' className='max-h-[88vh] overflow-y-auto'>
          <SheetHeader>
            <SheetTitle className='flex items-center gap-2'><FolderPlus className='h-4 w-4 text-primary' />Publish a folder</SheetTitle>
            <SheetDescription>Pick a folder — allowed peers browse it in their browser. No cloud upload. {isWeb && <span className='text-primary'>(In-browser: in-app picker walks the host drives — no OS dialog)</span>}</SheetDescription>
          </SheetHeader>
          {publishedCode ? (
            <div className='space-y-4 pt-2'>
              <div className='rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center'>
                <p className='text-[11px] font-bold uppercase tracking-widest text-primary flex items-center justify-center gap-1'><Sparkles className='h-3.5 w-3.5' />SITE- code — share this</p>
                <p className='mt-2 font-mono text-2xl font-black tracking-widest text-primary break-all'>{publishedCode}</p>
                <div className='mt-3 flex justify-center gap-2'>
                  <Button size='sm' className='gap-1.5 font-bold' onClick={async () => { await navigator.clipboard.writeText(publishedCode); toast.success('Copied', publishedCode) }}><Copy className='h-3.5 w-3.5' />Copy code</Button>
                  <Button size='sm' variant='outline' onClick={() => setPublishOpen(false)}>Done</Button>
                </div>
                <p className='mt-2 text-[11px] text-muted-foreground'>Anyone with this code still needs to be on your allowlist — add them from the card.</p>
              </div>
              <Button variant='ghost' className='w-full gap-2' onClick={() => setPublishedCode(null)}><Plus className='h-4 w-4' />Publish another folder</Button>
            </div>
          ) : (
            <PublishForm busy={busy} onSubmit={handlePublish} onCancel={() => setPublishOpen(false)} />
          )}
        </SheetContent>
      </Sheet>

      {/* Visitor Sheet */}
      <Sheet open={!!addVisitorFor} onOpenChange={(o) => !o && setAddVisitorFor(null)}>
        <SheetContent side='right' className='flex flex-col'>
          <SheetHeader>
            <SheetTitle>Allow a visitor</SheetTitle>
            <SheetDescription>{addVisitorFor ? `Paste ${addVisitorFor.name}\'s MD- code or pick a trusted device.` : ''}</SheetDescription>
          </SheetHeader>
          {addVisitorFor && (
            <div className='space-y-3 pt-2 flex-1 overflow-y-auto'>
              <div className='flex gap-1.5'>
                <button onClick={() => setVisitorRole('viewer')} className={cn('flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold flex items-center justify-center gap-1', visitorRole === 'viewer' ? 'border-primary bg-primary/10 text-primary' : 'border-border')}> <Eye className='h-3 w-3' /> Viewer</button>
                <button onClick={() => setVisitorRole('editor')} className={cn('flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold flex items-center justify-center gap-1', visitorRole === 'editor' ? 'border-primary bg-primary/10 text-primary' : 'border-border')}> <Pencil className='h-3 w-3' /> Editor</button>
              </div>
              <VisitorCodeForm busy={busy} onSubmit={handleAddVisitor} onCancel={() => setAddVisitorFor(null)} />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Modal open={visitOpen} onOpenChange={setVisitOpen} title='Visit a Shared Folder' description='Enter the SITE- code shared with you.'>
        <form onSubmit={(e) => { e.preventDefault(); if (visitCode.trim()) handleVisit() }} className='space-y-4'>
          <input value={visitCode} onChange={(e) => setVisitCode(e.target.value.toUpperCase())} placeholder='SITE-ABCD-EFGH' className='w-full rounded-xl border border-border bg-card px-4 py-3 text-center font-mono text-sm uppercase tracking-wider text-foreground placeholder:text-muted-foreground outline-none focus:border-primary' autoFocus />
          <div className='flex justify-end gap-2'>
            <Button type='button' variant='ghost' size='sm' onClick={() => setVisitOpen(false)}>Cancel</Button>
            <Button type='submit' size='sm' className='gap-1.5 font-bold' disabled={busy || !visitCode.trim()}>{busy ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <ArrowRight className='h-3.5 w-3.5' />} Connect</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!confirmRemoveSite} onOpenChange={(o) => !o && setConfirmRemoveSite(null)} title='Unpublish this site?' description='Stops serving and invalidates its SITE- code. Visitors will lose access immediately.' confirmLabel='Unpublish' onConfirm={async () => { if (!confirmRemoveSite) return; await unpublishSite(confirmRemoveSite.siteId); setConfirmRemoveSite(null); toast.success('Unpublished', 'Site stopped.') }} />
    </div>
    </TooltipProvider>
  )
}

function FolderKanbanIcon(){ return <span className='inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20'><Folder className='h-4 w-4' /></span> }

// ── By Me — shelf grid ──────────────────────────────────────────────────
function ByMeView({ sites, activeSites, onPublish, onUpdateSite, onAddVisitor, onUpdateRole, onRemoveVisitor, onUnpublish, onOpenFolder, getGatewayUrl, getSiteStats, onOpenInBrowser }: {
  sites: SiteRecord[]; activeSites: SiteRecord[]; onPublish: () => void; onUpdateSite: (id: string, patch: Record<string, unknown>) => Promise<unknown>; onAddVisitor: (s: SiteRecord) => void; onUpdateRole: (siteId: string, key: string, role: string) => Promise<void>; onRemoveVisitor: (s: SiteRecord, key: string) => void; onUnpublish: (s: SiteRecord) => void; onOpenFolder: (s: SiteRecord) => void; getGatewayUrl: () => Promise<string | null>; getSiteStats: (siteId: string) => Promise<{ fileCount: number; dirCount: number; totalBytes: number; newestMtimeMs: number; partial?: boolean }>; onOpenInBrowser: () => void
}) {
  const activeIds = new Set(activeSites.map((s) => s.siteId))
  const allShelved = [...activeSites, ...sites.filter((s) => !activeIds.has(s.siteId))]
  if (allShelved.length === 0) {
    return (
      <EmptyState
        icon={<Globe className='h-6 w-6' />}
        title='No published folders yet'
        description='Publish a folder to share it over the mesh — no cloud.'
        action={<Button onClick={onPublish} className='gap-2 font-bold'><FolderPlus className='h-4 w-4' /> Publish a folder</Button>}
        className='flex-1 border-hairline/10 py-16'
      />
    )
  }
  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-xs text-muted-foreground'><span className='font-bold text-foreground'>{activeSites.length}</span> live · <span className='font-bold text-foreground'>{sites.length}</span> total on this device</p>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' className='gap-1.5' onClick={onOpenInBrowser}><ExternalLink className='h-3.5 w-3.5' />Open in Browser</Button>
          <Button size='sm' className='gap-1.5 font-bold' onClick={onPublish}><FolderPlus className='h-3.5 w-3.5' />Publish a folder</Button>
        </div>
      </div>
      <div className='grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4'>
        {allShelved.map((site) => {
          const isLive = activeIds.has(site.siteId)
          return <ByMeCard key={site.siteId} site={site} isLive={isLive} onPublish={onPublish} onUpdateSite={onUpdateSite} onAddVisitor={onAddVisitor} onUpdateRole={onUpdateRole} onRemoveVisitor={onRemoveVisitor} onUnpublish={onUnpublish} onOpenFolder={onOpenFolder} getGatewayUrl={getGatewayUrl} getSiteStats={getSiteStats} />
        })}
      </div>
    </div>
  )
}

function ByMeCard({ site, isLive, onPublish, onUpdateSite, onAddVisitor, onUpdateRole, onRemoveVisitor, onUnpublish, onOpenFolder, getGatewayUrl, getSiteStats }: {
  site: SiteRecord; isLive: boolean; onPublish: () => void; onUpdateSite: (id: string, patch: Record<string, unknown>) => Promise<unknown>; onAddVisitor: (s: SiteRecord) => void; onUpdateRole: (siteId: string, key: string, role: string) => Promise<void>; onRemoveVisitor: (s: SiteRecord, key: string) => void; onUnpublish: (s: SiteRecord) => void; onOpenFolder: (s: SiteRecord) => void; getGatewayUrl: () => Promise<string | null>; getSiteStats: (siteId: string) => Promise<{ fileCount: number; dirCount: number; totalBytes: number; newestMtimeMs: number; partial?: boolean }>
}) {
  const { toast } = useToast()
  const entries = allowlistEntries(site)
  const [expanded, setExpanded] = useState(false)
  const [stats, setStats] = useState<{ fileCount: number; dirCount: number; totalBytes: number; newestMtimeMs: number; partial?: boolean } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  useEffect(() => {
    let alive = true
    if (isLive && !stats && !statsLoading) {
      setStatsLoading(true)
      getSiteStats(site.siteId).then((s) => { if (alive) setStats(s) }).catch(() => { if (alive) setStats({ fileCount: 0, dirCount: 0, totalBytes: 0, newestMtimeMs: 0 }) }).finally(() => { if (alive) setStatsLoading(false) })
    }
    return () => { alive = false }
  }, [isLive, site.siteId]) // eslint-disable-line

  const copyCode = async () => { try { await navigator.clipboard.writeText(site.code); toast.success('Copied', site.code) } catch { toast.error('Copy failed', site.code) } }
  const openBrowserForSite = async () => {
    try { const url = await getGatewayUrl(); if (!url) { toast.error('Not Ready', 'Open a shared folder first.'); return } capOpenExternal(url) } catch { toast.error('Open Failed', 'Could not start gateway.') }
  }

  return (
    <Card className={cn('overflow-hidden transition-all hover:shadow-md flex flex-col', isLive ? 'border-primary/25 hover:border-primary/40' : 'border-border/50')}>
      <CardContent className='p-0 flex flex-col flex-1'>
        {/* header tile */}
        <div className='flex gap-3 p-4 pb-3'>
          <FileIcon filename={site.name} isFolder size='lg' className={cn('h-12 w-12 rounded-xl border shadow-sm shrink-0', isLive ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted/40 border-border text-muted-foreground')} />
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-1.5 flex-wrap'>
              <Tooltip>
                <TooltipTrigger asChild><span className='truncate text-sm font-black text-foreground max-w-[14ch] cursor-default' title={site.name}>{site.name}</span></TooltipTrigger>
                <TooltipContent>{site.name}</TooltipContent>
              </Tooltip>
              {isLive ? <span className='rounded-full bg-emerald-500/15 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-emerald-600'>Live</span> : <span className='rounded-full bg-muted border border-border px-2 py-0.5 text-[9px] font-bold text-muted-foreground'>Idle</span>}
              {site.spa && <span className='rounded-full bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary'>SPA</span>}
              {site.writeMode === 'collab' && <span className='rounded-full bg-amber-500/15 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-600'>Collab</span>}
            </div>
            <Tooltip>
              <TooltipTrigger asChild><p className='mt-0.5 truncate font-mono text-[11px] text-muted-foreground cursor-default' title={site.folderPath}>{site.folderPath}</p></TooltipTrigger>
              <TooltipContent side='bottom' className='max-w-xs break-all font-mono text-xs'>{site.folderPath}</TooltipContent>
            </Tooltip>
            <button onClick={copyCode} className='mt-1 inline-flex items-center gap-1 font-mono text-xs font-bold text-primary hover:underline'>{site.code} <Copy className='h-3 w-3' /></button>
          </div>
          <button onClick={() => onUnpublish(site)} className='self-start rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive' title='Unpublish'><Trash2 className='h-4 w-4' /></button>
        </div>

        {/* stats row */}
        <div className='px-4 pb-2 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap'>
          {statsLoading ? <span className='flex items-center gap-1'><Loader2 className='h-3 w-3 animate-spin' />Reading…</span>
            : stats ? <><span className='font-semibold text-foreground'>{stats.fileCount} files</span><span className='text-muted-foreground/40'>·</span><span>{stats.dirCount} folders</span><span className='text-muted-foreground/40'>·</span><span>{fmtBytes(stats.totalBytes)}</span></>
            : <span>{entries.length} visitor{entries.length === 1 ? '' : 's'}</span>}
          <span className='ml-auto inline-flex items-center gap-1'><Users className='h-3 w-3' />{entries.length}</span>
        </div>

        {/* visitor avatars + roles */}
        <div className='px-4 pb-2'>
          <div className='flex items-center gap-1.5 flex-wrap'>
            {entries.length === 0 ? <span className='text-xs text-muted-foreground italic'>No visitors yet</span>
              : entries.slice(0, 6).map((e) => (
                <span key={e.key} className='inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-[11px] font-mono' title={`${e.key} — ${e.role}`}>
                  <span className='flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary'>{e.key.slice(0, 1).toUpperCase()}</span>
                  <span className='max-w-[10ch] truncate'>{shortKey(e.key)}</span>
                  <span className={cn('rounded px-1 py-0.5 text-[9px] font-bold uppercase', e.role === 'editor' ? 'bg-amber-500/15 text-amber-600' : 'bg-muted text-muted-foreground')}>{e.role}</span>
                </span>
              ))}
            {entries.length > 6 && <span className='text-xs font-bold text-muted-foreground'>+{entries.length - 6}</span>}
          </div>
        </div>

        {/* expandable visitor management */}
        <div className='mx-4 mb-3 rounded-xl border border-border/40 bg-muted/20 overflow-hidden'>
          <button onClick={() => setExpanded((v) => !v)} className='flex w-full items-center justify-between px-3 py-2 text-xs font-bold text-foreground hover:bg-muted/40'>
            <span className='flex items-center gap-1.5'><ShieldCheck className='h-3.5 w-3.5 text-primary' />Visitors · {entries.length} {entries.length ? `· ${entries.filter((e) => e.role === 'editor').length} editors` : ''}</span>
            {expanded ? <ChevronUp className='h-3.5 w-3.5 text-muted-foreground' /> : <ChevronDown className='h-3.5 w-3.5 text-muted-foreground' />}
          </button>
          {expanded && (
            <div className='border-t border-border/40 bg-card px-3 py-3 space-y-3'>
              <div className='flex flex-wrap gap-1.5'>
                <button onClick={() => onUpdateSite(site.siteId, { spa: !site.spa })} className={cn('rounded-full border px-3 py-1 text-[11px] font-bold', site.spa ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>SPA {site.spa ? 'On' : 'Off'}</button>
                <button onClick={() => onUpdateSite(site.siteId, { writeMode: site.writeMode === 'collab' ? 'read-only' : 'collab' })} className={cn('rounded-full border px-3 py-1 text-[11px] font-bold flex items-center gap-1', site.writeMode === 'collab' ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-border')}><Settings2 className='h-3 w-3' /> {site.writeMode === 'collab' ? 'Collab — visitors can edit' : 'Read-only'}</button>
              </div>
              <Button size='sm' variant='outline' className='w-full gap-1' onClick={() => onAddVisitor(site)}><UserPlus className='h-3.5 w-3.5' />Add visitor</Button>
              {entries.length === 0 ? (
                <p className='rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground'>No one yet — paste a visitor&apos;s MD- code.</p>
              ) : (
                <ul className='divide-y rounded-xl border overflow-hidden'>
                  {entries.map((e) => (
                    <li key={e.key} className='flex items-center justify-between gap-2 px-3 py-2 bg-card'>
                      <span className='flex items-center gap-1.5 font-mono text-xs min-w-0'><KeyRound className='h-3 w-3 text-muted-foreground shrink-0' /><span className='truncate'>{shortKey(e.key)}</span><span className={cn('ml-1 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold', e.role === 'editor' ? 'bg-amber-500/15 text-amber-600' : 'bg-muted text-muted-foreground')}>{e.role}</span></span>
                      <span className='flex gap-1 shrink-0'>
                        <button onClick={() => onUpdateRole(site.siteId, e.key, e.role === 'editor' ? 'viewer' : 'editor')} className='rounded px-2 py-1 text-xs font-bold text-primary hover:bg-primary/10'>{e.role === 'editor' ? '→ viewer' : '→ editor'}</button>
                        <button onClick={() => onRemoveVisitor(site, e.key)} className='rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10'><Trash2 className='h-3 w-3' /></button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* footer actions */}
        <div className='mt-auto flex items-center gap-1.5 border-t border-border/40 px-3 py-2.5 bg-muted/10'>
          <Button size='sm' variant='outline' className='gap-1.5 flex-1' onClick={() => onOpenFolder(site)}><FolderOpen className='h-3.5 w-3.5' />Open folder</Button>
          <Button size='sm' variant='ghost' className='gap-1' onClick={openBrowserForSite}><Globe className='h-3.5 w-3.5' />Browser</Button>
          {!isLive && <Button size='sm' className='gap-1' onClick={onPublish}><MonitorUp className='h-3.5 w-3.5' />Publish</Button>}
        </div>
      </CardContent>
    </Card>
  )
}

// ── With Me — received cards + enter-code ───────────────────────────────
function WithMeView({ received, openVisits, opening, onOpen, onRemove, onManualVisit, onEnterCode, onOpenInBrowser, onClose, getSiteStats, onBrowse }: {
  received: ReceivedSite[]; openVisits: { siteId: string | null; code: string | null; name: string | null }[]; opening: string | null; onOpen: (s: ReceivedSite) => void; onRemove: (siteId: string) => void; onManualVisit: () => void; onEnterCode: (code: string) => void; onOpenInBrowser: () => void; onClose: (siteId: string) => void; getSiteStats: (siteId: string) => Promise<{ fileCount: number; dirCount: number; totalBytes: number; newestMtimeMs: number; partial?: boolean }>; onBrowse: (s: ReceivedSite) => void
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
    <div className='flex flex-col gap-4'>
      {/* Have a code? */}
      <Card className='border-border/50'>
        <CardContent className='p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between'>
          <div>
            <h3 className='text-sm font-black flex items-center gap-1.5'><KeyRound className='h-4 w-4 text-primary' />Have a code?</h3>
            <p className='text-xs text-muted-foreground'>Enter a SITE- code someone shared with you — it visits over the mesh.</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) { onEnterCode(code.trim().toUpperCase()); setCode('') } }} className='flex gap-2 w-full sm:w-auto'>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder='SITE-ABCD-EFGH' className='flex-1 sm:w-56 rounded-xl border border-border bg-card px-3 py-2.5 text-center font-mono text-sm uppercase tracking-wider text-foreground placeholder:text-muted-foreground outline-none focus:border-primary' />
            <Button type='submit' className='gap-1.5 font-bold shrink-0'><ArrowRight className='h-3.5 w-3.5' />Visit</Button>
          </form>
        </CardContent>
      </Card>

      <div className='flex items-center justify-between'>
        <h2 className='text-sm font-black text-foreground flex items-center gap-2'>Shared with you <span className='rounded-full bg-muted border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground'>{received.length}</span></h2>
        <div className='flex gap-1.5'>
          <Button size='sm' variant='ghost' onClick={onOpenInBrowser} className='gap-1 text-xs'><Globe className='h-3 w-3' />Open in Browser</Button>
          <Button size='sm' variant='outline' onClick={onManualVisit} className='gap-1 text-xs'><KeyRound className='h-3 w-3' />Enter SITE Code</Button>
        </div>
      </div>

      {received.length === 0 ? (
        <EmptyState
          icon={<Inbox className='h-6 w-6' />}
          title='Nothing shared with you yet'
          description='Nothing shared with you yet — enter a SITE- code.'
          action={
            <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) { onEnterCode(code.trim().toUpperCase()); setCode('') } }} className='flex gap-2'>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder='SITE-ABCD-EFGH' className='w-56 rounded-xl border border-border bg-card px-3 py-2.5 text-center font-mono text-sm uppercase tracking-wider text-foreground placeholder:text-muted-foreground outline-none focus:border-primary' />
              <Button type='submit' className='gap-1.5 font-bold'><ArrowRight className='h-3.5 w-3.5' />Open</Button>
            </form>
          }
          className='border-hairline/10 py-12'
        />
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
          {received.map((r) => {
            const isOpen = !!(r.siteId && openSiteIds.has(r.siteId)) || visitedCodes.has(r.code)
            const isConnecting = opening === r.siteId
            return <ReceivedCard key={r.siteId || r.code} share={r} isOpen={isOpen} connecting={isConnecting} onOpen={() => onOpen(r)} onBrowse={() => onBrowse(r)} onRemove={() => handleRemove(r)} getSiteStats={getSiteStats} onClose={onClose} />
          })}
        </div>
      )}
    </div>
  )
}

function ReceivedCard({ share, isOpen, connecting, onOpen, onBrowse, onRemove, getSiteStats, onClose }: {
  share: ReceivedSite; isOpen: boolean; connecting: boolean; onOpen: () => void; onBrowse: () => void; onRemove: () => void; getSiteStats: (siteId: string) => Promise<{ fileCount: number; dirCount: number; totalBytes: number; newestMtimeMs: number; partial?: boolean }>; onClose: (siteId: string) => void
}) {
  const [stats, setStats] = useState<{ fileCount: number; dirCount: number; totalBytes: number; newestMtimeMs: number; partial?: boolean } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  useEffect(() => {
    let alive = true
    if (isOpen && share.siteId && !stats) {
      setStatsLoading(true)
      getSiteStats(share.siteId).then((s) => { if (alive) setStats(s) }).catch(() => { if (alive) setStats({ fileCount: 0, dirCount: 0, totalBytes: 0, newestMtimeMs: 0 }) }).finally(() => { if (alive) setStatsLoading(false) })
    }
    return () => { alive = false }
  }, [isOpen, share.siteId]) // eslint-disable-line
  const fileCount = stats?.fileCount
  const totalBytes = stats?.totalBytes ?? 0
  const newestMtime = stats?.newestMtimeMs
  const sourceName = share.hostName || share.hostPeerId?.slice(0, 8) || 'Unknown device'
  return (
    <Card className='group overflow-hidden border-border/50 transition-all hover:shadow-md flex flex-col'>
      <CardContent className='p-0 flex flex-col flex-1'>
        <div className='flex items-start justify-between gap-2 bg-gradient-to-br from-primary/10 via-transparent to-transparent p-4 pb-3'>
          <div className='flex min-w-0 items-center gap-3'>
            <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-sm', isOpen ? 'border-primary/30 bg-primary/15 text-primary' : 'border-border bg-muted/40 text-muted-foreground')}>
              {connecting ? <Loader2 className='h-5 w-5 animate-spin' /> : isOpen ? <Wifi className='h-5 w-5' /> : <HardDrive className='h-5 w-5' />}
            </div>
            <div className='min-w-0'>
              <Tooltip><TooltipTrigger asChild><h3 className='truncate text-sm font-black text-foreground max-w-[16ch] cursor-default' title={share.name || share.code}>{share.name || 'Shared folder'}</h3></TooltipTrigger><TooltipContent>{share.name || share.code}</TooltipContent></Tooltip>
              <p className='mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground'><span>Shared by</span><span className='max-w-[14ch] truncate font-semibold text-foreground/80' title={sourceName}>{sourceName}</span></p>
            </div>
          </div>
          <button onClick={onRemove} className='rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100' title='Remove share'><Trash2 className='h-4 w-4' /></button>
        </div>
        <div className='space-y-2 px-4 pb-3 flex-1'>
          <div className='flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap'>
            {statsLoading ? <span className='flex items-center gap-1'><Loader2 className='h-3 w-3 animate-spin' />Reading folder…</span>
              : fileCount != null ? <><span className='font-semibold text-foreground/90'>{fileCount} file{fileCount === 1 ? '' : 's'}</span><span className='text-muted-foreground/40'>·</span><span>{totalBytes > 0 ? fmtBytes(totalBytes) : '—'}</span></>
              : <span>Folder details available once connected</span>}
            {newestMtime ? <><span className='text-muted-foreground/40'>·</span><span>Updated {new Date(newestMtime).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span></> : null}
          </div>
          <div className='flex items-center gap-1.5 text-[11px]'>
            {connecting ? <span className='flex items-center gap-1.5 font-medium text-amber-500'><Loader2 className='h-3 w-3 animate-spin' />Connecting…</span>
              : isOpen ? <span className='flex items-center gap-1.5 font-medium text-emerald-500'><Wifi className='h-3 w-3' />Connected</span>
              : <span className='flex items-center gap-1.5 font-medium text-muted-foreground'><WifiOff className='h-3 w-3' />Not open</span>}
            <span className='ml-auto truncate font-mono text-[10px] text-muted-foreground/70'>{share.code}</span>
          </div>
        </div>
        <div className='flex items-center gap-2 border-t border-border/40 px-4 py-2.5 mt-auto'>
          <Button size='sm' className='flex-1 gap-1.5 font-bold' disabled={connecting} onClick={onBrowse}>{connecting ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <FolderOpen className='h-3.5 w-3.5' />}Browse</Button>
          {!isOpen ? <Button size='sm' variant='outline' className='gap-1' onClick={onOpen}><Wifi className='h-3.5 w-3.5' />Connect</Button>
            : share.siteId ? <Button size='sm' variant='ghost' onClick={() => onClose(share.siteId as string)} className='gap-1 text-muted-foreground'><LogOut className='h-3.5 w-3.5' />Close</Button> : null}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Publish Form (Sheet body) — F36 picker, F30 toast preserved ──────────
function PublishForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (folderPath: string, name: string, writeMode: string, spa: boolean, expirationPreset: string) => void; onCancel: () => void }) {
  const [folderPath, setFolderPath] = useState('')
  const [name, setName] = useState('')
  const [writeMode, setWriteMode] = useState<'read-only' | 'collab'>('read-only')
  const [spa, setSpa] = useState(false)
  const [expirationPreset, setExpirationPreset] = useState<string>(() => localStorage.getItem('meshdrop:sites_expiry') || 'never')
  const { toast } = useToast()
  const pickFolder = async () => {
    try { const picked = await capPickFolder(); if (picked) { setFolderPath(picked); if (!name) setName(picked.split(/[\\/]/).filter(Boolean).pop() || 'My Drive') } } catch { toast.error('Pick Failed', 'Could not open picker.') }
  }
  useEffect(() => { localStorage.setItem('meshdrop:sites_expiry', expirationPreset) }, [expirationPreset])
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (folderPath.trim()) onSubmit(folderPath.trim(), name.trim(), writeMode, spa, expirationPreset) }} className='space-y-4 pt-2'>
      <button type='button' onClick={pickFolder} className='flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors'><FolderOpen className='h-4 w-4' />{folderPath ? <span className='font-mono text-foreground break-all' title={folderPath}>{folderPath}</span> : 'Choose folder…'}</button>
      <div className='space-y-1.5'>
        <label className='text-xs font-bold text-foreground'>Share name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder='Share name (e.g. Project Photos)' className='w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary' />
        <p className='text-[11px] text-muted-foreground'>Tip: pick the folder that <em>contains</em> index.html — or any folder of files. Visitors see a clean browser view.</p>
      </div>
      <div>
        <p className='text-xs font-bold text-foreground mb-1.5'>Expires</p>
        <div className='flex flex-wrap gap-1.5'>
          {(['never', '30m', '1h', '6h', '24h', '7d'] as const).map((p) => (
            <button key={p} type='button' onClick={() => setExpirationPreset(p)} className={cn('rounded-full border px-3 py-1.5 text-xs font-bold', expirationPreset === p ? 'border-primary bg-primary text-white' : 'border-border hover:bg-muted') }><Clock className='mr-1 inline h-3 w-3' />{p === 'never' ? 'Never' : p}</button>
          ))}
        </div>
      </div>
      <div>
        <p className='text-xs font-bold text-foreground mb-1.5'>Access</p>
        <div className='flex gap-2'>
          <button type='button' onClick={() => setWriteMode('read-only')} className={cn('flex-1 rounded-xl border px-3 py-3 text-xs font-bold flex flex-col items-center gap-1', writeMode === 'read-only' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/50')}><Eye className='h-4 w-4' />View only<span className='text-[10px] font-normal text-muted-foreground'>Browse + download</span></button>
          <button type='button' onClick={() => setWriteMode('collab')} className={cn('flex-1 rounded-xl border px-3 py-3 text-xs font-bold flex flex-col items-center gap-1', writeMode === 'collab' ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-border hover:bg-muted/50')}><Pencil className='h-4 w-4' />Allow edits<span className='text-[10px] font-normal text-muted-foreground'>Collaboration</span></button>
        </div>
      </div>
      <label className='flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3 cursor-pointer'>
        <span className='text-xs font-bold text-foreground flex items-center gap-2'><Globe className='h-3.5 w-3.5 text-primary' />Single-page app<span className='font-normal text-muted-foreground hidden sm:inline'>— unknown routes → index.html</span></span>
        <Switch checked={spa} onCheckedChange={setSpa} />
      </label>
      <div className='flex justify-end gap-2 pt-2'><Button type='button' variant='ghost' size='sm' onClick={onCancel}>Cancel</Button><Button type='submit' size='sm' className='gap-1.5 font-bold' disabled={busy || !folderPath.trim()}>{busy ? <Loader2 className='h-3 w-3 animate-spin' /> : <Globe className='h-3 w-3' />} Share</Button></div>
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
    if (d.publicKey) onSubmit(d.publicKey)
    else toast.info('Need Code', `Ask ${d.name} for their MD- code from My Devices`)
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
