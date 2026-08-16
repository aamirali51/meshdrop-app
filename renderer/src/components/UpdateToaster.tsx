import { useEffect } from 'react'
import { useToast } from '@/hooks/useToast'

// Surfaces update lifecycle events from the main process (background auto
// check + auto download) as toasts with a "Restart Now" action, no matter
// which page the user is on. The Settings page additionally shows the full
// status card for manual checks.
export function UpdateToaster() {
  const { toast } = useToast()

  useEffect(() => {
    const unsubDownloaded = window.bridge?.onUpdateDownloaded?.((data) => {
      toast.success(
        'Update Ready',
        data?.message || 'Restart the app to finish installing the update.',
        {
          actions: [
            {
              label: 'Restart Now',
              onClick: () => {
                window.bridge?.restartAndInstall?.().catch(() => {})
              }
            }
          ],
          durationMs: 20000
        }
      )
    })
    return () => unsubDownloaded?.()
  }, [toast])

  return null
}
