import { ThemeProvider } from '@/hooks/useTheme'
import { NavigationProvider } from '@/hooks/useNavigation'
import { DataProviders } from '@/hooks/DataProviders'
import { SyncProvider } from '@/hooks/useSync'
import { ToastProvider } from '@/hooks/useToast'
import { ToastContainer } from '@/components/Toast'
import { UpdateToaster } from '@/components/UpdateToaster'
import { PortableBanner } from '@/components/PortableBanner'
import { WelcomeModal } from '@/components/WelcomeModal'
import { QuickSendModal } from '@/components/QuickSendModal'
import { MainLayout } from '@/layouts/MainLayout'
import { MotionConfig } from 'framer-motion'

export default function App() {
  return (
    <MotionConfig reducedMotion='user'>
      <ToastProvider>
        <ThemeProvider>
          <NavigationProvider>
            <DataProviders>
              <SyncProvider>
                <MainLayout />
                <WelcomeModal />
                <QuickSendModal />
                <UpdateToaster />
                <PortableBanner />
                <ToastContainer />
              </SyncProvider>
            </DataProviders>
          </NavigationProvider>
        </ThemeProvider>
      </ToastProvider>
    </MotionConfig>
  )
}

