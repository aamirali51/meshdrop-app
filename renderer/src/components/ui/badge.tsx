import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary border border-primary/20',
        secondary: 'bg-secondary text-secondary-foreground border border-border',
        destructive: 'bg-destructive/10 text-destructive border border-destructive/20',
        outline: 'text-foreground border border-border',
        success: 'bg-status-online/10 text-status-online border border-status-online/20',
        warning: 'bg-status-away/10 text-status-away border border-status-away/20',
        info: 'bg-primary/10 text-primary border border-primary/20'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
