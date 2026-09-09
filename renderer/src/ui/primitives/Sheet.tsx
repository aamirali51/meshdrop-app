import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Sheet = Dialog.Root
const SheetTrigger = Dialog.Trigger
const SheetClose = Dialog.Close

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof Dialog.Overlay>,
  React.ComponentPropsWithoutRef<typeof Dialog.Overlay>
>(({ className, ...props }, ref) => (
  <Dialog.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0', className)}
    {...props}
  />
))
SheetOverlay.displayName = Dialog.Overlay.displayName

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof Dialog.Content> {
  side?: 'bottom' | 'right'
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof Dialog.Content>,
  SheetContentProps
>(({ className, children, side = 'bottom', ...props }, ref) => (
  <Dialog.Portal>
    <SheetOverlay />
    <Dialog.Content
      ref={ref}
      aria-describedby={undefined}
      className={cn(
        'fixed z-50 flex flex-col bg-card text-card-foreground shadow-lg focus:outline-none',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        side === 'bottom' &&
          'inset-x-0 bottom-0 max-h-[85vh] rounded-t-[20px] border-t border-border data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom md:inset-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[80vh] md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:border data-[state=open]:md:zoom-in-95 data-[state=closed]:md:zoom-out-95 data-[state=open]:md:fade-in-0',
        side === 'right' &&
          'inset-y-0 right-0 h-full w-[92vw] max-w-sm border-l border-border data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
        className,
      )}
      {...props}
    >
      {/* Drag handle — mobile affordance */}
      {side === 'bottom' && (
        <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-muted md:hidden" aria-hidden />
      )}
      <div className="flex-1 overflow-y-auto overscroll-contain p-6 pt-4 md:pt-6">{children}</div>
      <Dialog.Close
        aria-label="Close"
        className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <X className="h-4 w-4" aria-hidden />
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
))
SheetContent.displayName = Dialog.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mb-4 flex flex-col gap-1.5 pr-8 text-left', className)} {...props} />
)
SheetHeader.displayName = 'SheetHeader'

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof Dialog.Title>,
  React.ComponentPropsWithoutRef<typeof Dialog.Title>
>(({ className, ...props }, ref) => (
  <Dialog.Title ref={ref} className={cn('text-base font-semibold leading-none tracking-tight', className)} {...props} />
))
SheetTitle.displayName = Dialog.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof Dialog.Description>,
  React.ComponentPropsWithoutRef<typeof Dialog.Description>
>(({ className, ...props }, ref) => (
  <Dialog.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
SheetDescription.displayName = Dialog.Description.displayName

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
)
SheetFooter.displayName = 'SheetFooter'

export { Sheet, SheetTrigger, SheetClose, SheetOverlay, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter }
