import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
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
} from 'lucide-react-native'
import { call, on } from '../bridge'
import {
  Card,
  Btn,
  Pill,
  SectionHeader,
  DeviceAvatar,
} from '../components'
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
  const [backgroundKeepAlive, setBackgroundKeepAlive] = useState(true)
  const [batteryIgnored, setBatteryIgnored] = useState(true)

  // Paths & Diagnostics
  const [downloadsPath, setDownloadsPath] = useState<string>('')
  const [copiedKey, setCopiedKey] = useState(false)
  const [systemInfo, setSystemInfo] = useState<any>(null)
  const [storageStats, setStorageStats] = useState<any>(null)
  const [installedVersion, setInstalledVersion] = useState<string | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)

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
})
