import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SESSION_EXPIRED_MESSAGE, locationBaseUrl, readSessionToken } from '@/lib/httpTransport'

// HostFilePickerModal — web-mode FILE picking, for media the engine must read
// from the HOST's disk.
//
// Electron asks the OS (native dialog → real absolute path). A plain browser
// cannot, and uploading a file costs a full transfer into host staging before
// the feature even starts — absurd for party media, where a 4K feature runs to
// tens of GB. The host already runs on some machine and can read its own
// filesystem, so this modal walks THAT filesystem and returns an absolute path
// the engine opens directly, exactly like the Electron dialog:
//   GET /fs/drives                  → real drive/mount roots
//   GET /fs/list?path=&files=1&ext= → subdirectories FIRST, then matching files
//                                     with their sizes
// Nothing is copied and no size limit applies — the engine seeds the file in
// place. (The engine always reads party media from the host's disk; an upload
// is only ever a way to put it there.)

interface DriveInfo {
  id: string
  name: string
  kind?: string
  path: string
}
interface FsEntry {
  name: string
  path: string
  kind: 'dir' | 'file'
  size?: number
}

export interface HostPickedFile {
  path: string
  name: string
  size: number
}

async function hostGet<T>(pathAndQuery: string): Promise<T> {
  const res = await fetch(`${locationBaseUrl()}${pathAndQuery}`, {
    headers: { 'X-MeshDrop-Token': readSessionToken() }
  })
  if (res.status === 403) throw new Error(SESSION_EXPIRED_MESSAGE)
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`)
  return (await res.json()) as T
}

function formatSize(bytes: number | undefined): string {
  if (!bytes || bytes < 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`
}

function parentOf(p: string): string | null {
  const trimmed = p.replace(/[\\/]+$/, '')
  const sep = trimmed.includes('\\') ? '\\' : '/'
  if (/^[a-zA-Z]:$/.test(trimmed)) return null // Windows drive root → drives list
  const idx = trimmed.lastIndexOf(sep)
  if (idx <= 0) return null // POSIX "/" → drives list
  const parent = trimmed.slice(0, idx)
  return /^[a-zA-Z]:$/.test(parent) ? parent + sep : parent || null
}

interface PickerState {
  kind: 'drives' | 'dir'
  path?: string
  parent?: string | null
}

interface HostFilePickerProps {
  onDone: (file: HostPickedFile | null) => void
  /** Extensions to accept, without dots (e.g. ['mp4','mkv']). Empty = all. */
  extensions?: string[]
  title?: string
  description?: string
}

/** Extensions offered by the party media / subtitle pickers. */
export const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi', 'ts', 'm2ts', 'mpg', 'mpeg', 'wmv', 'flv', 'ogv']
export const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa', 'sub']

function HostFilePickerModal({ onDone, extensions = [], title, description }: HostFilePickerProps) {
  const [state, setState] = useState<PickerState>({ kind: 'drives' })
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [entries, setEntries] = useState<FsEntry[] | null>(null)
  const [selected, setSelected] = useState<HostPickedFile | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  const extParam = extensions.length ? `&ext=${encodeURIComponent(extensions.join(','))}` : ''

  const loadDrives = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const data = await hostGet<{ drives: DriveInfo[] }>('/fs/drives')
      setDrives(data.drives)
      setSelected(null)
      setState({ kind: 'drives' })
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  const openDir = useCallback(
    async (path: string) => {
      setBusy(true)
      setError('')
      setEntries(null)
      setSelected(null)
      setState({ kind: 'dir', path, parent: parentOf(path) })
      try {
        const data = await hostGet<{ entries: FsEntry[] }>(
          `/fs/list?path=${encodeURIComponent(path)}&files=1${extParam}`
        )
        setEntries(data.entries)
      } catch (err) {
        setError((err as Error).message || String(err))
        setEntries([])
      } finally {
        setBusy(false)
      }
    },
    [extParam]
  )

  useEffect(() => {
    void loadDrives()
  }, [loadDrives])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') doneRef.current(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const canUse = selected !== null && !busy
  const acceptLabel = extensions.length ? extensions.map((e) => e.toUpperCase()).join(', ') : ''

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) doneRef.current(null)
      }}
    >
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl max-h-[min(640px,calc(100vh-64px))]">
        <div className="border-b border-border px-5 py-4">
          <div className="text-[15px] font-black tracking-tight text-foreground">{title || 'Choose a file'}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {description || 'Pick a file on this computer — the host reads it directly, nothing is copied'}
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
          {state.kind === 'dir' ? (
            <>
              <button
                onClick={() => {
                  if (state.parent) void openDir(state.parent)
                  else void loadDrives()
                }}
                disabled={busy}
                className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                ↑ Up
              </button>
              <span className="truncate font-mono" title={state.path}>
                {state.path}
              </span>
            </>
          ) : (
            <span className="font-semibold text-foreground">This computer</span>
          )}
        </div>

        <div className="min-h-[220px] flex-1 overflow-y-auto py-1.5">
          {error ? (
            <div className="px-5 py-4 text-xs font-medium text-destructive">{error}</div>
          ) : state.kind === 'drives' ? (
            drives.length === 0 && !busy ? (
              <div className="px-5 py-4 text-xs text-muted-foreground">No drives found</div>
            ) : (
              drives.map((d) => (
                <button
                  key={d.id}
                  onClick={() => !busy && void openDir(d.path)}
                  className="flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
                >
                  <span className="text-base">💽</span> {d.name}
                </button>
              ))
            )
          ) : entries === null ? null : entries.length === 0 ? (
            <div className="px-5 py-4 text-xs text-muted-foreground">
              {acceptLabel ? `No subfolders or ${acceptLabel} files here` : 'Nothing here'}
            </div>
          ) : (
            entries.map((en) => {
              const isFile = en.kind === 'file'
              const isSelected = isFile && selected?.path === en.path
              return (
                <button
                  key={en.path}
                  onClick={() => {
                    if (busy) return
                    if (isFile) setSelected({ path: en.path, name: en.name, size: en.size || 0 })
                    else void openDir(en.path)
                  }}
                  className={`flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-primary/15 font-bold text-foreground'
                      : 'font-medium text-foreground hover:bg-muted/50'
                  }`}
                >
                  <span className="text-base">{isFile ? '🎬' : '📁'}</span>
                  <span className="min-w-0 flex-1 truncate" title={en.name}>
                    {en.name}
                  </span>
                  {isFile && (
                    <span className="shrink-0 font-mono text-[11px] font-bold text-muted-foreground">
                      {formatSize(en.size)}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {selected && (
          <div className="border-t border-border/60 px-5 py-2 text-[11px] font-medium text-muted-foreground">
            Selected: <span className="font-mono text-foreground">{selected.name}</span>{' '}
            <span className="font-mono">({formatSize(selected.size)})</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={() => doneRef.current(null)}
            className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => doneRef.current(selected)}
            disabled={!canUse}
            title={canUse ? selected!.path : ''}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Use this file
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Web-mode file picker for media the host must read from ITS OWN disk: shows
 * the modal and resolves with the chosen absolute path, or null when
 * cancelled. No upload and no size cap — the engine seeds the file in place.
 * (Electron never calls this — it uses the native dialog.)
 */
export function pickHostFile(options: {
  extensions?: string[]
  title?: string
  description?: string
} = {}): Promise<HostPickedFile | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    root.render(
      <HostFilePickerModal
        extensions={options.extensions}
        title={options.title}
        description={options.description}
        onDone={(file) => {
          root.unmount()
          host.remove()
          resolve(file)
        }}
      />
    )
  })
}
