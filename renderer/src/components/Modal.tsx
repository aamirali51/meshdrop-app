import { useEffect, useState, type ReactNode } from 'react'
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
  /**
   * Header text tone. 'theme' (default) follows the app theme tokens; 'dark'
   * forces light header text for panels whose background is hardcoded dark, so
   * the title does not vanish when the app is in light mode.
   */
  headerTone?: 'theme' | 'dark'
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  blockClose,
  headerTone = 'theme'
}: ModalProps) {
  const darkHeader = headerTone === 'dark'
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
              <Dialog.Title
                className={cn(
                  'text-base font-black tracking-tight text-foreground',
                  darkHeader && '!text-white'
                )}
              >
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description
                  className={cn(
                    'mt-0.5 text-xs text-muted-foreground',
                    darkHeader && '!text-white/60'
                  )}
                >
                  {description}
                </Dialog.Description>
              )}
            </div>
            {!blockClose && (
              <Dialog.Close
                aria-label='Close'
                className={cn(
                  'rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  darkHeader && '!text-white/60 hover:!bg-white/10 hover:!text-white'
                )}
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
  requireConfirmText?: string
  onConfirm: () => void
  extra?: ReactNode
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  requireConfirmText,
  onConfirm,
  extra
}: ConfirmDialogProps) {
  const [confirmInput, setConfirmInput] = useState('')
  const requiresText = !!requireConfirmText
  const canConfirm = !requiresText || confirmInput === requireConfirmText
  useEffect(() => {
    if (open) setConfirmInput('')
  }, [open])
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title}>
      <p className='text-xs leading-relaxed text-muted-foreground'>{description}</p>
      {extra}
      {requiresText && (
        <input
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value)}
          placeholder={`Type ${requireConfirmText} to confirm`}
          className='mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none'
        />
      )}
      <div className='mt-5 flex items-center justify-end gap-3'>
        <Button variant='outline' onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          variant='destructive'
          disabled={requiresText && !canConfirm}
          onClick={() => {
            if (!canConfirm) return
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
