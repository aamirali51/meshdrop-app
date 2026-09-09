import { useEffect, useState, useCallback } from 'react'
import { isWeb } from '@/lib/capabilities'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (!isWeb) return
    // Already in standalone?
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }
    // iOS standalone
    if ((window.navigator as unknown as { standalone?: boolean }).standalone) {
      setInstalled(true)
      return
    }

    const onBefore = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBefore)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferred) return false
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') setDeferred(null)
      return choice.outcome === 'accepted'
    } catch {
      return false
    }
  }, [deferred])

  const canInstall = isWeb && !!deferred && !installed
  return { canInstall, installed, promptInstall }
}
