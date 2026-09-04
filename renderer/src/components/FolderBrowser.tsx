import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowUp,
  Download,
  ExternalLink,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Grid3X3,
  HardDrive,
  Image as ImageIcon,
  List,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { cn } from '@/lib/utils'
import type { ReceivedSite } from '@/hooks/useSharedFolders'

export type SiteEntry = {
  name?: string
  path: string
  type: 'dir' | 'file'
  size?: number
  mtimeMs?: number
}

type NamedEntry = { name: string; path: string; type: 'dir' | 'file'; size?: number; mtimeMs?: number }

type SortKey = 'name' | 'size' | 'mtime'
type ViewMode = 'grid' | 'list'
type FileKind = 'image' | 'video' | 'audio' | 'archive' | 'code' | 'doc' | 'sheet' | 'file'

function extOf(name?: string | null): string {
  if (!name || typeof name !== 'string') return ''
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

function fileKind(name?: string | null): FileKind {
  const ext = extOf(name)
  if (/^(png|jpe?g|gif|webp|avif|bmp|svg|ico|heic|tiff?)$/.test(ext)) return 'image'
  if (/^(mp4|mkv|webm|mov|avi|m4v|ts|mts|flv|wmv|mpg|mpeg|3gp)$/.test(ext)) return 'video'
  if (/^(mp3|wav|ogg|flac|aac|m4a|opus|wma)$/.test(ext)) return 'audio'
  if (/^(zip|rar|7z|tar|gz|bz2|xz|zst|iso)$/.test(ext)) return 'archive'
  if (/^(js|ts|jsx|tsx|json|html|htm|css|scss|py|rb|go|rs|java|c|cpp|h|sh|yml|yaml|xml|toml|md)$/.test(ext)) return 'code'
  if (/^(doc|docx|odt|rtf|pages)$/.test(ext)) return 'doc'
  if (/^(xls|xlsx|csv|ods|numbers)$/.test(ext)) return 'sheet'
  if (/^(pdf|txt|epub)$/.test(ext)) return 'doc'
  return 'file'
}

function fmtSize(bytes?: number): string {
  if (bytes == null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function fmtDate(ms?: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

function FileTypeIcon({ name, className }: { name: string; className?: string }) {
  const kind = fileKind(name)
  const Icon =
    kind === 'image' ? ImageIcon
      : kind === 'video' ? FileVideo
        : kind === 'audio' ? FileAudio
          : kind === 'archive' ? FileArchive
            : kind === 'code' ? FileCode
              : kind === 'doc' ? FileText
                : kind === 'sheet' ? FileSpreadsheet
                  : File
  return <Icon className={className} />
}

function FileTypeColor({ name }: { name: string }): string {
  switch (fileKind(name)) {
    case 'image': return 'text-violet-400'
    case 'video': return 'text-rose-400'
    case 'audio': return 'text-amber-400'
    case 'archive': return 'text-orange-400'
    case 'code': return 'text-sky-400'
    case 'doc': return 'text-blue-400'
    case 'sheet': return 'text-emerald-400'
    default: return 'text-muted-foreground'
  }
}

interface FolderBrowserProps {
  share: ReceivedSite
  connected: boolean
  connecting: boolean
  initialPath?: string
  onNavigatePath: (path: string) => Promise<unknown[]>
  onDownload?: (entry: SiteEntry) => void
  onOpenExternal?: (entry: SiteEntry) => void
  /** Called when the user clicks a previewable file (image/video/audio). */
  onPreview?: (entry: SiteEntry) => void
  onBack: () => void
  onClose: (siteId: string) => void
}

export function FolderBrowser({
  share,
  connected,
  connecting,
  initialPath = '/',
  onNavigatePath,
  onDownload,
  onOpenExternal,
  onPreview,
  onBack,
  onClose
}: FolderBrowserProps) {
  const [path, setPath] = useState(initialPath)
  const [entries, setEntries] = useState<SiteEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const [filterKind, setFilterKind] = useState<FileKind | 'all'>('all')
  const [menu, setMenu] = useState<{ x: number; y: number; entry: SiteEntry } | null>(null)
  const loadSeq = useRef(0)

  const load = useCallback(async (p: string) => {
    const seq = ++loadSeq.current
    setLoading(true)
    setError(null)
    try {
      const res = (await onNavigatePath(p)) as SiteEntry[]
      if (seq !== loadSeq.current) return // a newer navigation superseded us
      setEntries(res || [])
      setPath(p)
    } catch (err) {
      if (seq !== loadSeq.current) return
      setError((err as Error)?.message || 'Could not load folder')
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [onNavigatePath])

  // Load the initial folder on mount (or when the share changes).
  const initial = initialPath
  useEffect(() => {
    load(initial || '/')
    return () => { loadSeq.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share.siteId])

  const navigate = useCallback((p: string) => load(p), [load])

  const dirs = useMemo<NamedEntry[]>(() => (entries || []).filter((e): e is NamedEntry => !!e && e.type === 'dir' && typeof e.name === 'string'), [entries])
  const rawFiles = useMemo<NamedEntry[]>(() => (entries || []).filter((e): e is NamedEntry => !!e && e.type === 'file' && typeof e.name === 'string'), [entries])

  const files = useMemo(() => {
    let list = rawFiles
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((f) => f.name.toLowerCase().includes(q))
    }
    if (filterKind !== 'all') {
      list = list.filter((f) => fileKind(f.name) === filterKind)
    }
    const dir = sortDir
    const key = sortKey
    return [...list].sort((a, b) => {
      let cmp = 0
      if (key === 'size') cmp = (a.size || 0) - (b.size || 0)
      else if (key === 'mtime') cmp = (a.mtimeMs || 0) - (b.mtimeMs || 0)
      else cmp = a.name.localeCompare(b.name)
      return cmp * dir
    })
  }, [rawFiles, search, filterKind, sortKey, sortDir])

  const crumbs = path.split('/').filter(Boolean)

  const cycleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1))
    else {
      setSortKey(key)
      setSortDir(1)
    }
  }

  const openContextMenu = (e: React.MouseEvent, entry: SiteEntry) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, entry })
  }

  const openFile = useCallback((entry: NamedEntry) => {
    if (entry.type === 'file' && (onPreview && (fileKind(entry.name) === 'image' || fileKind(entry.name) === 'video' || fileKind(entry.name) === 'audio'))) {
      onPreview(entry)
      return
    }
    onDownload?.(entry)
  }, [onPreview, onDownload])

  const menuItems: ContextMenuItem[] = useMemo(() => {
    if (!menu) return []
    const items: ContextMenuItem[] = []
    if (menu.entry.type === 'dir') {
      items.push({
        label: 'Open',
        icon: <Folder className='h-3.5 w-3.5' />,
        onClick: () => navigate(menu.entry.path)
      })
    } else {
      items.push({
        label: fileKind(menu.entry.name) === 'image' || fileKind(menu.entry.name) === 'video' || fileKind(menu.entry.name) === 'audio' ? 'Preview' : 'Open',
        icon: <FileText className='h-3.5 w-3.5' />,
        onClick: () => openFile(menu.entry)
      })
      if (onDownload) {
        items.push({ label: 'Download', icon: <Download className='h-3.5 w-3.5' />, onClick: () => onDownload(menu.entry) })
      }
      if (onOpenExternal) {
        items.push({ label: 'Open in browser', icon: <ExternalLink className='h-3.5 w-3.5' />, onClick: () => onOpenExternal(menu.entry) })
      }
    }
    items.push({ separator: true })
    items.push({ label: 'Refresh', icon: <RefreshCw className='h-3.5 w-3.5' />, onClick: () => load(path) })
    return items
  }, [menu, navigate, path, load, onDownload, onOpenExternal, openFile])

  const statusLine =
    dirs.length > 0
      ? `${dirs.length} folder${dirs.length === 1 ? '' : 's'} · ${rawFiles.length} file${rawFiles.length === 1 ? '' : 's'}`
      : `${rawFiles.length} file${rawFiles.length === 1 ? '' : 's'}`

  const renderGridItem = (entry: NamedEntry) => (
    <div
      key={entry.path}
      onContextMenu={(e) => openContextMenu(e, entry)}
      onDoubleClick={() => entry.type === 'dir' ? navigate(entry.path) : openFile(entry)}
      className='group cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-card/50 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md'
    >
      <div className={cn('relative flex aspect-[4/3] items-center justify-center bg-muted/10', entry.type === 'dir' ? 'bg-primary/5' : '')}>
        {entry.type === 'dir' ? (
          <Folder className='h-10 w-10 text-primary/80' />
        ) : (
          <FileTypeIcon name={entry.name} className={cn('h-10 w-10', FileTypeColor(entry.name))} />
        )}
        {entry.type === 'file' && (
          <button
            onClick={(e) => { e.stopPropagation(); onDownload?.(entry) }}
            className='absolute right-1.5 top-1.5 rounded-full bg-background/80 p-1.5 opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-background group-hover:opacity-100'
            title='Download'
          >
            <Download className='h-3.5 w-3.5 text-foreground' />
          </button>
        )}
      </div>
      <div className='px-2.5 py-2'>
        <p className='truncate text-xs font-bold text-foreground' title={entry.name}>{entry.name}</p>
        <p className='mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground'>
          <span>{entry.type === 'dir' ? 'Folder' : fmtSize(entry.size)}</span>
          <span>{fmtDate(entry.mtimeMs)}</span>
        </p>
      </div>
    </div>
  )

  const renderListItem = (entry: NamedEntry) => (
    <div
      key={entry.path}
      onContextMenu={(e) => openContextMenu(e, entry)}
      onDoubleClick={() => entry.type === 'dir' ? navigate(entry.path) : openFile(entry)}
      className='group flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-border/60 hover:bg-accent/40'
    >
      {entry.type === 'dir'
        ? <Folder className='h-5 w-5 shrink-0 text-primary/80' />
        : <FileTypeIcon name={entry.name} className={cn('h-5 w-5 shrink-0', FileTypeColor(entry.name))} />}
      <span className='min-w-0 flex-1 truncate text-xs font-semibold text-foreground'>{entry.name}</span>
      <span className='w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground'>{entry.type === 'file' ? fmtSize(entry.size) : '—'}</span>
      <span className='hidden w-24 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:block'>{fmtDate(entry.mtimeMs)}</span>
      {entry.type === 'file' && (
        <button
          onClick={(e) => { e.stopPropagation(); onDownload?.(entry) }}
          className='rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100'
          title='Download'
        >
          <Download className='h-3.5 w-3.5' />
        </button>
      )}
    </div>
  )

  return (
    <div className='flex h-full flex-col gap-3 overflow-hidden animate-fade-in'>
      {/* Toolbar: back + breadcrumb | search / view / sort */}
      <div className='flex flex-wrap items-center gap-2'>
        <div className='flex min-w-0 items-center gap-1.5'>
          <Button size='sm' variant='ghost' onClick={onBack} className='shrink-0 gap-1 px-2 text-muted-foreground' title='Back to all folders'>
            <ArrowLeft className='h-4 w-4' />
          </Button>
          {/* Breadcrumb */}
          <div className='flex min-w-0 items-center gap-0.5 overflow-x-auto text-xs text-muted-foreground'>
            <button onClick={() => navigate('/')} className={cn('shrink-0 font-bold hover:text-foreground', path === '/' ? 'text-primary' : 'text-muted-foreground')}>
              {share.name || 'Folder'}
            </button>
            {crumbs.map((c, i) => {
              const p = '/' + crumbs.slice(0, i + 1).join('/')
              const isLast = i === crumbs.length - 1
              return (
                <span key={p} className='flex shrink-0 items-center gap-0.5'>
                  <span className='text-muted-foreground/40'>/</span>
                  <button onClick={() => !isLast && navigate(p)} className={cn('max-w-[140px] truncate', isLast ? 'font-bold text-foreground' : 'hover:text-foreground')}>{c}</button>
                </span>
              )
            })}
          </div>
        </div>

        <div className='ml-auto flex items-center gap-1.5'>
          {/* Search */}
          <div className='relative'>
            <Search className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search'
              className='w-40 rounded-lg border border-border/60 bg-card/50 py-1.5 pl-8 pr-7 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:w-52 focus:border-primary'
            />
            {search && (
              <button onClick={() => setSearch('')} className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'>
                <X className='h-3 w-3' />
              </button>
            )}
          </div>

          {/* View toggle */}
          <div className='flex overflow-hidden rounded-lg border border-border/60'>
            <button onClick={() => setViewMode('grid')} className={cn('p-1.5', viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent')} title='Grid view'>
              <Grid3X3 className='h-3.5 w-3.5' />
            </button>
            <button onClick={() => setViewMode('list')} className={cn('p-1.5', viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent')} title='List view'>
              <List className='h-3.5 w-3.5' />
            </button>
          </div>

          <Button size='sm' variant='outline' className='gap-1 text-xs' onClick={() => load(path)} title='Refresh'>
            <RefreshCw className='h-3.5 w-3.5' />
          </Button>
        </div>
      </div>

      {/* Secondary row: status + sort/filter */}
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-[11px] font-medium text-muted-foreground'>
          {loading ? 'Loading…' : statusLine}
        </span>
        {!connected && (
          <span className='flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500'>
            {connecting ? <Loader2 className='h-3 w-3 animate-spin' /> : <HardDrive className='h-3 w-3' />} {connecting ? 'Connecting…' : 'Offline — reconnecting'}
          </span>
        )}
        <div className='ml-auto flex items-center gap-1'>
          {/* Sort */}
          <div className='flex items-center gap-0.5 rounded-lg border border-border/50 p-0.5'>
            {([['name', 'Name'], ['size', 'Size'], ['mtime', 'Modified']] as [SortKey, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => cycleSort(k)}
                className={cn('rounded-md px-2 py-1 text-[10px] font-semibold', sortKey === k ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent')}
              >
                {label}{sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
              </button>
            ))}
          </div>
          {/* Kind filter */}
          <div className='relative flex items-center'>
            <SlidersHorizontal className='absolute left-2 h-3 w-3 text-muted-foreground' />
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as FileKind | 'all')}
              className='appearance-none rounded-lg border border-border/50 bg-card/50 py-1 pl-7 pr-6 text-[11px] font-medium text-foreground outline-none focus:border-primary'
            >
              <option value='all'>All files</option>
              <option value='image'>Images</option>
              <option value='video'>Videos</option>
              <option value='audio'>Audio</option>
              <option value='archive'>Archives</option>
              <option value='code'>Code</option>
              <option value='doc'>Documents</option>
              <option value='sheet'>Spreadsheets</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto'>
        {error ? (
          <div className='flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-10 text-center'>
            <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive'><File className='h-6 w-6' /></div>
            <div>
              <p className='text-sm font-bold text-foreground'>Could not load this folder</p>
              <p className='mt-1 text-xs text-muted-foreground'>{error}</p>
            </div>
            <div className='flex gap-2'>
              <Button size='sm' onClick={() => load(path)}><RefreshCw className='mr-1 h-3 w-3' /> Retry</Button>
              <Button size='sm' variant='ghost' onClick={onBack}><ArrowLeft className='mr-1 h-3 w-3' /> Back</Button>
            </div>
          </div>
        ) : loading && !entries ? (
          <div className='flex h-full items-center justify-center gap-2 text-sm text-muted-foreground'>
            <Loader2 className='h-5 w-5 animate-spin text-primary' /> Opening folder…
          </div>
        ) : entries && entries.length === 0 ? (
          <div className='flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-10 text-center'>
            <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary'><Folder className='h-6 w-6' /></div>
            <p className='text-sm font-bold text-foreground'>This folder is empty</p>
            <p className='text-xs text-muted-foreground'>Nothing has been shared here yet.</p>
          </div>
        ) : (
          <>
            {path !== '/' && (
              <button
                onClick={() => navigate(path.split('/').slice(0, -1).join('/') || '/')}
                className='mb-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
              >
                <ArrowUp className='h-3.5 w-3.5' /> Up
              </button>
            )}

            {dirs.length > 0 && (
              <div className='mb-4'>
                <p className='mb-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Folders</p>
                {viewMode === 'grid' ? (
                  <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5'>{dirs.map(renderGridItem)}</div>
                ) : (
                  <div className='flex flex-col gap-0.5'>{dirs.map(renderListItem)}</div>
                )}
              </div>
            )}

            {files.length > 0 && (
              <div>
                <p className='mb-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Files</p>
                {viewMode === 'grid' ? (
                  <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5'>{files.map(renderGridItem)}</div>
                ) : (
                  <div className='flex flex-col gap-0.5'>
                    {/* list header */}
                    <div className='flex items-center gap-3 border-b border-border/40 px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                      <span className='w-5' />
                      <span className='flex-1'>Name</span>
                      <span className='w-20 text-right'>Size</span>
                      <span className='hidden w-24 text-right sm:block'>Modified</span>
                      <span className='w-5' />
                    </div>
                    {files.map(renderListItem)}
                  </div>
                )}
              </div>
            )}

            {dirs.length === 0 && files.length === 0 && (
              <div className='flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-10 text-center'>
                <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/30 text-muted-foreground'><Search className='h-6 w-6' /></div>
                <p className='text-sm font-bold text-foreground'>No matches</p>
                <p className='text-xs text-muted-foreground'>Nothing matches your current search or filter.</p>
              </div>
            )}
          </>
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  )
}
