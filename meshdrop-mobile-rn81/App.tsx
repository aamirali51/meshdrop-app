/**
 * MeshDrop Mobile — Next-Generation P2P File & Folder Sync.
 * Pristine Light Design System & Mobile Ergonomics.
 *
 * @format
 */
import React, { useEffect, useState, useRef } from 'react'
import {
  StatusBar,
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  AppState,
  type AppStateStatus,
  Animated,
  Alert,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Laptop,
  Upload,
  Download,
  FolderSync,
  Activity,
  Settings as SettingsIcon,
  History as HistoryIcon,
  Zap,
  Radio,
  Sparkles,
  Sun,
  Moon,
  Tv,
} from 'lucide-react-native'
import { Devices } from './src/screens/Devices'
import { Sync } from './src/screens/Sync'
import { Share } from './src/screens/Share'
import { Receive } from './src/screens/Receive'
import { Transfers } from './src/screens/Transfers'
import { History } from './src/screens/History'
import { Diagnostics } from './src/screens/Diagnostics'
import { Settings } from './src/screens/Settings'
import { WatchParty } from './src/screens/WatchParty'
import { TransferApprovalDialog } from './src/components/TransferApprovalDialog'
import { FloatingTransferPill } from './src/components/FloatingTransferPill'
import { UpdateAvailableModal } from './src/components/UpdateAvailableModal'
import { WhatsNewModal } from './src/components/WhatsNewModal'
import { ShareTargetModal } from './src/components/ShareTargetModal'
import { WatchPartyModal } from './src/components/WatchPartyModal'
import { startBridge, watchNetworkChanges, on, call, probeNetwork } from './src/bridge'
import { initStore } from './src/store'
import { checkForUpdate, refreshVersion } from './src/updater'
import { getInitialShare, onShareReceived, clearInitialShare, type SharedPayload } from './src/shareTarget'
import { ThemeProvider, useTheme, fonts } from './src/theme'
import { Pill, PulseIndicator } from './src/components'
import {
  startBackgroundSync,
  showTransferOfferNotification,
  showTransferProgressNotification,
  showTransferCompleteNotification,
  cancelTransferNotification,
} from './src/backgroundService'

type TabType =
  | 'devices'
  | 'share'
  | 'party'
  | 'receive'
  | 'sync'
  | 'activity'
  | 'history'
  | 'diagnostics'
  | 'settings'

const TABS: { key: TabType; label: string; icon: React.ElementType }[] = [
  { key: 'devices', label: 'Swarm', icon: Radio },
  { key: 'share', label: 'Beam', icon: Upload },
  { key: 'party', label: 'Party', icon: Tv },
  { key: 'receive', label: 'Claim', icon: Download },
  { key: 'sync', label: 'Sync', icon: FolderSync },
  { key: 'activity', label: 'Live', icon: Activity },
  { key: 'history', label: 'Logs', icon: HistoryIcon },
  { key: 'settings', label: 'Node', icon: SettingsIcon },
]

