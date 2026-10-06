import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useNavigation, PAGE_TITLES, PAGE_SUBTITLES } from '@/hooks/useNavigation'
import { useShares } from '@/hooks/useShares'
import { useToast } from '@/hooks/useToast'
import { Dashboard } from '@/pages/Dashboard'
import { Devices } from '@/pages/Devices'
import { Sync } from '@/pages/Sync'
import { Transfers } from '@/pages/Transfers'
import { Activity } from '@/pages/Activity'
import { History } from '@/pages/History'
import { Diagnostics } from '@/pages/Diagnostics'
import { Guide } from '@/pages/Guide'
import { Settings } from '@/pages/Settings'
import { WatchParty } from '@/pages/WatchParty'
import { SharedFolders } from '@/pages/SharedFolders'
import { Tunnels } from '@/pages/Tunnels'
import { About } from '@/pages/About'
import { AnimatePresence, motion } from 'framer-motion'
import { Upload, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { CommandPalette } from '@/components/CommandPalette'
import { NotificationDrawer } from '@/components/NotificationDrawer'
import { QuickConnectModal } from '@/components/QuickConnectModal'
import { DeviceDetailsModal } from '@/components/DeviceDetailsModal'
import { QRCodeModal } from '@/components/QRCodeModal'
import { DropCodeModal } from '@/components/DropCodeModal'
import { OneTimeReceiveModal } from '@/components/OneTimeReceiveModal'
import { TransferApprovalDialog } from '@/components/TransferApprovalDialog'
import { SyncInviteModal } from '@/components/SyncInviteModal'
import { DropPreviewModal } from '@/components/DropPreviewModal'
import { WhatsNewModal } from '@/components/WhatsNewModal'
import { WatchPartyModal } from '@/components/WatchPartyModal'
import { useApp } from '@/hooks/useAppState'
import { useDevices } from '@/hooks/useDevices'
import { useTransfers } from '@/hooks/useTransfers'
import { resolveDrop } from '@/lib/capabilities'
import { pageTransition } from '@/ui/motion'

const DesignPreview = lazy(() => import('@/ui/DesignPreview').then((m) => ({ default: m.DesignPreview })))

const pages: Record<string, React.FC> = {
  '/dashboard': Dashboard,
  '/devices': Devices,
  '/sync': Sync,
  '/party': WatchParty,
  '/shared-folders': SharedFolders,
  '/tunnels': Tunnels,
  '/transfers': Transfers,
  '/activity': Activity,
  '/history': History,
  '/diagnostics': Diagnostics,
  '/guide': Guide,
  '/settings': Settings,
  '/about': About,
}

function PageHeader({ route }: { route: string }) {
  const title = (PAGE_TITLES as Record<string, string>)[route] || 'MeshDrop Go'
  const subtitle = (PAGE_SUBTITLES as Record<string, string>)[route] || ''
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-black tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div id="page-actions-slot" className="flex items-center gap-2" />
    </div>
  )
}

export function MainLayout() {
  const { currentRoute } = useNavigation()
  const { isQRCodeModalOpen, toggleQRCodeModal } = useDevices()
  const { openShareWith, watchParty, closeWatchParty } = useShares()
  const { incomingPill, dismissIncomingPill, goToIncoming } = useTransfers()
  const { connectionUp } = useApp()
  const { toast } = useToast()
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const [hash, setHash] = useState(() => (typeof window !== 'undefined' ? window.location.hash : ''))
  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const isDesignPreview = import.meta.env.DEV && hash === '#/_design'
  const Page = pages[currentRoute] || Dashboard

  const handleGlobalDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer?.files || [])
    if (!files.length) return
    try {
      const picked = await resolveDrop(files)
      if (!picked.length) {
        toast.error('Drop Failed', 'Could not resolve the dropped file path.')
        return
      }
      openShareWith({ files: picked })
    } catch {
      toast.error('Drop Failed', 'Could not resolve the dropped file path.')
    }
  }

  return (
    <ErrorBoundary>
      <div
        className="relative flex h-screen overflow-hidden bg-background"
        onDragEnter={(e) => {
          e.preventDefault()
          dragDepth.current++
          setDragging(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault()
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          handleGlobalDrop(e)
        }}
      >
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <TopBar />
          {!connectionUp && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] font-semibold text-amber-700 dark:text-amber-300 backdrop-blur"
            >
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              Connection lost — reconnecting…
            </div>
          )}
          <main id="main-scroll" className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-7">
              {!isDesignPreview && <PageHeader route={currentRoute} />}
              {isDesignPreview ? (
                <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading design preview…</div>}>
                  <DesignPreview />
                </Suspense>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentRoute}
                    variants={pageTransition}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <ErrorBoundary>
                      <Page />
                    </ErrorBoundary>
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </main>
        </div>

        <CommandPalette />
        <NotificationDrawer />
        <QuickConnectModal />
        <DeviceDetailsModal />
        <QRCodeModal isOpen={isQRCodeModalOpen} onClose={toggleQRCodeModal} />
        <DropCodeModal />
        <OneTimeReceiveModal />
        <DropPreviewModal />
        <WhatsNewModal />
        <TransferApprovalDialog />
        <SyncInviteModal />
        {watchParty && (
          <WatchPartyModal
            open={!!watchParty.open}
            onClose={closeWatchParty}
            transferId={watchParty.transferId}
            filePath={watchParty.filePath}
            roomCode={watchParty.roomCode}
            roomTitle={watchParty.roomTitle}
            isHost={watchParty.isHost}
          />
        )}

        {incomingPill && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full border border-primary/30 bg-card px-4 py-2 shadow-xl">
            <span className="h-2 w-2 rounded-full bg-meshdrop-cyan animate-pulse" />
            <span className="text-xs font-bold text-foreground truncate max-w-[220px]">{incomingPill}</span>
            <button
              onClick={goToIncoming}
              className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View →
            </button>
            <button
              onClick={dismissIncomingPill}
              className="text-muted-foreground hover:text-foreground px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {dragging && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-md">
            <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-primary bg-card/95 p-12 text-center shadow-2xl animate-pulse">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/30">
                <Upload className="h-8 w-8" />
              </div>
              <div>
                <p className="text-lg font-black text-foreground">Drop Files to Share Instantly</p>
                <p className="text-xs text-muted-foreground mt-1">Direct peer-to-peer stream · End-to-end encrypted · No cloud intermediary</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}
