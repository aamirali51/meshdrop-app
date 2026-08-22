import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TextInput,
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
  FlaskConical,
  Moon,
  Sun,
  Globe,
} from 'lucide-react-native'
import { call, on } from '../bridge'
import {
  Card,
  Btn,
  Pill,
  SectionHeader,
  DeviceAvatar,
  SimpleModal,
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
import { useTheme, fonts } from '../theme'
import { copyToClipboard } from '../clipboard'
import {
  checkForUpdate,
  refreshVersion,
  isUpdaterSupported,
  getUpdateChannel,
  setUpdateChannel,
} from '../updater'

export function Settings({ identity }: { identity?: any }) {
  const { theme, themeMode, setThemeMode, isDark } = useTheme()

  const [permissions, setPermissions] = useState<PermissionStatus>({
    storage: false,
    notifications: false,
    nearbyDevices: false,
  })
  const [checkingPerms, setCheckingPerms] = useState(false)

  // Preferences
  const [autoAcceptTrusted, setAutoAcceptTrusted] = useState(false)
  const [preferOwnRelay, setPreferOwnRelay] = useState(true)
  const [relayMode, setRelayMode] = useState<'auto' | 'relay-primary' | 'direct-only'>('auto')
  const [customRelayUrl, setCustomRelayUrl] = useState('')
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

  // Developer Mode & 7-Tap Channel Switch
  const [tapCount, setTapCount] = useState(0)
  const [devUnlocked, setDevUnlocked] = useState(false)
  const [showDevModal, setShowDevModal] = useState(false)
  const [devPassInput, setDevPassInput] = useState('')
  const [currentChannel, setCurrentChannel] = useState<'stable' | 'dev'>(getUpdateChannel())

  const handleVersionTap = () => {
    const next = tapCount + 1
    setTapCount(next)
    if (next >= 7) {
      setTapCount(0)
      if (!devUnlocked) {
        setShowDevModal(true)
      } else {
        Alert.alert('Developer Mode', 'Developer options are already active.')
      }
    } else if (next >= 4) {
      const remaining = 7 - next
      Alert.alert(
        'Developer Mode',
        `You are ${remaining} step${remaining === 1 ? '' : 's'} away from unlocking Developer Options.`
      )
    }
  }

  const handleDevUnlock = () => {
    if (devPassInput.trim() === 'DynamiC1988@@') {
      setDevUnlocked(true)
      setShowDevModal(false)
      setDevPassInput('')
      Alert.alert('Developer Mode Unlocked', 'You can now switch between Stable and Dev release channels.')
    } else {
      Alert.alert('Access Denied', 'Incorrect developer passcode.')
    }
  }

  const handleToggleChannel = (ch: 'stable' | 'dev') => {
    setUpdateChannel(ch)
    setCurrentChannel(ch)
    Alert.alert(
      'Channel Switched',
      `Update feed is now set to ${ch === 'dev' ? 'Dev Pre-Release (dev-preview)' : 'Official Stable'}.`
    )
  }

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

  const handleSelectRelayMode = (mode: 'auto' | 'relay-primary' | 'direct-only') => {
    setRelayMode(mode)
    call('setRelayMode', { mode }).catch(() => {})
  }

  const handleUpdateCustomRelayUrl = (url: string) => {
    setCustomRelayUrl(url)
    call('setCustomRelayUrl', { url }).catch(() => {})
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

    // Load the real, persisted engine preference for auto-accept and relay routing.
    call('getSettings')
      .then((s: any) => {
        if (s && typeof s.autoAcceptOffers === 'boolean') setAutoAcceptTrusted(s.autoAcceptOffers)
        if (s && typeof s.preferOwnRelay === 'boolean') setPreferOwnRelay(s.preferOwnRelay)
        if (s && typeof s.relayMode === 'string') setRelayMode(s.relayMode)
        if (s && typeof s.customRelayUrl === 'string') setCustomRelayUrl(s.customRelayUrl)
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
      style={[styles.container, { backgroundColor: theme.bg }]}
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
            <Text style={[styles.profileName, { color: theme.text }]}>{identity?.name || 'Local Mesh Node'}</Text>
            <Text style={[styles.profileSub, { color: theme.textSecondary }]}>
              Hyperswarm Sovereign Node · End-to-End Encrypted
            </Text>
          </View>
        </View>

        <View style={[styles.keyBox, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
          <View style={styles.keyLabelRow}>
            <Lock size={12} color={theme.primary} />
            <Text style={[styles.keyLabel, { color: theme.muted }]}>Noise Cryptographic Public Key</Text>
          </View>
          <Text style={[styles.keyText, { color: theme.primary }]} numberOfLines={1} ellipsizeMode="middle">
            {identity?.publicKey || 'Generating cryptographically secure Noise key…'}
          </Text>
          <TouchableOpacity
            style={[styles.copyKeyBtn, { backgroundColor: theme.primarySoft }]}
            onPress={copyPublicKey}
            activeOpacity={0.7}
          >
            {copiedKey ? (
              <Check size={13} color={theme.success} />
            ) : (
              <Copy size={13} color={theme.primary} />
            )}
            <Text style={[styles.copyKeyText, { color: theme.primary }]}>{copiedKey ? 'Copied' : 'Copy Key'}</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Color Theme Selector (Replicated from Desktop Settings) */}
      <SectionHeader title="Color Theme" />
      <Card style={styles.card}>
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.switchTitle, { color: theme.text }]}>Interface Palette</Text>
          <Text style={[styles.switchSub, { color: theme.muted }]}>
            Select dark or light color scheme for your mobile mesh node.
          </Text>
        </View>

        <View style={styles.themeOptionsGrid}>
          <TouchableOpacity
            style={[
              styles.themeOptionCard,
              { backgroundColor: theme.bgElevated, borderColor: theme.border },
              themeMode === 'dark' && {
                borderColor: theme.primary,
                backgroundColor: theme.primarySoft,
                borderWidth: 2,
              },
            ]}
            onPress={() => setThemeMode('dark')}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.themeOptionIconBox,
                { backgroundColor: themeMode === 'dark' ? theme.primary : theme.bgCard },
              ]}
            >
              <Moon
                size={18}
                color={themeMode === 'dark' ? '#FFFFFF' : theme.muted}
              />
            </View>
            <Text
              style={[
                styles.themeOptionTitle,
                { color: theme.text },
                themeMode === 'dark' && { color: theme.primary, fontWeight: '900' },
              ]}
            >
              Dark Mode
            </Text>
            <Text style={[styles.themeOptionSub, { color: theme.muted }]}>
              OLED Tech Slate
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeOptionCard,
              { backgroundColor: theme.bgElevated, borderColor: theme.border },
              themeMode === 'light' && {
                borderColor: theme.primary,
                backgroundColor: theme.primarySoft,
                borderWidth: 2,
              },
            ]}
            onPress={() => setThemeMode('light')}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.themeOptionIconBox,
                { backgroundColor: themeMode === 'light' ? theme.primary : theme.bgCard },
              ]}
            >
              <Sun
                size={18}
                color={themeMode === 'light' ? '#FFFFFF' : theme.warning}
              />
            </View>
            <Text
              style={[
                styles.themeOptionTitle,
                { color: theme.text },
                themeMode === 'light' && { color: theme.primary, fontWeight: '900' },
              ]}
            >
              Light Mode
            </Text>
            <Text style={[styles.themeOptionSub, { color: theme.muted }]}>
              Pristine Light
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeOptionCard,
              { backgroundColor: theme.bgElevated, borderColor: theme.border },
              themeMode === 'system' && {
                borderColor: theme.primary,
                backgroundColor: theme.primarySoft,
                borderWidth: 2,
              },
            ]}
            onPress={() => setThemeMode('system')}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.themeOptionIconBox,
                { backgroundColor: themeMode === 'system' ? theme.primary : theme.bgCard },
              ]}
            >
              <Smartphone
                size={18}
                color={themeMode === 'system' ? '#FFFFFF' : theme.muted}
              />
            </View>
            <Text
              style={[
                styles.themeOptionTitle,
                { color: theme.text },
                themeMode === 'system' && { color: theme.primary, fontWeight: '900' },
              ]}
            >
              System
            </Text>
            <Text style={[styles.themeOptionSub, { color: theme.muted }]}>
              Follow OS
            </Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Network Transport & Relay Strategy */}
      <SectionHeader title="Network Transport & Relay" />
      <Card style={styles.card}>
        <View style={styles.themeOptionsGrid}>
          <TouchableOpacity
            style={[
              styles.themeOptionCard,
              { backgroundColor: theme.bgElevated, borderColor: theme.border },
              (relayMode || 'auto') === 'auto' && {
                borderColor: theme.primary,
                backgroundColor: theme.primarySoft,
                borderWidth: 2,
              },
            ]}
            onPress={() => handleSelectRelayMode('auto')}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.themeOptionIconBox,
                { backgroundColor: (relayMode || 'auto') === 'auto' ? theme.primary : theme.bgCard },
              ]}
            >
              <Zap
                size={18}
                color={(relayMode || 'auto') === 'auto' ? '#FFFFFF' : theme.primary}
              />
            </View>
            <Text
              style={[
                styles.themeOptionTitle,
                { color: theme.text },
                (relayMode || 'auto') === 'auto' && { color: theme.primary, fontWeight: '900' },
              ]}
            >
              ⚡ Auto
            </Text>
            <Text style={[styles.themeOptionSub, { color: theme.muted }]}>
              Hybrid Dual
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeOptionCard,
              { backgroundColor: theme.bgElevated, borderColor: theme.border },
              relayMode === 'relay-primary' && {
                borderColor: theme.primary,
                backgroundColor: theme.primarySoft,
                borderWidth: 2,
              },
            ]}
            onPress={() => handleSelectRelayMode('relay-primary')}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.themeOptionIconBox,
                { backgroundColor: relayMode === 'relay-primary' ? theme.primary : theme.bgCard },
              ]}
            >
              <Globe
                size={18}
                color={relayMode === 'relay-primary' ? '#FFFFFF' : theme.accent}
              />
            </View>
            <Text
              style={[
                styles.themeOptionTitle,
                { color: theme.text },
                relayMode === 'relay-primary' && { color: theme.primary, fontWeight: '900' },
              ]}
            >
              🌐 Cloudflare
            </Text>
            <Text style={[styles.themeOptionSub, { color: theme.muted }]}>
              Relay First
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeOptionCard,
              { backgroundColor: theme.bgElevated, borderColor: theme.border },
              relayMode === 'direct-only' && {
                borderColor: theme.primary,
                backgroundColor: theme.primarySoft,
                borderWidth: 2,
              },
            ]}
            onPress={() => handleSelectRelayMode('direct-only')}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.themeOptionIconBox,
                { backgroundColor: relayMode === 'direct-only' ? theme.primary : theme.bgCard },
              ]}
            >
              <Lock
                size={18}
                color={relayMode === 'direct-only' ? '#FFFFFF' : theme.warning}
              />
            </View>
            <Text
              style={[
                styles.themeOptionTitle,
                { color: theme.text },
                relayMode === 'direct-only' && { color: theme.primary, fontWeight: '900' },
              ]}
            >
              🔒 Direct P2P
            </Text>
            <Text style={[styles.themeOptionSub, { color: theme.muted }]}>
              No Cloud
            </Text>
          </TouchableOpacity>
        </View>

        {relayMode !== 'direct-only' && (
          <View style={[styles.switchRow, { borderTopColor: theme.hairline, borderTopWidth: 1, flexDirection: 'column', alignItems: 'stretch' }]}>
            <Text style={[styles.switchTitle, { color: theme.text }]}>Custom Relay Endpoint</Text>
            <Text style={[styles.switchSub, { color: theme.muted, marginBottom: 8 }]}>
              Leave blank to use default global Cloudflare Worker
            </Text>
            <TextInput
              value={customRelayUrl}
              onChangeText={handleUpdateCustomRelayUrl}
              placeholder="https://meshdrop-relay.aamirabdullah33.workers.dev"
              placeholderTextColor={theme.subtle}
              style={[styles.customRelayInput, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        <View style={[styles.switchRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
          <View style={styles.flex1}>
            <Text style={[styles.switchTitle, { color: theme.text }]}>Prefer Paired Desktops as Relay</Text>
            <Text style={[styles.switchSub, { color: theme.muted }]}>
              Tunnel via your online paired PC before public bootstrap nodes
            </Text>
          </View>
          <Switch
            value={preferOwnRelay}
            onValueChange={handleTogglePreferOwnRelay}
            trackColor={{ false: theme.bgElevated, true: theme.primarySoft }}
            thumbColor={preferOwnRelay ? theme.primary : theme.subtle}
          />
        </View>
      </Card>

      {/* Background Sentinel & Sync Guardian */}
      <SectionHeader title="Background Sentinel" />
      <Card style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.flex1}>
            <Text style={[styles.switchTitle, { color: theme.text }]}>Background Mesh Engine</Text>
            <Text style={[styles.switchSub, { color: theme.muted }]}>
              Keep P2P DHT listening active when app is minimized
            </Text>
          </View>
          <Switch
            value={backgroundKeepAlive}
            onValueChange={handleToggleBackgroundKeepAlive}
            trackColor={{ false: theme.bgElevated, true: theme.primarySoft }}
            thumbColor={backgroundKeepAlive ? theme.primary : theme.subtle}
          />
        </View>

        <View style={[styles.switchRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
          <View style={styles.flex1}>
            <Text style={[styles.switchTitle, { color: theme.text }]}>Battery Optimization Exemption</Text>
            <Text style={[styles.switchSub, { color: theme.muted }]}>
              {batteryIgnored ? 'Exempted (High Reliability)' : 'Subject to OS throttling'}
            </Text>
          </View>
          {!batteryIgnored && (
            <TouchableOpacity
              style={[styles.exemptionBtn, { backgroundColor: theme.primary }]}
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
            <Text style={[styles.permName, { color: theme.text }]}>Engine Data Size</Text>
          </View>
          <Text style={[styles.statValue, { color: theme.text }]}>{formatBytes(storageStats?.sizeBytes)}</Text>
        </View>
        <View style={[styles.permRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
          <View style={styles.permInfo}>
            <FileText size={16} color={theme.accent} />
            <Text style={[styles.permName, { color: theme.text }]}>Transfer Records</Text>
          </View>
          <Text style={[styles.statValue, { color: theme.text }]}>{storageStats?.transfers ?? 0}</Text>
        </View>
        <View style={[styles.permRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
          <View style={styles.permInfo}>
            <Clock size={16} color={theme.purple} />
            <Text style={[styles.permName, { color: theme.text }]}>History Entries</Text>
          </View>
          <Text style={[styles.statValue, { color: theme.text }]}>{storageStats?.history ?? 0}</Text>
        </View>
        <View style={[styles.permRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
          <View style={styles.permInfo}>
            <FolderSync size={16} color={theme.success} />
            <Text style={[styles.permName, { color: theme.text }]}>Sync Libraries</Text>
          </View>
          <Text style={[styles.statValue, { color: theme.text }]}>{storageStats?.syncLibraries ?? 0}</Text>
        </View>
        <View style={[styles.permRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
          <View style={styles.flex1}>
            <Text style={[styles.switchTitle, { color: theme.text }]}>Clear Transfer Log</Text>
            <Text style={[styles.switchSub, { color: theme.muted }]}>
              Remove completed/failed transfer records to reclaim metadata space
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.exemptionBtn, { backgroundColor: theme.primary }]}
            onPress={handleClearTransferLog}
            activeOpacity={0.8}
          >
            <Text style={styles.exemptionBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.permRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
          <View style={styles.flex1}>
            <Text style={[styles.switchTitle, { color: theme.text }]}>Compress Engine Data</Text>
            <Text style={[styles.switchSub, { color: theme.muted }]}>
              Rebuild metadata to reclaim space from old sync index versions
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.exemptionBtn, { backgroundColor: theme.primary }]}
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
            <Text style={[styles.permName, { color: theme.text }]}>Storage Access</Text>
          </View>
          <Pill
            label={permissions.storage ? 'Granted' : 'Required'}
            color={permissions.storage ? theme.success : theme.danger}
          />
        </View>

        <View style={[styles.permRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
          <View style={styles.permInfo}>
            <Bell size={16} color={theme.purple} />
            <Text style={[styles.permName, { color: theme.text }]}>Push Notifications</Text>
          </View>
          <Pill
            label={permissions.notifications ? 'Active' : 'Disabled'}
            color={permissions.notifications ? theme.success : theme.warning}
          />
        </View>

        <View style={[styles.permRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
          <View style={styles.permInfo}>
            <Radio size={16} color={theme.accent} />
            <Text style={[styles.permName, { color: theme.text }]}>Nearby Device Discovery</Text>
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
            <Text style={[styles.switchTitle, { color: theme.text }]}>Auto-Accept Trusted Transfers</Text>
            <Text style={[styles.switchSub, { color: theme.muted }]}>
              Automatically download payloads from verified peers
            </Text>
          </View>
          <Switch
            value={autoAcceptTrusted}
            onValueChange={handleToggleAutoAccept}
            trackColor={{ false: theme.bgElevated, true: theme.primarySoft }}
            thumbColor={autoAcceptTrusted ? theme.primary : theme.subtle}
          />
        </View>

        <View style={[styles.switchRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
          <View style={styles.flex1}>
            <Text style={[styles.switchTitle, { color: theme.text }]}>Prefer My Devices as Relay</Text>
            <Text style={[styles.switchSub, { color: theme.muted }]}>
              When a direct connection fails, tunnel through your own online desktop before
              public relays. Private to your mesh.
            </Text>
          </View>
          <Switch
            value={preferOwnRelay}
            onValueChange={handleTogglePreferOwnRelay}
            trackColor={{ false: theme.bgElevated, true: theme.primarySoft }}
            thumbColor={preferOwnRelay ? theme.primary : theme.subtle}
          />
        </View>

        <View style={[styles.switchRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
          <View style={styles.flex1}>
            <Text style={[styles.switchTitle, { color: theme.text }]}>LAN Multicast Discovery</Text>
            <Text style={[styles.switchSub, { color: theme.muted }]}>
              Unavailable on this build — DHT-based Hyperswarm discovery stays active
            </Text>
          </View>
          <Pill label="DHT" color={theme.muted} />
        </View>

        <View style={[styles.switchRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
          <View style={styles.flex1}>
            <Text style={[styles.switchTitle, { color: theme.text }]}>Wi-Fi Only Mode</Text>
            <Text style={[styles.switchSub, { color: theme.muted }]}>
              Not supported — transfers run over whichever network is available
            </Text>
          </View>
          <Pill label="N/A" color={theme.muted} />
        </View>
      </Card>

      {isUpdaterSupported() && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionHeader title="Software Update" />
            {currentChannel === 'dev' && (
              <Pill label="🧪 Dev Feed" color={theme.primary} />
            )}
          </View>
          <Card style={styles.card}>
            <View style={styles.permRow}>
              <View style={styles.permInfo}>
                <Zap size={16} color={theme.primary} />
                <Text style={[styles.permName, { color: theme.text }]}>Installed Version</Text>
              </View>
              <Text style={[styles.statValue, { color: theme.text }]}>
                {installedVersion ? `v${installedVersion}` : '—'}
              </Text>
            </View>

            {devUnlocked && (
              <View style={[styles.permRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
                <View style={styles.flex1}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <FlaskConical size={14} color={theme.primary} />
                    <Text style={[styles.switchTitle, { color: theme.text }]}>Release Channel</Text>
                  </View>
                  <Text style={[styles.switchSub, { color: theme.muted }]}>
                    {currentChannel === 'dev'
                      ? 'Fetching bleeding-edge dev APK from dev-preview'
                      : 'Fetching official production releases'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[
                      styles.exemptionBtn,
                      { backgroundColor: theme.bgElevated },
                      currentChannel === 'stable' && { backgroundColor: theme.primary },
                    ]}
                    onPress={() => handleToggleChannel('stable')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.exemptionBtnText,
                        { color: currentChannel === 'stable' ? '#FFFFFF' : theme.text },
                      ]}
                    >
                      Stable
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.exemptionBtn,
                      { backgroundColor: theme.bgElevated },
                      currentChannel === 'dev' && { backgroundColor: theme.primary },
                    ]}
                    onPress={() => handleToggleChannel('dev')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.exemptionBtnText,
                        { color: currentChannel === 'dev' ? '#FFFFFF' : theme.text },
                      ]}
                    >
                      Dev
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={[styles.permRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
              <View style={styles.flex1}>
                <Text style={[styles.switchTitle, { color: theme.text }]}>Check for Updates</Text>
                <Text style={[styles.switchSub, { color: theme.muted }]}>
                  {currentChannel === 'dev'
                    ? 'Checks for newest dev pre-release APK on GitHub'
                    : 'This build is sideloaded — fetches newest official APK from release feed'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.exemptionBtn, { backgroundColor: theme.primary }]}
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
      <Card glow style={[styles.donationCard, { borderColor: 'rgba(217, 119, 6, 0.35)', backgroundColor: theme.bgCard }]}>
        <View style={styles.donationHeader}>
          <View style={[styles.bitcoinIconBox, { backgroundColor: theme.isDark ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB' }]}>
            <Text style={styles.bitcoinSymbol}>₿</Text>
          </View>
          <View style={styles.flex1}>
            <View style={styles.donationTitleRow}>
              <Text style={[styles.donationTitle, { color: theme.text }]}>Donate with Bitcoin</Text>
              <Heart size={14} color="#E11D48" fill="#E11D48" />
            </View>
            <Text style={[styles.donationSub, { color: theme.muted }]}>Direct Developer Support</Text>
          </View>
          <Pill label="Bitcoin (BTC)" color="#D97706" />
        </View>

        <Text style={[styles.donationDescription, { color: theme.textSecondary }]}>
          MeshDrop is 100% free and open-source software — no cloud accounts, no subscriptions, and no tracking. If MeshDrop helps you transfer files across your devices, tips via Bitcoin are deeply appreciated to support ongoing maintenance!
        </Text>

        <TouchableOpacity
          style={[styles.btcAddressContainer, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
          onPress={handleCopyBtc}
          activeOpacity={0.7}
        >
          <Text style={[styles.btcAddressText, { color: theme.text }]} numberOfLines={1} ellipsizeMode="middle">
            {BITCOIN_ADDRESS}
          </Text>
          <Copy size={13} color={theme.muted} />
        </TouchableOpacity>

        <View style={styles.donationActions}>
          <TouchableOpacity
            style={[styles.donationBtn, styles.donationBtnPrimary, { backgroundColor: theme.primary }]}
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
            style={[styles.donationBtn, styles.donationBtnSecondary, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
            onPress={() => setShowBtcQr(true)}
            activeOpacity={0.8}
          >
            <QrCode size={14} color={theme.text} />
            <Text style={[styles.donationBtnTextSecondary, { color: theme.text }]}>Show QR</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* About */}
      <SectionHeader title="About" />
      <Card style={styles.card}>
        <TouchableOpacity
          style={styles.permRow}
          onPress={handleVersionTap}
          activeOpacity={0.7}
        >
          <View style={styles.permInfo}>
            <Zap size={16} color={theme.primary} />
            <Text style={[styles.permName, { color: theme.text }]}>Version</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {devUnlocked && <Pill label="Dev Unlocked" color={theme.success} />}
            <Text style={[styles.statValue, { color: theme.text }]}>
              {installedVersion ? `v${installedVersion}` : '—'}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={[styles.permRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}>
          <View style={styles.permInfo}>
            <Info size={16} color={theme.primary} />
            <Text style={[styles.permName, { color: theme.text }]}>License</Text>
          </View>
          <Pill label="MIT" color={theme.primary} />
        </View>
        <TouchableOpacity
          style={[styles.permRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}
          onPress={() => Linking.openURL('https://github.com/aamirali51/meshdrop-app')}
          activeOpacity={0.7}
        >
          <View style={styles.permInfo}>
            <ExternalLink size={16} color={theme.primary} />
            <Text style={[styles.permName, { color: theme.text }]}>Source Code</Text>
          </View>
          <Text style={[styles.statValue, { color: theme.primary }]}>GitHub →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.permRow, { borderTopColor: theme.hairline, borderTopWidth: 1 }]}
          onPress={() => Linking.openURL('https://github.com/aamirali51/meshdrop-releases/releases')}
          activeOpacity={0.7}
        >
          <View style={styles.permInfo}>
            <FileText size={16} color={theme.primary} />
            <Text style={[styles.permName, { color: theme.text }]}>Releases</Text>
          </View>
          <Text style={[styles.statValue, { color: theme.primary }]}>View →</Text>
        </TouchableOpacity>
      </Card>

      {/* Developer Passcode Modal */}
      <SimpleModal
        visible={showDevModal}
        title="Unlock Developer Options"
        subtitle="Enter developer passcode to enable dev preview release updates."
        onClose={() => {
          setShowDevModal(false)
          setDevPassInput('')
        }}
      >
        <View style={{ paddingVertical: 6 }}>
          <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
            Developer Passcode
          </Text>
          <TextInput
            style={{
              backgroundColor: theme.bgElevated,
              borderColor: theme.border,
              borderWidth: 1,
              borderRadius: 10,
              padding: 12,
              color: theme.text,
              fontSize: 14,
              marginBottom: 14,
            }}
            placeholder="Enter developer passcode"
            placeholderTextColor={theme.muted}
            secureTextEntry
            value={devPassInput}
            onChangeText={setDevPassInput}
            autoFocus
          />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: theme.bgElevated,
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.border,
              }}
              onPress={() => {
                setShowDevModal(false)
                setDevPassInput('')
              }}
              activeOpacity={0.8}
            >
              <Text style={{ color: theme.muted, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1.5,
                backgroundColor: theme.primary,
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: 'center',
              }}
              onPress={handleDevUnlock}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>Unlock</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SimpleModal>

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
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  profileSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  keyBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  keyLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  keyLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  keyText: {
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
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  copyKeyText: {
    fontSize: 11,
    fontWeight: '800',
  },
  card: {
    padding: 14,
    marginBottom: 16,
  },
  themeOptionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  themeOptionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  themeOptionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  themeOptionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  themeOptionSub: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  switchTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  switchSub: {
    fontSize: 11,
    marginTop: 2,
  },
  customRelayInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    fontFamily: fonts.mono,
    marginTop: 4,
  },
  exemptionBtn: {
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
    fontSize: 13,
    fontWeight: '700',
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: fonts.mono,
  },
  donationCard: {
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
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
    fontSize: 14,
    fontWeight: '800',
  },
  donationSub: {
    fontSize: 11,
    marginTop: 1,
  },
  donationDescription: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  btcAddressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  btcAddressText: {
    flex: 1,
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  donationBtnSecondary: {
    borderWidth: 1,
  },
  donationBtnTextPrimary: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  donationBtnTextSecondary: {
    fontSize: 12.5,
    fontWeight: '700',
  },
})

