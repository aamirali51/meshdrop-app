import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { METHODS, EVENTS } from '@/types/protocol'
import { call, on } from '@/lib/ipc'
import { useToast } from '@/hooks/useToast'
import type { NetworkDiagnostics } from '@/types'

interface AppContextValue {
  diagnostics: NetworkDiagnostics
  isCommandPaletteOpen: boolean
  isNotificationDrawerOpen: boolean
  toggleCommandPalette: () => void
  toggleNotificationDrawer: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()
  const [diagnostics, setDiagnostics] = useState<NetworkDiagnostics>({
    natType: null,
    relayStatus: 'Disabled',
    dhtNodes: null,
    avgLatencyMs: null,
    packetLossPercent: null,
    noiseProtocol: 'Noise_XX_25519_ChaChaPoly_BLAKE2b',
    bandwidthMbps: null,
    systemCpuUsage: null,
    systemRamUsage: null,
    uptimeMs: 0,
    bytesReceived: 0,
    bytesSent: 0
  })
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false)

  // Live diagnostics (real values, no fabrication): initial fetch, a short
  // poll, and a refresh on connection changes. Plus shell-level listeners:
  // the Cmd+K shortcut, tray-hidden toast, and update-downloaded toast.
  useEffect(() => {
    const refreshDiagnostics = () => {
      call(METHODS.DIAGNOSTICS_GET, null)
        .then((res: any) => {
          if (res && typeof res === 'object') setDiagnostics(res)
        })
        .catch(() => {})
    }
    refreshDiagnostics()
    const diagTimer = setInterval(refreshDiagnostics, 4000)
    const unsubConnChanged = on(EVENTS.CONNECTION_CHANGED, refreshDiagnostics)

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsCommandPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    const unsubTray = window.bridge?.onTrayHidden?.(() => {
      toast.info(
        'MeshDrop is Still Running',
        'The app stays active in the system tray. Click the tray icon to restore it.'
      )
    })
    // A new version finished downloading in the background: non-intrusive
    // toast with a one-click restart to apply it.
    const unsubUpdateDownloaded = window.bridge?.onUpdateDownloaded?.((d: any) => {
      toast.info(
        'New update ready',
        d?.message || `Version ${d?.version || ''} has been downloaded and is ready to install.`,
        {
          actions: [{ label: 'Restart Now', onClick: () => window.bridge?.restartAndInstall?.() }],
          durationMs: 60000
        }
      )
    })

    return () => {
      clearInterval(diagTimer)
      unsubConnChanged()
      window.removeEventListener('keydown', handleKeyDown)
      unsubTray?.()
      unsubUpdateDownloaded?.()
    }
  }, [toast])

  const toggleCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen((prev) => !prev)
  }, [])

  const toggleNotificationDrawer = useCallback(() => {
    setIsNotificationDrawerOpen((prev) => !prev)
  }, [])

  return (
    <AppContext.Provider
      value={{
        diagnostics,
        isCommandPaletteOpen,
        isNotificationDrawerOpen,
        toggleCommandPalette,
        toggleNotificationDrawer
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
