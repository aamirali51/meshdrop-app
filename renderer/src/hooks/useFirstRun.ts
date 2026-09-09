import { useCallback, useState } from 'react'

const FIRST_RUN_KEY = 'meshdrop:firstRunGuide'

// UI audit F27: replace the wall of zero stat cards with guided first-run
// actions until the user has done something real (paired a device, made a
// transfer, or created a share link) or dismisses the guide explicitly.
export function useFirstRun(hasDoneSomething: boolean): {
  firstRun: boolean
  dismissFirstRun: () => void
} {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(FIRST_RUN_KEY) === '1'
    } catch {
      return false
    }
  })

  const dismissFirstRun = useCallback(() => {
    setDismissed(true)
    try {
      window.localStorage.setItem(FIRST_RUN_KEY, '1')
    } catch {}
  }, [])

  return { firstRun: !dismissed && !hasDoneSomething, dismissFirstRun }
}
