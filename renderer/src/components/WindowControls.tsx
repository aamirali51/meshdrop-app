import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'

const isElectron = typeof window !== 'undefined' && Boolean(window.bridge)
const isMac = isElectron && window.bridge?.platform === 'darwin'

const baseBtn =
  'no-drag flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

/**
 * Custom minimize / maximize / close controls for the frameless desktop frame
 * (Windows/Linux). macOS keeps its native traffic lights, so nothing renders
 * there.
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!window.bridge?.onWindowMaximized) return
    let mounted = true
    window.bridge
      .isWindowMaximized()
      .then((v) => {
        if (mounted) setMaximized(v)
      })
      .catch(() => {})
    const unsub = window.bridge.onWindowMaximized(setMaximized)
    return () => {
      mounted = false
      unsub()
    }
  }, [])

  if (!isElectron || isMac) return null

  return (
    <div className='no-drag flex items-center gap-0.5 border-l border-border/40 pl-2'>
      <button
        className={baseBtn}
        onClick={() => window.bridge?.minimizeWindow?.()}
        title='Minimize'
        aria-label='Minimize window'
      >
        <Minus className='h-4 w-4' />
      </button>
      <button
        className={baseBtn}
        onClick={() => window.bridge?.toggleMaximizeWindow?.()}
        title={maximized ? 'Restore' : 'Maximize'}
        aria-label={maximized ? 'Restore window' : 'Maximize window'}
      >
        {maximized ? <Copy className='h-3.5 w-3.5' /> : <Square className='h-3.5 w-3.5' />}
      </button>
      <button
        className='no-drag ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive hover:text-white'
        onClick={() => window.bridge?.closeWindow?.()}
        title='Close'
        aria-label='Close window'
      >
        <X className='h-4 w-4' />
      </button>
    </div>
  )
}
