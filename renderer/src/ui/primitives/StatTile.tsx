import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatTileProps {
  label: string
  value: ReactNode
  hint?: string
  icon?: ReactNode
  className?: string
}

export function StatTile({ label, value, hint, icon, className }: StatTileProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-card p-4 shadow-sm',
        'flex flex-col gap-2',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        {icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
        )}
      </div>
      <div className="text-2xl font-black tracking-tight text-foreground">{value}</div>
      {hint && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  )
}
