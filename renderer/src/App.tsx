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
import { useState } from 'react'
import { hasSessionToken, isWeb } from '@/lib/capabilities'

// Standby screen for a browser page opened WITHOUT the launcher's ?t= token:
// no providers mount, so no RPC/WS traffic happens before the host session is
// known. (The host serves this page at "/"; the real session URL carries ?t=.)
// The UI must NEVER fetch a token unauthenticated — the only way back into a
// session is the launcher URL the host prints (it carries the one-time token).
function NoSessionScreen() {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const [copied, setCopied] = useState(false)
  const copyOrigin = async () => {
    try {
      await navigator.clipboard.writeText(origin)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable — the text stays visible to copy manually */
    }
  }
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
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🕸️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Session ended</h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#9aa2b1', margin: '0 0 4px' }}>
          Reopen MeshDrop from its shortcut or launcher to start a new session — a fresh
          one-time link is printed there.
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.6, color: '#6b7280', margin: '0 0 14px' }}>
          This tab cannot ask the host for a token by itself, and none is stored for it.
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            color: '#c7ced9'
          }}
          title='The token itself is never shown or sent'
        >
          <span>{origin || 'http://127.0.0.1'}/?t=</span>
          <span style={{ letterSpacing: 2, color: '#6b7280' }}>••••••••</span>
          <button
            onClick={copyOrigin}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              color: '#e8eaf0',
              borderRadius: 6,
              padding: '3px 8px',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit'
            }}
          >
            {copied ? 'Copied' : 'Copy address'}
          </button>
        </div>
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
