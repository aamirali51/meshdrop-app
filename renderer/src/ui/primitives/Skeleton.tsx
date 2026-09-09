import { cn } from '@/lib/utils'

type SkeletonShape = 'text' | 'row' | 'card' | 'ring'

const shapeClasses: Record<SkeletonShape, string> = {
  text: 'h-4 w-full rounded-md',
  row: 'h-12 w-full rounded-lg',
  card: 'h-32 w-full rounded-xl',
  ring: 'h-16 w-16 rounded-full',
}

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shape?: SkeletonShape
}

export function Skeleton({ className, shape = 'text', ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse bg-muted/60 border border-border/20', shapeClasses[shape], className)}
      {...props}
    />
  )
}
