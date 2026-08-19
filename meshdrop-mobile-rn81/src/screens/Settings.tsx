import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native'
import {
  ShieldCheck,
  Bell,
  HardDrive,
  Wifi,
  Radio,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Info,
  Zap,
  Lock,
  Layers,
  Sparkles,
  Smartphone,
  Cpu,
  FileText,
  Clock,
  FolderSync,
  Heart,
  QrCode,
} from 'lucide-react-native'
import { call, on } from '../bridge'
import {
  Card,
  Btn,
  Pill,
  SectionHeader,
  DeviceAvatar,
} from '../components'
import { QRCodeModal } from '../components/QRCodeModal'
import {
  checkAllPermissions,
  requestAllPermissions,
  requestStoragePermission,
  requestNotificationPermission,
  requestNearbyWifiPermission,
  openAppSettings,
  type PermissionStatus,
} from '../permissions'
import {
  startBackgroundSync,
  stopBackgroundSync,
  isBackgroundSyncRunning,
  isBatteryOptimizationIgnored,
  requestIgnoreBatteryOptimizations,
} from '../backgroundService'
import { theme, fonts } from '../theme'
import { copyToClipboard } from '../clipboard'
import {
  checkForUpdate,
  refreshVersion,
  isUpdaterSupported,
} from '../updater'