function MainApp(): React.JSX.Element {
  const { theme, isDark, toggleTheme } = useTheme()
  const [currentTab, setCurrentTab] = useState<TabType>('devices')
  const [engineStatus, setEngineStatus] = useState<'starting' | 'ready' | 'error'>('starting')
  const [identity, setIdentity] = useState<any>(null)
  const [peerCount, setPeerCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string>('')

  // Incoming Transfer Approval State
  const [pendingApproval, setPendingApproval] = useState<any | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  // System Share Target State
  const [incomingShare, setIncomingShare] = useState<SharedPayload | null>(null)
  const appState = useRef<AppStateStatus>(AppState.currentState)
  const [watchParty, setWatchParty] = useState<{
    visible: boolean
    roomCode?: string
    roomTitle?: string
    transferId?: string
    filePath?: string
    isHost?: boolean
  }>({ visible: false })
  const [isPartyActive, setIsPartyActive] = useState(false)
  const { width, height } = useWindowDimensions()
  const isLandscape = width > height
  const hideAppChrome = (currentTab === 'party' && isPartyActive) || isLandscape
  // Avoid re-surfacing the update prompt on every background-resume.
  const updatePrompted = useRef(false)

  useEffect(() => {
    startBridge()
    watchNetworkChanges()
    initStore()
    startBackgroundSync().catch(() => {})

    // Check for initial system share target intent
    getInitialShare().then((payload) => {
      if (payload) setIncomingShare(payload)
    }).catch(() => {})

    const unsubShare = onShareReceived((payload) => {
      if (payload) setIncomingShare(payload)
    })

    // Store-free app update check: compare the hosted manifest to the running
    // build and surface an "Update available" modal if a newer APK exists.
    refreshVersion().then(setAppVersion).catch(() => {})
    checkForUpdate().then((info) => {
      if (info) updatePrompted.current = true
    }).catch(() => {})

    const unsubEngine = on('__engine', (msg: any) => {
      if (msg?.status === 'ready') {
        setEngineStatus('ready')
        if (msg.identity) setIdentity(msg.identity)
      } else if (msg?.status === 'error') {
        setEngineStatus('error')
        setErrorMessage(msg.message || 'Engine error')
      }
    })


    const unsubs = [
      'peer:connected',
      'peer:disconnected',
      'trust:paired',
    ].map((evt) =>
      on(evt, (data: any) => {
        if (typeof data?.peerCount === 'number') setPeerCount(data.peerCount)
      })
    )

    // A host deleted this device (or we were revoked mid-pairing). Surface it
    // immediately — otherwise the peer only discovers the deletion on its next
    // reconnect (revoked → refused auto-trust → must re-pair).
    const unsubRevoked = on('trust:revoked', (data: any) => {
      if (!data) return
      Alert.alert(
        'Device Removed',
        'You were removed from a device\'s trusted mesh. You can pair again with its current code.'
      )
      call('listDevices').catch(() => {})
    })

    const handleIncomingOffer = (data: any) => {
      if (!data) return
      setPendingApproval(data)
      const id = data.id || data.transferId || 'offer'
      const name = data.filename || 'Incoming File'
      const sender = data.peerName || data.senderIdentity?.name || 'Remote Peer'
      showTransferOfferNotification(
        id,
        'Incoming Peer Transfer',
        `From ${sender}: ${name}`
      ).catch(() => {})
    }

    const unsubOffer = on('transfer:offer', handleIncomingOffer)
    const unsubApproval = on('transfer:pending_approval', handleIncomingOffer)

    const unsubStarted = on('transfer:started', (data: any) => {
      if (!data || data.source === 'sync') return
      const id = data.id || data.transferId || 'active'
      const name = data.filename || 'File'
      const dirText = data.direction === 'send' ? 'Sending' : 'Receiving'
      showTransferProgressNotification(id, `${dirText} ${name}`, 'Starting…', 0, 100).catch(() => {})
    })

    let lastNotifTime = 0
    const unsubProgress = on('transfer:progress', (data: any) => {
      if (!data || data.source === 'sync') return
      const now = Date.now()
      if (now - lastNotifTime > 800) {
        lastNotifTime = now
        const id = data.id || 'active'
        const pct = Math.round(data.progress || 0)
        const speed = data.speed ? `${(data.speed / (1024 * 1024)).toFixed(1)} MB/s` : ''
        showTransferProgressNotification(
          id,
          'Transfer in progress…',
          `${pct}%${speed ? ` · ${speed}` : ''}`,
          pct,
          100
        ).catch(() => {})
      }
    })

    const unsubCompleted = on('transfer:completed', (data: any) => {
      if (!data || data.source === 'sync') return
      const id = data.id || 'completed'
      const name = data.filename || 'File'
      const isSend = data.direction === 'send' || data.isSender
      showTransferCompleteNotification(
        id,
        'Transfer Complete',
        isSend ? `Sent ${name} successfully` : `Received ${name} successfully`
      ).catch(() => {})
    })

    let lastSyncNotif = 0
    const unsubSyncScan = on('sync:scan', (data: any) => {
      if (!data || !data.changed) return
      const now = Date.now()
      if (now - lastSyncNotif > 5000) {
        lastSyncNotif = now
        showTransferProgressNotification(
          'sync-active',
          'Syncing Folder…',
          `${data.changed} change(s) detected`,
          50,
          100
        ).catch(() => {})
      }
    })

    const unsubSyncUpToDate = on('sync:up_to_date', () => {
      cancelTransferNotification('sync-active').catch(() => {})
    })

    // Desktop-initiated sync folders arrive as invites. The desktop auto-accepts
    // invites from trusted peers by default (autoAcceptOffers), so the mobile
    // adopts the same behavior: accept into the engine's default Sync/<name>
    // folder and let the Sync screen surface it. Incoming file *transfers* still
    // go through manual approval via autoAcceptOffers:false.
    const unsubSyncInvite = on('sync:invite:received', (data: any) => {
      if (!data || !data.id) return
      call('acceptSyncInvite', {
        id: data.id,
        customPath: data.defaultPath || undefined,
      })
        .then(() => {
          showTransferCompleteNotification(
            `sync-invite-${data.id}`,
            'Sync Folder Linked',
            `"${data.name || 'Sync Folder'}" from ${data.peerName || 'a paired device'} is now syncing.`
          ).catch(() => {})
        })
        .catch(() => {})
    })

    const unsubFailed = on('transfer:failed', (data: any) => {
      if (!data) return
      const id = data.id || 'failed'
      cancelTransferNotification(id).catch(() => {})
    })

    const unsubCancelled = on('transfer:cancelled', (data: any) => {
      if (!data) return
      const id = data.id || 'cancelled'
      cancelTransferNotification(id).catch(() => {})
    })

    const subAppState = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        call('listDevices').catch(() => {})
        call('getIdentity').then((res: any) => {
          if (res) setIdentity(res)
        }).catch(() => {})
        probeNetwork()
        if (!updatePrompted.current) {
          checkForUpdate().then((info) => {
            if (info) updatePrompted.current = true
          }).catch(() => {})
        }
      }
      appState.current = nextAppState
    })

    const unsubWatch = on('watch:state:updated', (data: any) => {
      if (data && (data.roomCode || data.action === 'play')) {
        setWatchParty((prev) => ({
          visible: true,
          roomCode: data.roomCode || prev.roomCode || 'PARTY-MESH-P2P',
          roomTitle: data.roomTitle || prev.roomTitle || 'Synchronized Mesh Stream',
          transferId: data.transferId || prev.transferId,
          filePath: data.filePath || prev.filePath,
          isHost: false,
        }))
      }
    })

    return () => {
      unsubEngine()
      unsubs.forEach((u) => u())
      unsubRevoked()
      unsubOffer()
      unsubApproval()
      unsubStarted()
      unsubProgress()
      unsubCompleted()
      unsubFailed()
      unsubCancelled()
      unsubSyncScan()
      unsubSyncUpToDate()
      unsubSyncInvite()
      unsubWatch()
      subAppState.remove()
    }
  }, [])

  const handleAcceptTransfer = (id: string) => {
    call('acceptTransfer', { id }).catch(() => {})
    setPendingApproval(null)
  }

  const handleDeclineTransfer = (id: string) => {
    call('declineTransfer', { id }).catch(() => {})
    setPendingApproval(null)
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: hideAppChrome ? '#000000' : theme.bg }]}
      edges={hideAppChrome ? [] : ['top', 'left', 'right']}
    >
      <StatusBar
        hidden={hideAppChrome}
        barStyle={theme.statusBarStyle}
        backgroundColor={hideAppChrome ? '#000000' : theme.statusBarBg}
      />

      {/* Top Sentinel HUD Header (Hidden in active party or landscape) */}
      {!hideAppChrome && (
        <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
          <View style={styles.brandRow}>
            <View style={[styles.logoBadge, { backgroundColor: theme.primary, shadowColor: theme.primary }]}>
              <Zap size={17} color="#FFFFFF" />
            </View>
            <View>
              <View style={styles.brandTitleRow}>
                <Text style={[styles.brand, { color: theme.text }]}>MeshDrop</Text>
                <View style={[styles.versionPill, { backgroundColor: theme.primarySoft }]}>
                  <Text style={[styles.versionText, { color: theme.primary }]}>
                    {appVersion ? `v${appVersion}` : ''}
                  </Text>
                </View>
              </View>
              <Text style={[styles.tagline, { color: theme.textSecondary }]} numberOfLines={1}>
                {identity?.name ? `${identity.name} · Encrypted P2P` : 'Decentralized P2P Mesh'}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setCurrentTab('diagnostics')}
              style={[styles.statusPillBtn, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
            >
              <View style={styles.statusInner}>
                <PulseIndicator
                  color={
                    engineStatus === 'ready'
                      ? theme.success
                      : engineStatus === 'starting'
                      ? theme.warning
                      : theme.danger
                  }
                  size={7}
                />
                <Text
                  style={[
                    styles.statusLabel,
                    {
                      color:
                        engineStatus === 'ready'
                          ? theme.success
                          : engineStatus === 'starting'
                          ? theme.warning
                          : theme.danger,
                    },
                  ]}
                >
                  {engineStatus === 'ready'
                    ? peerCount > 0
                      ? `${peerCount} ${peerCount === 1 ? 'Peer' : 'Peers'}`
                      : 'Online'
                    : engineStatus === 'starting'
                    ? 'Booting…'
                    : 'Offline'}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={toggleTheme}
              style={[styles.headerIconBtn, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
            >
              {isDark ? (
                <Sun size={16} color={theme.warning} />
              ) : (
                <Moon size={16} color={theme.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setCurrentTab('settings')}
              style={[
                styles.headerIconBtn,
                { backgroundColor: theme.bgElevated, borderColor: theme.border },
                currentTab === 'settings' && { borderColor: theme.primary, backgroundColor: theme.primarySoft },
              ]}
            >
              <SettingsIcon
                size={17}
                color={currentTab === 'settings' ? theme.primary : theme.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Error Banner */}
      {!hideAppChrome && engineStatus === 'error' && !!errorMessage && (
        <View style={[styles.errorBanner, { backgroundColor: theme.dangerBg, borderColor: theme.dangerBorder }]}>
          <Text style={[styles.errorBannerText, { color: theme.danger }]}>⚠️ {errorMessage}</Text>
        </View>
      )}

      {/* Screen Body */}
      <View style={[styles.body, { backgroundColor: hideAppChrome ? '#000000' : theme.bg }]}>
        {currentTab === 'devices' && <Devices identity={identity} />}
        {currentTab === 'share' && <Share />}
        {currentTab === 'party' && <WatchParty onActiveRoomChange={setIsPartyActive} />}
        {currentTab === 'receive' && <Receive />}
        {currentTab === 'sync' && <Sync identity={identity} />}
        {currentTab === 'activity' && <Transfers />}
        {currentTab === 'history' && <History />}
        {currentTab === 'diagnostics' && <Diagnostics identity={identity} />}
        {currentTab === 'settings' && <Settings identity={identity} />}
      </View>

      <TransferApprovalDialog
        visible={Boolean(pendingApproval)}
        transfer={pendingApproval}
        onAccept={handleAcceptTransfer}
        onDecline={handleDeclineTransfer}
        onClose={() => setPendingApproval(null)}
      />

      {!hideAppChrome && <FloatingTransferPill onExpand={() => setCurrentTab('activity')} />}

      <UpdateAvailableModal />

      <WhatsNewModal />

      <ShareTargetModal
        visible={Boolean(incomingShare)}
        payload={incomingShare}
        onClose={() => {
          setIncomingShare(null)
          clearInitialShare()
        }}
      />

      <WatchPartyModal
        visible={watchParty.visible}
        roomCode={watchParty.roomCode}
        roomTitle={watchParty.roomTitle}
        transferId={watchParty.transferId}
        filePath={watchParty.filePath}
        isHost={watchParty.isHost}
        onClose={() => setWatchParty({ visible: false })}
      />

      {/* Floating Luminous Bottom Navigation Dock */}
      {!hideAppChrome && (
        <View style={styles.dockContainer}>
          <View
            style={[
              styles.dockBar,
              {
                backgroundColor: theme.dockBg,
                borderColor: theme.border,
                shadowColor: theme.shadowLg?.shadowColor || '#000',
              },
            ]}
          >
            {TABS.map((tab) => {
              const isActive = currentTab === tab.key
              const IconComponent = tab.icon
              return (
                <TouchableOpacity
                  key={tab.key}
                  activeOpacity={0.75}
                  onPress={() => setCurrentTab(tab.key)}
                  style={[styles.dockItem, isActive && { backgroundColor: theme.primarySoft }]}
                >
                  <View style={styles.dockIconBox}>
                    <IconComponent
                      size={16}
                      color={isActive ? theme.primary : theme.muted}
                    />
                  </View>
                  <Text
                    style={[
                      styles.dockLabel,
                      { color: theme.muted },
                      isActive && { color: theme.primary, fontWeight: '900' },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      )}
    </SafeAreaView>
  )
}

export default function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brand: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  versionPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  versionText: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: fonts.mono,
  },
  tagline: {
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPillBtn: {
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 9999,
  },
  statusInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: fonts.mono,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  errorBanner: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorBannerText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dockContainer: {
    paddingHorizontal: 12,
    paddingBottom: 6,
    paddingTop: 2,
    backgroundColor: 'transparent',
  },
  dockBar: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  dockItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  dockIconBox: {
    width: 28,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dockLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
})

