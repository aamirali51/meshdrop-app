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
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true)
  const [copied, setCopied] = useState(false)
  const copyOrigin = async () => {
    try {
      await navigator.clipboard.writeText(origin)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }
  const tryRecover = () => {
    try {
      const tok = sessionStorage.getItem('meshdrop_token')
      if (tok) {
        const url = new URL(window.location.href)
        url.searchParams.set('t', tok)
        window.location.replace(url.toString())
        return
      }
    } catch {}
    window.location.reload()
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
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#9aa2b1', margin: '0 0 6px' }}>
          This tab has no session token. The host is still running - open it with the launch URL that carries <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: 6 }}> ?t= </code>.
          In the in-app browser, paste the URL from the host log.
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.6, color: '#6b7280', margin: '0 0 10px' }}>
          Tip: if you refreshed and lost <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 5 }}> ?t= </code>, hit Retry - it may still be in this tab's storage.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <button
            onClick={tryRecover}
            style={{
              background: '#6366F1',
              border: 'none',
              color: '#fff',
              borderRadius: 10,
              padding: '10px 18px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'inherit'
            }}
          >
            Retry - recover session
          </button>
          <button
            onClick={copyOrigin}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#e8eaf0',
              borderRadius: 10,
              padding: '10px 14px',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'inherit'
            }}
          >
            {copied ? 'Copied' : 'Copy host address'}
          </button>
        </div>
        {isStandalone && (
          <p style={{ fontSize: 12, lineHeight: 1.6, color: '#f59e0b', margin: '0 0 10px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '8px 10px' }}>
            Installed mode still needs the host token. Reopen from the launcher so the one-time token is present.
          </p>
        )}
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
          <span style={{ letterSpacing: 2, color: '#6b7280' }}>........</span>
        </div>
        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 10 }}>
          Host log shows: <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 6 }}>UI ready: http://127.0.0.1:PORT/?t=TOKEN</code>
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
