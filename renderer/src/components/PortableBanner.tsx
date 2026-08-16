import { useEffect, useState } from 'react'
import { FolderDown, X } from 'lucide-react'
import { PortableInstallModal } from '@/components/PortableInstallModal'
import type { PortableStatus } from '@/types/bridge'

// Tier 2a entry point: the single-file portable is running. Offer a one-time
// "install to a folder" — the copied folder boots directly (no per-run
// extraction) and gets file-level updates (Tier 3).
export function PortableBanner() {
  const [status, setStatus] = useState<PortableStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    window.bridge?.portableStatus?.().then(setStatus).catch(() => {})
  }, [])

  if (!status?.installAvailable || dismissed) return null

  return (
    <>
      <div className='pointer-events-auto fixed bottom-5 left-1/2 z-40 w-full max-w-md -translate-x-1/2 px-4'>
        <div className='flex items-start gap-3 rounded-2xl border border-primary/25 bg-card/90 p-3.5 shadow-xl backdrop-blur-md'>
          <div className='mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl gradient-brand text-white'>
            <FolderDown className='h-4 w-4' />
          </div>
          <div className='min-w-0 flex-1'>
            <p className='text-xs font-extrabold text-foreground'>Portable Mode</p>
            <p className='mt-0.5 text-[11px] leading-relaxed text-muted-foreground'>
              Install MeshDrop to a folder for faster startup and automatic file-level updates —
              your data stays next to the app.
            </p>
            <div className='mt-2 flex items-center gap-2'>
              <button
                onClick={() => setShowModal(true)}
                className='inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground transition-opacity hover:opacity-90'
              >
                <FolderDown className='h-3.5 w-3.5' />
                Install to Folder
              </button>
              <button
                onClick={() => setDismissed(true)}
                className='rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground'
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            aria-label='Dismiss'
            className='shrink-0 text-muted-foreground transition-colors hover:text-foreground'
          >
            <X className='h-4 w-4' />
          </button>
        </div>
      </div>

      <PortableInstallModal open={showModal} onOpenChange={setShowModal} />
    </>
  )
}
