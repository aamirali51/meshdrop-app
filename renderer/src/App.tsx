import { ThemeProvider } from '@/hooks/useTheme'
import { NavigationProvider } from '@/hooks/useNavigation'
import { DataProviders } from '@/hooks/DataProviders'
import { SyncProvider } from '@/hooks/useSync'
import { SharedFoldersProvider } from '@/hooks/useSharedFolders'
import { TunnelsProvider } from '@/hooks/useTunnels'
import { ToastProvider } from '@/hooks/useToast'
import { ToastContainer } from '@/components/Toast'
import { UpdateToaster } from '@/components/UpdateToaster'
import { PortableBanner } from '@/components/PortableBanner'
import { WelcomeModal } from '@/components/WelcomeModal'
import { QuickSendModal } from '@/components/QuickSendModal'
import { LanPairPrompt } from '@/components/LanPairPrompt'
import { MainLayout } from '@/layouts/MainLayout'
import { MotionConfig } from 'framer-motion'
import { hasSessionToken, isWeb } from '@/lib/capabilities'

// Standby screen for a browser page opened WITHOUT the launcher's ?t= token:
// no providers mount, so no RPC/WS traffic happens before the host session is
// known. (The host serves this page at "/"; the real session URL carries ?t=.)
function NoSessionScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#14171d',
        color: '#e8eaf0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: 24
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🕸️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>MeshDrop is running</h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#9aa2b1', margin: 0 }}>
          This page has no session. Open MeshDrop from its shortcut or launcher to start the app
          with a secure session link.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (isWeb && !hasSessionToken()) return <NoSessionScreen />
  return (
    <MotionConfig reducedMotion='user'>
      <ToastProvider>
        <ThemeProvider>
          <NavigationProvider>
            <DataProviders>
              <SyncProvider>
                <SharedFoldersProvider>
                  <TunnelsProvider>
                    <MainLayout />
                  </TunnelsProvider>
                  <WelcomeModal />
                  <QuickSendModal />
                  <LanPairPrompt />
                  <UpdateToaster />
                  <PortableBanner />
                  <ToastContainer />
                </SharedFoldersProvider>
              </SyncProvider>
            </DataProviders>
          </NavigationProvider>
        </ThemeProvider>
      </ToastProvider>
    </MotionConfig>
  )
}
