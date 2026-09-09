import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import {
  isElectron,
  isMac,
  isWindowMaximized,
  onWindowMaximized,
  windowClose,
  windowMinimize,
  windowToggleMaximize
} from '@/lib/capabilities'

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
    let mounted = true
    isWindowMaximized()
      .then((v) => {
        if (mounted) setMaximized(v)
      })
      .catch(() => {})
    const unsub = onWindowMaximized(setMaximized)
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
        onClick={() => windowMinimize()}
        title='Minimize'
        aria-label='Minimize window'
      >
        <Minus className='h-4 w-4' />
      </button>
      <button
        className={baseBtn}
        onClick={() => windowToggleMaximize()}
        title={maximized ? 'Restore' : 'Maximize'}
        aria-label={maximized ? 'Restore window' : 'Maximize window'}
      >
        {maximized ? <Copy className='h-3.5 w-3.5' /> : <Square className='h-3.5 w-3.5' />}
      </button>
      <button
        className='no-drag ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive hover:text-white'
        onClick={() => windowClose()}
        title='Close'
        aria-label='Close window'
      >
        <X className='h-4 w-4' />
      </button>
    </div>
  )
}
