import { useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ContextMenuItem {
  label?: string
  icon?: ReactNode
  onClick?: () => void
  destructive?: boolean
  disabled?: boolean
  separator?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const width = 220
  const left = Math.min(x, window.innerWidth - width - 8)
  const top = Math.min(y, window.innerHeight - items.length * 36 - 16)

  return (
    <>
      {/* click-outside catcher */}
      <div
        className='fixed inset-0 z-50'
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        role='menu'
        className='no-drag fixed z-50 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-2xl animate-scale-up'
        style={{ left, top, width }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, i) =>
          item.separator ? (
            <div key={i} className='my-1 h-px bg-border/60' />
          ) : (
            <button
              key={i}
              role='menuitem'
              disabled={item.disabled}
              onClick={() => {
                onClose()
                item.onClick?.()
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                item.disabled
                  ? 'cursor-not-allowed text-muted-foreground/50'
                  : item.destructive
                    ? 'text-destructive hover:bg-destructive/10'
                    : 'text-foreground hover:bg-accent/60'
              )}
            >
              {item.icon && <span className='shrink-0'>{item.icon}</span>}
              <span className='truncate'>{item.label}</span>
            </button>
          )
        )}
      </div>
    </>
  )
}
