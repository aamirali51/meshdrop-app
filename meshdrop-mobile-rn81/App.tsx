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
} from 'lucide-react-native'
import { Devices } from './src/screens/Devices'
import { Sync } from './src/screens/Sync'
import { Share } from './src/screens/Share'
import { Receive } from './src/screens/Receive'
import { Transfers } from './src/screens/Transfers'
import { History } from './src/screens/History'
import { Diagnostics } from './src/screens/Diagnostics'
import { Settings } from './src/screens/Settings'
import { TransferApprovalDialog } from './src/components/TransferApprovalDialog'
import { FloatingTransferPill } from './src/components/FloatingTransferPill'
import { UpdateAvailableModal } from './src/components/UpdateAvailableModal'
import { startBridge, watchNetworkChanges, on, call, probeNetwork } from './src/bridge'
import { initStore } from './src/store'
import { checkForUpdate, refreshVersion } from './src/updater'
import { theme, fonts } from './src/theme'
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
  | 'receive'
  | 'sync'
  | 'activity'
  | 'history'
  | 'diagnostics'
  | 'settings'

const TABS: { key: TabType; label: string; icon: React.ElementType }[] = [
  { key: 'devices', label: 'Swarm', icon: Radio },
  { key: 'share', label: 'Beam', icon: Upload },
  { key: 'receive', label: 'Claim', icon: Download },
  { key: 'sync', label: 'Sync', icon: FolderSync },
  { key: 'activity', label: 'Live', icon: Activity },
  { key: 'history', label: 'Logs', icon: HistoryIcon },
  { key: 'settings', label: 'Node', icon: SettingsIcon },
]

function App(): React.JSX.Element {
  const [currentTab, setCurrentTab] = useState<TabType>('devices')
  const [engineStatus, setEngineStatus] = useState<'starting' | 'ready' | 'error'>('starting')
  const [identity, setIdentity] = useState<any>(null)
  const [peerCount, setPeerCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string>('')

  // Incoming Transfer Approval State
  const [pendingApproval, setPendingApproval] = useState<any | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const appState = useRef<AppStateStatus>(AppState.currentState)
  // Avoid re-surfacing the update prompt on every background-resume.
  const updatePrompted = useRef(false)

  useEffect(() => {
    startBridge()
    watchNetworkChanges()
    initStore()
    startBackgroundSync().catch(() => {})

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
        // Re-probe the active transport: ConnectivityManager callbacks are not
        // replayed to a frozen process, so a switch that happened while the
        // app was backgrounded would otherwise leave the swarm bound to a dead
        // interface. checkNow() only emits when the signature changed.
        probeNetwork()
        if (!updatePrompted.current) {
          checkForUpdate().then((info) => {
            if (info) updatePrompted.current = true
          }).catch(() => {})
        }
      }
      appState.current = nextAppState
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
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Sentinel HUD Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Zap size={17} color="#FFFFFF" />
          </View>
          <View>
            <View style={styles.brandTitleRow}>
              <Text style={styles.brand}>MeshDrop</Text>
              <View style={styles.versionPill}>
                <Text style={styles.versionText}>
                  {appVersion ? `v${appVersion}` : ''}
                </Text>
              </View>
            </View>
            <Text style={styles.tagline} numberOfLines={1}>
              {identity?.name ? `${identity.name} · Encrypted P2P` : 'Decentralized P2P Mesh'}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setCurrentTab('diagnostics')}
            style={styles.statusPillBtn}
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
            onPress={() => setCurrentTab('settings')}
            style={[
              styles.headerIconBtn,
              currentTab === 'settings' && styles.headerIconBtnActive,
            ]}
          >
            <SettingsIcon
              size={17}
              color={currentTab === 'settings' ? theme.primary : theme.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Error Banner */}
      {engineStatus === 'error' && !!errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠️ {errorMessage}</Text>
        </View>
      )}

      {/* Screen Body */}
      <View style={styles.body}>
        {currentTab === 'devices' && <Devices identity={identity} />}
        {currentTab === 'share' && <Share />}
        {currentTab === 'receive' && <Receive />}
        {currentTab === 'sync' && <Sync identity={identity} />}
        {currentTab === 'activity' && <Transfers />}
        {currentTab === 'history' && <History />}
        {currentTab === 'diagnostics' && <Diagnostics identity={identity} />}
        {currentTab === 'settings' && <Settings identity={identity} />}
      </View>

      {/* Global Transfer Approval Dialog */}
      <TransferApprovalDialog
        visible={Boolean(pendingApproval)}
        transfer={pendingApproval}
        onAccept={handleAcceptTransfer}
        onDecline={handleDeclineTransfer}
        onClose={() => setPendingApproval(null)}
      />

      {/* Global Non-Intrusive Floating Transfer Pill */}
      <FloatingTransferPill onExpand={() => setCurrentTab('activity')} />

      {/* Global Optional "Update available" Modal (store-free APK updater) */}
      <UpdateAvailableModal />

      {/* Floating Luminous Bottom Navigation Dock */}
      <View style={styles.dockContainer}>
        <View style={styles.dockBar}>
          {TABS.map((tab) => {
            const isActive = currentTab === tab.key
            const IconComponent = tab.icon
            return (
              <TouchableOpacity
                key={tab.key}
                activeOpacity={0.75}
                onPress={() => setCurrentTab(tab.key)}
                style={[styles.dockItem, isActive && styles.dockItemActive]}
              >
                <View
                  style={[
                    styles.dockIconBox,
                    isActive && styles.dockIconBoxActive,
                  ]}
                >
                  <IconComponent
                    size={16}
                    color={isActive ? theme.primary : theme.muted}
                  />
                </View>
                <Text
                  style={[
                    styles.dockLabel,
                    isActive && styles.dockLabelActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.primary,
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
    color: theme.text,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  versionPill: {
    backgroundColor: theme.primarySoft,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  versionText: {
    color: theme.primary,
    fontSize: 9,
    fontWeight: '900',
    fontFamily: fonts.mono,
  },
  tagline: {
    color: theme.textSecondary,
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
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: theme.radiusFull,
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
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  body: {
    flex: 1,
  },
  errorBanner: {
    backgroundColor: theme.dangerBg,
    borderColor: theme.dangerBorder,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorBannerText: {
    color: theme.danger,
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
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusLg,
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#0F172A',
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
  dockItemActive: {
    backgroundColor: theme.primarySoft,
  },
  dockIconBox: {
    width: 28,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dockIconBoxActive: {
    backgroundColor: 'transparent',
  },
  dockLabel: {
    color: theme.muted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  dockLabelActive: {
    color: theme.primary,
    fontWeight: '900',
  },
})

export default App
