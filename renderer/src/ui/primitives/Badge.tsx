import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary border-primary/20',
        secondary: 'bg-secondary text-secondary-foreground border-border',
        destructive: 'bg-destructive/10 text-destructive border-destructive/20',
        outline: 'text-foreground border-border',
        success: 'bg-[rgb(var(--success)/0.12)] text-[rgb(var(--success))] border-[rgb(var(--success)/0.2)]',
        warning: 'bg-[rgb(var(--warning)/0.12)] text-[rgb(var(--warning))] border-[rgb(var(--warning)/0.2)]',
        info: 'bg-primary/10 text-primary border-primary/20',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