export function Settings({ identity }: { identity?: any }) {
  const [permissions, setPermissions] = useState<PermissionStatus>({
    storage: false,
    notifications: false,
    nearbyDevices: false,
  })
  const [checkingPerms, setCheckingPerms] = useState(false)

  // Preferences
  const [autoAcceptTrusted, setAutoAcceptTrusted] = useState(false)
  const [preferOwnRelay, setPreferOwnRelay] = useState(false)
  const [backgroundKeepAlive, setBackgroundKeepAlive] = useState(true)
  const [batteryIgnored, setBatteryIgnored] = useState(true)

  // Paths & Diagnostics
  const [downloadsPath, setDownloadsPath] = useState<string>('')
  const [copiedKey, setCopiedKey] = useState(false)
  const [systemInfo, setSystemInfo] = useState<any>(null)
  const [storageStats, setStorageStats] = useState<any>(null)
  const [installedVersion, setInstalledVersion] = useState<string | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [showBtcQr, setShowBtcQr] = useState(false)
  const [copiedBtc, setCopiedBtc] = useState(false)

  const BITCOIN_ADDRESS = '12bNXZEg6vDtJZUMdauhkvUqg92UPeWJfs'

  const handleCopyBtc = async () => {
    const ok = await copyToClipboard(BITCOIN_ADDRESS)
    setCopiedBtc(true)
    setTimeout(() => setCopiedBtc(false), 2500)
    Alert.alert(
      'Bitcoin Address Copied',
      ok ? '12bNXZEg6vDtJZUMdauhkvUqg92UPeWJfs copied to clipboard. Thank you for supporting MeshDrop!' : 'Could not access clipboard.'
    )
  }

  const refreshPermissions = useCallback(async () => {
    setCheckingPerms(true)
    try {
      const p = await checkAllPermissions()
      setPermissions(p)
      const bat = await isBatteryOptimizationIgnored()
      setBatteryIgnored(bat)
      const running = await isBackgroundSyncRunning()
      setBackgroundKeepAlive(running)
    } finally {
      setCheckingPerms(false)
    }
  }, [])

  const handleToggleBackgroundKeepAlive = async (enable: boolean) => {
    setBackgroundKeepAlive(enable)
    if (enable) {
      await startBackgroundSync()
    } else {
      await stopBackgroundSync()
    }
  }

  const handleToggleAutoAccept = (enable: boolean) => {
    setAutoAcceptTrusted(enable)
    call('setAutoAcceptOffers', { enabled: enable }).catch(() => {})
  }

  const handleTogglePreferOwnRelay = (enable: boolean) => {
    setPreferOwnRelay(enable)
    call('setPreferOwnRelay', { enabled: enable }).catch(() => {})
  }

  const handleRequestBatteryExemption = async () => {
    const res = await requestIgnoreBatteryOptimizations()
    if (res) {
      const bat = await isBatteryOptimizationIgnored()
      setBatteryIgnored(bat)
    }
  }

  useEffect(() => {
    refreshPermissions()
    if (isUpdaterSupported()) {
      refreshVersion().then((v) => setInstalledVersion(v)).catch(() => {})
    }
    call('getPaths')
      .then((p: any) => {
        if (p?.downloads) setDownloadsPath(p.downloads)
      })
      .catch(() => {})

    call('getStatus')
      .then((s: any) => {
        setSystemInfo(s)
      })
      .catch(() => {})

    // Load the real, persisted engine preference for auto-accept.
    call('getSettings')
      .then((s: any) => {
        if (s && typeof s.autoAcceptOffers === 'boolean') setAutoAcceptTrusted(s.autoAcceptOffers)
        if (s && typeof s.preferOwnRelay === 'boolean') setPreferOwnRelay(s.preferOwnRelay)
      })
      .catch(() => {})

    call('getStorageStats')
      .then((s: any) => setStorageStats(s))
      .catch(() => {})
  }, [refreshPermissions])

  const handleClearTransferLog = async () => {
    Alert.alert('Clear Transfer Log', 'Remove all completed/failed transfer records? Files on disk are NOT deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            await call('clearTransferLog')
            const s = await call('getStorageStats')
            setStorageStats(s)
            Alert.alert('Done', 'Transfer log cleared.')
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Could not clear the transfer log.')
          }
        },
      },
    ])
  }

  const handleCompactStorage = async () => {
    Alert.alert(
      'Compress Engine Data',
      'Rebuild the metadata store to reclaim space from old sync index versions. Your device identity may change and devices may need re-pairing. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Compress',
          style: 'destructive',
          onPress: async () => {
            try {
              await call('compactStorage')
              const s = await call('getStorageStats')
              setStorageStats(s)
              Alert.alert('Done', 'Engine metadata rebuilt — space reclaimed.')
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Could not compress engine data.')
            }
          },
        },
      ]
    )
  }

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true)
    try {
      const info = await checkForUpdate()
      if (!info) {
        Alert.alert('Up to date', 'You are running the latest available build.')
      }
      // If an update IS available the shared updater store flips to "available"
      // and the global UpdateAvailableModal surfaces automatically.
    } finally {
      setCheckingUpdate(false)
    }
  }

  function formatBytes(bytes?: number): string {
    if (!bytes || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    let val = bytes
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024
      i++
    }
    return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
  }

  const copyPublicKey = async () => {
    if (!identity?.publicKey) return
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
    const ok = await copyToClipboard(identity.publicKey)
    Alert.alert(
      'Noise Key',
      ok
        ? 'Public key copied to clipboard.'
        : 'Clipboard is not available on this build.'
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Node Identity Hero Profile */}
      <Card glow style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <DeviceAvatar
            name={identity?.name || 'Local Node'}
            isOnline={true}
            size={52}
            isTrusted={true}
          />
          <View style={styles.flex1}>
            <Text style={styles.profileName}>{identity?.name || 'Local Mesh Node'}</Text>
            <Text style={styles.profileSub}>
              Hyperswarm Sovereign Node · End-to-End Encrypted
            </Text>
          </View>
        </View>

        <View style={styles.keyBox}>
          <View style={styles.keyLabelRow}>
            <Lock size={12} color={theme.primary} />
            <Text style={styles.keyLabel}>Noise Cryptographic Public Key</Text>
          </View>
          <Text style={styles.keyText} numberOfLines={1} ellipsizeMode="middle">
            {identity?.publicKey || 'Generating cryptographically secure Noise key…'}
          </Text>
          <TouchableOpacity
            style={styles.copyKeyBtn}
            onPress={copyPublicKey}
            activeOpacity={0.7}
          >
            {copiedKey ? (
              <Check size={13} color={theme.success} />
            ) : (
              <Copy size={13} color={theme.primary} />
            )}
            <Text style={styles.copyKeyText}>{copiedKey ? 'Copied' : 'Copy Key'}</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Background Sentinel & Sync Guardian */}
      <SectionHeader title="Background Sentinel" />
      <Card style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.flex1}>
            <Text style={styles.switchTitle}>Background Mesh Engine</Text>
            <Text style={styles.switchSub}>
              Keep P2P DHT listening active when app is minimized
            </Text>
          </View>
          <Switch
            value={backgroundKeepAlive}
            onValueChange={handleToggleBackgroundKeepAlive}
            trackColor={{ false: '#E2E8F0', true: theme.primarySoft }}
            thumbColor={backgroundKeepAlive ? theme.primary : '#94A3B8'}
          />
        </View>

        <View style={[styles.switchRow, styles.borderTop]}>
          <View style={styles.flex1}>
            <Text style={styles.switchTitle}>Battery Optimization Exemption</Text>
            <Text style={styles.switchSub}>
              {batteryIgnored ? 'Exempted (High Reliability)' : 'Subject to OS throttling'}
            </Text>
          </View>
          {!batteryIgnored && (
            <TouchableOpacity
              style={styles.exemptionBtn}
              onPress={handleRequestBatteryExemption}
              activeOpacity={0.8}
            >
              <Text style={styles.exemptionBtnText}>Request</Text>
            </TouchableOpacity>
          )}
        </View>
      </Card>

      {/* Engine Storage & History */}
      <SectionHeader title="Engine Storage" />
      <Card style={styles.card}>
        <View style={styles.permRow}>
          <View style={styles.permInfo}>
            <HardDrive size={16} color={theme.primary} />
            <Text style={styles.permName}>Engine Data Size</Text>
          </View>
          <Text style={styles.statValue}>{formatBytes(storageStats?.sizeBytes)}</Text>
        </View>
        <View style={[styles.permRow, styles.borderTop]}>
          <View style={styles.permInfo}>
            <FileText size={16} color={theme.accent} />
            <Text style={styles.permName}>Transfer Records</Text>
          </View>
          <Text style={styles.statValue}>{storageStats?.transfers ?? 0}</Text>
        </View>
        <View style={[styles.permRow, styles.borderTop]}>
          <View style={styles.permInfo}>
            <Clock size={16} color={theme.purple} />
            <Text style={styles.permName}>History Entries</Text>
          </View>
          <Text style={styles.statValue}>{storageStats?.history ?? 0}</Text>
        </View>
        <View style={[styles.permRow, styles.borderTop]}>
          <View style={styles.permInfo}>
            <FolderSync size={16} color={theme.success} />
            <Text style={styles.permName}>Sync Libraries</Text>
          </View>
          <Text style={styles.statValue}>{storageStats?.syncLibraries ?? 0}</Text>
        </View>
        <View style={[styles.permRow, styles.borderTop]}>
          <View style={styles.flex1}>
            <Text style={styles.switchTitle}>Clear Transfer Log</Text>
            <Text style={styles.switchSub}>
              Remove completed/failed transfer records to reclaim metadata space
            </Text>
          </View>
          <TouchableOpacity
            style={styles.exemptionBtn}
            onPress={handleClearTransferLog}
            activeOpacity={0.8}
          >
            <Text style={styles.exemptionBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.permRow, styles.borderTop]}>
          <View style={styles.flex1}>
            <Text style={styles.switchTitle}>Compress Engine Data</Text>
            <Text style={styles.switchSub}>
              Rebuild metadata to reclaim space from old sync index versions
            </Text>
          </View>
          <TouchableOpacity
            style={styles.exemptionBtn}
            onPress={handleCompactStorage}
            activeOpacity={0.8}
          >
            <Text style={styles.exemptionBtnText}>Compress</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Permissions Deck */}
      <SectionHeader title="Device Permissions" />
      <Card style={styles.card}>
        <View style={styles.permRow}>
          <View style={styles.permInfo}>
            <HardDrive size={16} color={theme.primary} />
            <Text style={styles.permName}>Storage Access</Text>
          </View>
          <Pill
            label={permissions.storage ? 'Granted' : 'Required'}
            color={permissions.storage ? theme.success : theme.danger}
          />
        </View>

        <View style={[styles.permRow, styles.borderTop]}>
          <View style={styles.permInfo}>
            <Bell size={16} color={theme.purple} />
            <Text style={styles.permName}>Push Notifications</Text>
          </View>
          <Pill
            label={permissions.notifications ? 'Active' : 'Disabled'}
            color={permissions.notifications ? theme.success : theme.warning}
          />
        </View>

        <View style={[styles.permRow, styles.borderTop]}>
          <View style={styles.permInfo}>
            <Radio size={16} color={theme.accent} />
            <Text style={styles.permName}>Nearby Device Discovery</Text>
          </View>
          <Pill
            label={permissions.nearbyDevices ? 'Active' : 'Optional'}
            color={permissions.nearbyDevices ? theme.success : theme.muted}
          />
        </View>

        <Btn
          label="Review App Permissions"
          icon={ExternalLink}
          variant="secondary"
          size="sm"
          onPress={openAppSettings}
          style={{ marginTop: 12 }}
        />
      </Card>

      {/* Node Preferences */}
      <SectionHeader title="Transmission Policy" />
      <Card style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.flex1}>
            <Text style={styles.switchTitle}>Auto-Accept Trusted Transfers</Text>
            <Text style={styles.switchSub}>
              Automatically download payloads from verified peers
            </Text>
          </View>
          <Switch
            value={autoAcceptTrusted}
            onValueChange={handleToggleAutoAccept}
            trackColor={{ false: '#E2E8F0', true: theme.primarySoft }}
            thumbColor={autoAcceptTrusted ? theme.primary : '#94A3B8'}
          />
        </View>

        <View style={[styles.switchRow, styles.borderTop]}>
          <View style={styles.flex1}>
            <Text style={styles.switchTitle}>Prefer My Devices as Relay</Text>
            <Text style={styles.switchSub}>
              When a direct connection fails, tunnel through your own online desktop before
              public relays. Private to your mesh.
            </Text>
          </View>
          <Switch
            value={preferOwnRelay}
            onValueChange={handleTogglePreferOwnRelay}
            trackColor={{ false: '#E2E8F0', true: theme.primarySoft }}
            thumbColor={preferOwnRelay ? theme.primary : '#94A3B8'}
          />
        </View>

        <View style={[styles.switchRow, styles.borderTop]}>
          <View style={styles.flex1}>
            <Text style={styles.switchTitle}>LAN Multicast Discovery</Text>
            <Text style={styles.switchSub}>
              Unavailable on this build — DHT-based Hyperswarm discovery stays active
            </Text>
          </View>
          <Pill label="DHT" color={theme.muted} />
        </View>

        <View style={[styles.switchRow, styles.borderTop]}>
          <View style={styles.flex1}>
            <Text style={styles.switchTitle}>Wi-Fi Only Mode</Text>
            <Text style={styles.switchSub}>
              Not supported — transfers run over whichever network is available
            </Text>
          </View>
          <Pill label="N/A" color={theme.muted} />
        </View>
      </Card>

      {isUpdaterSupported() && (
        <>
          <SectionHeader title="Software Update" />
          <Card style={styles.card}>
            <View style={styles.permRow}>
              <View style={styles.permInfo}>
                <Zap size={16} color={theme.primary} />
                <Text style={styles.permName}>Installed Version</Text>
              </View>
              <Text style={styles.statValue}>
                {installedVersion ? `v${installedVersion}` : '—'}
              </Text>
            </View>
            <View style={[styles.permRow, styles.borderTop]}>
              <View style={styles.flex1}>
                <Text style={styles.switchTitle}>Check for Updates</Text>
                <Text style={styles.switchSub}>
                  This build is sideloaded (not on an app store) — fetches the
                  newest APK from the release feed
                </Text>
              </View>
              <TouchableOpacity
                style={styles.exemptionBtn}
                onPress={handleCheckForUpdates}
                activeOpacity={0.8}
                disabled={checkingUpdate}
              >
                <Text style={styles.exemptionBtnText}>
                  {checkingUpdate ? 'Checking…' : 'Check'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        </>
      )}

      {/* Support & Bitcoin Donation */}
      <SectionHeader title="Support MeshDrop" />
      <Card glow style={styles.donationCard}>
        <View style={styles.donationHeader}>
          <View style={styles.bitcoinIconBox}>
            <Text style={styles.bitcoinSymbol}>₿</Text>
          </View>
          <View style={styles.flex1}>
            <View style={styles.donationTitleRow}>
              <Text style={styles.donationTitle}>Donate with Bitcoin</Text>
              <Heart size={14} color="#E11D48" fill="#E11D48" />
            </View>
            <Text style={styles.donationSub}>Direct Developer Support</Text>
          </View>
          <Pill label="Bitcoin (BTC)" color="#D97706" />
        </View>

        <Text style={styles.donationDescription}>
          MeshDrop is 100% free and open-source software — no cloud accounts, no subscriptions, and no tracking. If MeshDrop helps you transfer files across your devices, tips via Bitcoin are deeply appreciated to support ongoing maintenance!
        </Text>

        <TouchableOpacity
          style={styles.btcAddressContainer}
          onPress={handleCopyBtc}
          activeOpacity={0.7}
        >
          <Text style={styles.btcAddressText} numberOfLines={1} ellipsizeMode="middle">
            {BITCOIN_ADDRESS}
          </Text>
          <Copy size={13} color={theme.muted} />
        </TouchableOpacity>

        <View style={styles.donationActions}>
          <TouchableOpacity
            style={[styles.donationBtn, styles.donationBtnPrimary]}
            onPress={handleCopyBtc}
            activeOpacity={0.8}
          >
            {copiedBtc ? (
              <Check size={14} color="#FFFFFF" />
            ) : (
              <Copy size={14} color="#FFFFFF" />
            )}
            <Text style={styles.donationBtnTextPrimary}>
              {copiedBtc ? 'Copied!' : 'Copy BTC Address'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.donationBtn, styles.donationBtnSecondary]}
            onPress={() => setShowBtcQr(true)}
            activeOpacity={0.8}
          >
            <QrCode size={14} color={theme.text} />
            <Text style={styles.donationBtnTextSecondary}>Show QR</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* About */}
      <SectionHeader title="About" />
      <Card style={styles.card}>
        <View style={styles.permRow}>
          <View style={styles.permInfo}>
            <Zap size={16} color={theme.primary} />
            <Text style={styles.permName}>Version</Text>
          </View>
          <Text style={styles.statValue}>
            {installedVersion ? `v${installedVersion}` : '—'}
          </Text>
        </View>
        <View style={[styles.permRow, styles.borderTop]}>
          <View style={styles.permInfo}>
            <Info size={16} color={theme.primary} />
            <Text style={styles.permName}>License</Text>
          </View>
          <Pill label="MIT" color={theme.primary} />
        </View>
        <TouchableOpacity
          style={[styles.permRow, styles.borderTop]}
          onPress={() => Linking.openURL('https://github.com/aamirali51/meshdrop-app')}
          activeOpacity={0.7}
        >
          <View style={styles.permInfo}>
            <ExternalLink size={16} color={theme.primary} />
            <Text style={styles.permName}>Source Code</Text>
          </View>
          <Text style={[styles.statValue, { color: theme.primary }]}>GitHub →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.permRow, styles.borderTop]}
          onPress={() => Linking.openURL('https://github.com/aamirali51/meshdrop-releases/releases')}
          activeOpacity={0.7}
        >
          <View style={styles.permInfo}>
            <FileText size={16} color={theme.primary} />
            <Text style={styles.permName}>Releases</Text>
          </View>
          <Text style={[styles.statValue, { color: theme.primary }]}>View →</Text>
        </TouchableOpacity>
      </Card>

      {/* Bitcoin QR Modal */}
      <QRCodeModal
        visible={showBtcQr}
        title="Donate via Bitcoin"
        subtitle="Scan with any Bitcoin wallet to send a tip"
        value={BITCOIN_ADDRESS}
        onClose={() => setShowBtcQr(false)}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 90,
  },
  profileCard: {
    padding: 18,
    marginBottom: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  profileName: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  profileSub: {
    color: theme.textSecondary,
    fontSize: 11.5,
    marginTop: 2,
  },
  keyBox: {
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    padding: 12,
  },
  keyLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  keyLabel: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  keyText: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: fonts.mono,
    marginBottom: 8,
  },
  copyKeyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: theme.primarySoft,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  copyKeyText: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  card: {
    padding: 14,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: theme.hairline,
  },
  switchTitle: {
    color: theme.text,
    fontSize: 13.5,
    fontWeight: '800',
  },
  switchSub: {
    color: theme.muted,
    fontSize: 11,
    marginTop: 2,
  },
  exemptionBtn: {
    backgroundColor: theme.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  exemptionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  permInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  permName: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '700',
  },
  statValue: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: fonts.mono,
  },
  donationCard: {
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.25)',
  },
  donationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  bitcoinIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bitcoinSymbol: {
    color: '#D97706',
    fontSize: 20,
    fontWeight: '900',
  },
  donationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  donationTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
  },
  donationSub: {
    color: theme.muted,
    fontSize: 11,
    marginTop: 1,
  },
  donationDescription: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  btcAddressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  btcAddressText: {
    flex: 1,
    color: theme.text,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.mono,
    letterSpacing: 0.5,
  },
  donationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  donationBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  donationBtnPrimary: {
    backgroundColor: theme.primary,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  donationBtnSecondary: {
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
  },
  donationBtnTextPrimary: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  donationBtnTextSecondary: {
    color: theme.text,
    fontSize: 12.5,
    fontWeight: '700',
  },
})
