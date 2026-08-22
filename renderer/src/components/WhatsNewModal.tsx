import { useEffect, useState } from 'react'
import { Folder, Zap, ShieldCheck, Sparkles, Check, ArrowRight } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/button'
import { LATEST_RELEASE_NOTES } from '@/data/releaseNotes'

const STORAGE_KEY = 'meshdrop_last_seen_version'

export function WhatsNewModal() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    try {
      const lastSeen = localStorage.getItem(STORAGE_KEY)
      // If the user has never seen this version's release notes, show it
      if (lastSeen !== LATEST_RELEASE_NOTES.version) {
        setIsOpen(true)
      }
    } catch {
      // Storage unavailable or disabled
    }
  }, [])

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, LATEST_RELEASE_NOTES.version)
    } catch {}
    setIsOpen(false)
  }

  const renderIcon = (type: string) => {
    switch (type) {
      case 'folder':
        return <Folder className='h-5 w-5 text-primary' />
      case 'zap':
        return <Zap className='h-5 w-5 text-amber-400' />
      case 'shield':
        return <ShieldCheck className='h-5 w-5 text-status-online' />
      default:
        return <Sparkles className='h-5 w-5 text-primary' />
    }
  }

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => !open && handleDismiss()}
      title={LATEST_RELEASE_NOTES.title}
      description={`Version ${LATEST_RELEASE_NOTES.version} · ${LATEST_RELEASE_NOTES.date}`}
    >
      <div className='space-y-4 pt-1'>
        <div className='space-y-3'>
          {LATEST_RELEASE_NOTES.features.map((feature, idx) => (
            <div
              key={idx}
              className='flex items-start gap-3.5 rounded-xl border border-border/50 bg-card/40 p-3.5 transition-colors hover:bg-card/70'
            >
              <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10'>
                {renderIcon(feature.icon)}
              </div>
              <div className='min-w-0 flex-1'>
                <h4 className='text-sm font-bold text-foreground'>{feature.title}</h4>
                <p className='mt-0.5 text-xs leading-relaxed text-muted-foreground'>
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className='flex items-center justify-end pt-2'>
          <Button onClick={handleDismiss} className='w-full gap-2 font-bold' size='lg'>
            <Check className='h-4 w-4' />
            Got it, let's go!
          </Button>
        </div>
      </div>
    </Modal>
  )
}
