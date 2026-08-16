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
import { useDevices } from '@/hooks/useDevices'

const pages: Record<string, React.FC> = {
  '/dashboard': Dashboard,
  '/devices': Devices,
  '/sync': Sync,
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
  const { openShareWith } = useShares()
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
      <TransferApprovalDialog />
      <SyncInviteModal />

      {/* Drag-and-drop share overlay: pointer-events-none so the drop still
          lands on the window root above. */}
      {dragging && (
        <div className='pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm'>
          <div className='flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary/60 bg-card/90 px-10 py-8 text-center shadow-2xl'>
            <Upload className='h-10 w-10 text-primary' />
            <p className='text-base font-black text-foreground'>Drop to share</p>
            <p className='text-xs text-muted-foreground'>
              Files go device-to-device — no cloud, no account
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
