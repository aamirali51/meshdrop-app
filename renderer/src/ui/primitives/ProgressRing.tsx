import { cn } from '@/lib/utils'

type RingSize = 'sm' | 'md' | 'lg'
type RingColor = 'primary' | 'success' | 'warning' | 'muted'

const sizeMap: Record<RingSize, { px: number; stroke: number; textClass: string }> = {
  sm: { px: 36, stroke: 4, textClass: 'text-[10px]' },
  md: { px: 52, stroke: 5, textClass: 'text-xs' },
  lg: { px: 72, stroke: 6, textClass: 'text-sm' },
}

const colorMap: Record<RingColor, string> = {
  primary: 'text-primary',
  success: 'text-[rgb(var(--success))]',
  warning: 'text-[rgb(var(--warning))]',
  muted: 'text-muted-foreground',
}

interface ProgressRingProps {
  value: number // 0..100
  size?: RingSize
  color?: RingColor
  showLabel?: boolean
  className?: string
  'aria-label'?: string
}

export function ProgressRing({
  value,
  size = 'md',
  color = 'primary',
  showLabel = true,
  className,
  'aria-label': ariaLabel,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const { px, stroke, textClass } = sizeMap[size]
  const r = (px - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (clamped / 100) * c

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? `${Math.round(clamped)} percent`}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: px, height: px }}
    >
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} className="-rotate-90" aria-hidden>
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" strokeWidth={stroke} className="text-muted/40" stroke="currentColor" />
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={cn('transition-[stroke-dasharray] duration-500 ease-out', colorMap[color])}
          stroke="currentColor"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      {showLabel && (
        <span className={cn('pointer-events-none absolute inset-0 flex items-center justify-center font-bold tabular-nums', textClass, colorMap[color])}>
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  )
}
