import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SESSION_EXPIRED_MESSAGE, locationBaseUrl, readSessionToken } from '@/lib/httpTransport'

// FolderPickerModal — web-mode folder picking.
//
// Electron asks the OS (native dialog → real absolute path). A plain browser
// has no such dialog, but the meshdrop-host it talks to runs on the same
// machine, so this modal walks the HOST's real filesystem instead:
//   GET /fs/drives      → real drive roots (the p2p staging drive is hidden —
//                         imports need no picking)
//   GET /fs/list?path=  → direct subdirectory entries of an absolute path
// and resolves with the absolute path of the folder the user drilled into.
// That path is a REAL path on the host machine, so everything downstream
// (engine folder watchers, transfer seeding) works unchanged.

interface DriveInfo {
  id: string
  name: string
  kind?: string
  path: string
}
interface DirEntry {
  name: string
  path: string
}

async function hostGet<T>(pathAndQuery: string): Promise<T> {
  const res = await fetch(`${locationBaseUrl()}${pathAndQuery}`, {
    headers: { 'X-MeshDrop-Token': readSessionToken() }
  })
  if (res.status === 403) throw new Error(SESSION_EXPIRED_MESSAGE)
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`)
  return (await res.json()) as T
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

function FolderPickerModal({ onDone }: { onDone: (path: string | null) => void }) {
  const [state, setState] = useState<PickerState>({ kind: 'drives' })
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  const loadDrives = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const data = await hostGet<{ drives: DriveInfo[] }>('/fs/drives')
      setDrives(data.drives.filter((d) => d.kind !== 'staging'))
      setState({ kind: 'drives' })
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  const openDir = useCallback(async (path: string) => {
    setBusy(true)
    setError('')
    setEntries(null)
    setState({ kind: 'dir', path, parent: parentOf(path) })
    try {
      const data = await hostGet<{ entries: DirEntry[] }>(`/fs/list?path=${encodeURIComponent(path)}`)
      setEntries(data.entries)
    } catch (err) {
      setError((err as Error).message || String(err))
      setEntries([])
    } finally {
      setBusy(false)
    }
  }, [])

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

  const selectedPath = state.kind === 'dir' && entries ? state.path || null : null
  const canUse = selectedPath !== null && !busy

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) doneRef.current(null)
      }}
    >
      <div
        style={{
          width: 'min(560px, calc(100vw - 32px))',
          maxHeight: 'min(560px, calc(100vh - 64px))',
          background: '#1d2129',
          color: '#e8eaf0',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}
      >
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Choose a folder</div>
          <div style={{ fontSize: 12.5, color: '#9aa2b1', marginTop: 3 }}>
            Pick a folder on this computer — MeshDrop Go reads it directly from the host
          </div>
        </div>

        <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#b8c0cf' }}>
            {state.kind === 'dir' ? (
              <>
                <button
                  onClick={() => {
                    if (state.parent) void openDir(state.parent)
                    else void loadDrives()
                  }}
                  disabled={busy}
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: 'none',
                    color: '#e8eaf0',
                    borderRadius: 6,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontSize: 12.5
                  }}
                >
                  ↑ Up
                </button>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    direction: 'rtl',
                    textAlign: 'left'
                  }}
                  title={state.path}
                >
                  {state.path}
                </span>
              </>
            ) : (
              <span>This computer</span>
            )}
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 160, padding: '6px 0' }}>
          {error ? (
            <div style={{ padding: '14px 20px', color: '#ff8a80', fontSize: 13 }}>{error}</div>
          ) : state.kind === 'drives' ? (
            drives.length === 0 && !busy ? (
              <div style={{ padding: '14px 20px', color: '#9aa2b1', fontSize: 13 }}>
                No folders found
              </div>
            ) : (
              drives.map((d) => (
                <button
                  key={d.id}
                  onClick={() => !busy && void openDir(d.path)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 20px',
                    background: 'none',
                    border: 'none',
                    color: '#e8eaf0',
                    fontSize: 13.5,
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: 15 }}>💽</span> {d.name}
                </button>
              ))
            )
          ) : (
            entries === null ? null : (
              entries.length === 0 ? (
                <div style={{ padding: '14px 20px', color: '#9aa2b1', fontSize: 13 }}>
                  No subfolders here
                </div>
              ) : (
                entries.map((en) => (
                  <button
                    key={en.path}
                    onClick={() => !busy && void openDir(en.path)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      textAlign: 'left',
                      padding: '9px 20px',
                      background: 'none',
                      border: 'none',
                      color: '#e8eaf0',
                      fontSize: 13.5,
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{ fontSize: 15 }}>📁</span> {en.name}
                  </button>
                ))
              )
            )
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={() => doneRef.current(null)}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#e8eaf0',
              borderRadius: 8,
              padding: '7px 16px',
              cursor: 'pointer',
              fontSize: 13
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => doneRef.current(selectedPath)}
            disabled={!canUse}
            style={{
              background: canUse ? '#3b82f6' : 'rgba(59,130,246,0.35)',
              border: 'none',
              color: '#fff',
              borderRadius: 8,
              padding: '7px 16px',
              cursor: canUse ? 'pointer' : 'default',
              fontSize: 13
            }}
            title={canUse ? selectedPath! : ''}
          >
            Use this folder
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Web-mode folder picker: shows the modal and resolves with the chosen
 * absolute path, or null when cancelled. (Electron never calls this — it uses
 * the native dialog.) Rejects only if React cannot mount.
 */
export function pickHostFolder(): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    root.render(
      <FolderPickerModal
        onDone={(path) => {
          root.unmount()
          host.remove()
          resolve(path)
        }}
      />
    )
  })
}
