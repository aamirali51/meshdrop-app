// History is merged into Activity. This route stays as a redirect alias so
// deep links and bookmarks to #/history keep working (useNavigation normalizes
// #/history → #/activity?view=history and MainLayout's page map renders
// Activity). Keep this component as a thin redirect for any direct import path.
import { useEffect } from 'react'
import { useNavigation } from '@/hooks/useNavigation'

export function History() {
  const { navigate } = useNavigation()
  useEffect(() => {
    navigate('/activity' as never)
    if (typeof window !== 'undefined' && !window.location.hash.includes('view=history')) {
      window.location.hash = '/activity?view=history'
    }
  }, [navigate])
  return null
}
