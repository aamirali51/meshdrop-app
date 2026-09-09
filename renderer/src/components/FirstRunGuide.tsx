import { Network, Sparkles, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigation } from '@/hooks/useNavigation'

// Guided first-run card (UI audit F27) shown in place of zero stat cards until
// the user pairs a device or starts their first share.
export function FirstRunGuide({
  onShare,
  onDismiss
}: {
  /** Primary share action (e.g. open the file picker / drop-code modal). */
  onShare?: () => void
  /** Persist the dismissal so the guide does not reappear. */
  onDismiss?: () => void
}) {
  const { navigate } = useNavigation()

  return (
    <section
      aria-label='Getting started'
      className='glass-card relative overflow-hidden rounded-2xl border border-primary/25 p-5 md:p-6'
    >
      <div className='flex items-start gap-3'>
        <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/25'>
          <Sparkles className='h-5 w-5' />
        </div>
        <div className='min-w-0 flex-1'>
          <h3 className='text-sm font-extrabold text-foreground'>Welcome to MeshDrop</h3>
          <p className='mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground'>
            Nothing here yet — and that's fine. Files move directly between your own devices, or
            to anyone through a one-time link. No cloud, no account, no size limits.
          </p>
          <div className='mt-4 flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              className='gap-1.5 text-xs font-bold'
              onClick={() => navigate('/devices')}
            >
              <Network className='h-3.5 w-3.5' /> Pair your first device
            </Button>
            {onShare && (
              <Button
                size='sm'
                variant='outline'
                className='gap-1.5 border-primary/30 text-xs font-bold text-primary hover:bg-primary/10'
                onClick={onShare}
              >
                <Upload className='h-3.5 w-3.5' /> Share your first file
              </Button>
            )}
          </div>
        </div>
      </div>
      {onDismiss && (
        <button
          aria-label='Dismiss getting-started guide'
          onClick={onDismiss}
          className='absolute right-3 top-3 rounded-lg p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground'
        >
          <X className='h-3.5 w-3.5' />
        </button>
      )}
    </section>
  )
}
