import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useNavigation } from '@/hooks/useNavigation'
import { useShares } from '@/hooks/useShares'
import { useToast } from '@/hooks/useToast'
import { Dashboard } from '@/pages/Dashboard'
import { Devices } from '@/pages/Devices'
import { Sync } from '@/pages/Sync'
import { Transfers } from '@/pages/Transfers'
import { Activity } from '@/pages/Activity'
import { History } from '@/pages/History'
import { Diagnostics } from '@/pages/Diagnostics'
import { Settings } from '@/pages/Settings'
import { WatchParty } from '@/pages/WatchParty'
import { SharedFolders } from '@/pages/SharedFolders'
import { About } from '@/pages/About'
import { AnimatePresence, motion } from 'framer-motion'
import { Upload } from 'lucide-react'
import { useRef, useState } from 'react'
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
import { useDevices } from '@/hooks/useDevices'
import { useTransfers } from '@/hooks/useTransfers'

const pages: Record<string, React.FC> = {
  '/dashboard': Dashboard,
  '/devices': Devices,
  '/sync': Sync,
  '/party': WatchParty,
  '/shared-folders': SharedFolders,
  '/transfers': Transfers,
  '/activity': Activity,
  '/history': History,
  '/diagnostics': Diagnostics,
  '/settings': Settings,
  '/about': About
}

export function MainLayout() {
  const { currentRoute } = useNavigation()
  const { isQRCodeModalOpen, toggleQRCodeModal } = useDevices()
  const { openShareWith, watchParty, closeWatchParty } = useShares()
  const { incomingPill, dismissIncomingPill, goToIncoming } = useTransfers()
  const { toast } = useToast()
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const Page = pages[currentRoute] || Dashboard

  // Files dropped anywhere on the window start a share — the app's primary
  // action, available everywhere (WeTransfer-style).
  const handleGlobalDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer?.files || [])
    if (!files.length) return
    const picked = files
      .map((f) => ({
        filePath: window.bridge?.getPathForFile?.(f) || '',
        filename: f.name,
        fileSize: f.size
      }))
      .filter((f) => f.filePath)
    if (!picked.length) {
      toast.error('Drop Failed', 'Could not resolve the dropped file path.')
      return
    }
    openShareWith({ files: picked })
  }

  return (
    <div
      className='relative flex h-screen overflow-hidden bg-background'
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
      <div className='flex flex-1 flex-col min-w-0'>
        <TopBar />
        <main className='flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6'>
          <div className='w-full pb-6'>
            <AnimatePresence mode='wait'>
              <motion.div
                key={currentRoute}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                <ErrorBoundary>
                  <Page />
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Global Overlays & Modals */}
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

      {/* Incoming transfer pill — non-intrusive, replaces forced nav */}
      {incomingPill && (
        <div className='fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full border border-primary/30 bg-card px-4 py-2 shadow-xl'>
          <span className='h-2 w-2 rounded-full bg-meshdrop-cyan animate-pulse' />
          <span className='text-xs font-bold text-foreground truncate max-w-[220px]'>{incomingPill}</span>
          <button onClick={goToIncoming} className='rounded-full bg-primary px-3 py-1 text-xs font-bold text-white'>View →</button>
          <button onClick={dismissIncomingPill} className='text-muted-foreground hover:text-foreground px-1'>✕</button>
        </div>
      )}

      {/* Drag-and-drop share overlay: pointer-events-none so the drop still
           lands on the window root above. */}
      {dragging && (
        <div className='pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-md transition-all'>
          <div className='flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-primary bg-card/95 p-12 text-center shadow-2xl animate-pulse'>
            <div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/30'>
              <Upload className='h-8 w-8' />
            </div>
            <div>
              <p className='text-lg font-black text-foreground'>Drop Files to Share Instantly</p>
              <p className='text-xs text-muted-foreground mt-1'>
                Direct peer-to-peer stream · End-to-end encrypted · No cloud intermediary
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
