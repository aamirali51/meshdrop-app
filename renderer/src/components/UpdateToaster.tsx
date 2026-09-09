import { useEffect } from 'react'
import { useToast } from '@/hooks/useToast'
import { onUpdateDownloaded, restartAndInstall } from '@/lib/capabilities'

// Surfaces update lifecycle events from the main process (background auto
// check + auto download) as toasts with a "Restart Now" action, no matter
// which page the user is on. The Settings page additionally shows the full
// status card for manual checks.
export function UpdateToaster() {
  const { toast } = useToast()

  useEffect(() => {
    const unsubDownloaded = onUpdateDownloaded((data) => {
      toast.success(
        'Update Ready',
        data?.message || 'Restart the app to finish installing the update.',
        {
          actions: [
            {
              label: 'Restart Now',
              onClick: () => {
                restartAndInstall().catch(() =>
                  toast.error('Restart Failed', 'Could not restart to install the update — try again.')
                )
              }
            }
          ],
          durationMs: 20000
        }
      )
    })
    return () => unsubDownloaded()
  }, [toast])

  return null
}
