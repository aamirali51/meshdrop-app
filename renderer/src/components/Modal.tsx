import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: string
  children: React.ReactNode
  className?: string
  /** Prevents ESC / click-outside from closing (e.g. security approvals). */
  blockClose?: boolean
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  blockClose
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-50 bg-black/60 backdrop-blur-xl animate-fade-in' />
        <Dialog.Content
          onEscapeKeyDown={(e) => blockClose && e.preventDefault()}
          onPointerDownOutside={(e) => blockClose && e.preventDefault()}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl animate-modal-scale-up max-h-[85vh] overflow-y-auto outline-none',
            className
          )}
        >
          <div className='flex items-start justify-between gap-4'>
            <div className='min-w-0'>
              <Dialog.Title className='text-base font-black tracking-tight text-foreground'>
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className='mt-0.5 text-xs text-muted-foreground'>
                  {description}
                </Dialog.Description>
              )}
            </div>
            {!blockClose && (
              <Dialog.Close
                aria-label='Close'
                className='rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
              >
                <X className='h-4 w-4' />
              </Dialog.Close>
            )}
          </div>
          <div className='mt-5'>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description: string
  confirmLabel: string
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title}>
      <p className='text-xs leading-relaxed text-muted-foreground'>{description}</p>
      <div className='mt-5 flex items-center justify-end gap-3'>
        <Button variant='outline' onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          variant='destructive'
          onClick={() => {
            onConfirm()
            onOpenChange(false)
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
