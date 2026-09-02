import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native'
import {
  Search,
  Plus,
  ShieldCheck,
  Camera,
  Send,
  Trash2,
} from 'lucide-react-native'
import { call, on } from '../bridge'
import {
  Btn,
  Pill,
  PairingCodeCard,
  DeviceCard,
  SimpleModal,
  SectionHeader,
} from '../components'
import { RadarPulseEmptyState } from '../components/RadarPulseEmptyState'
import { QRCodeModal } from '../components/QRCodeModal'
import { QRScannerModal } from '../components/QRScannerModal'
import { formatCodeInput } from '../utils/formatCode'
import { pickFiles } from '../filePicker'
import { useTheme, fonts } from '../theme'

interface Device {
  id: string
  name: string
  publicKey?: string
  os?: string
  osVersion?: string
  ipAddress?: string
  isOnline?: boolean
  isTrusted?: boolean
  isEncrypted?: boolean
  lastSeen?: string
}

let memoryCachedDevices: Device[] = []

export function Devices({ identity }: { identity?: any }) {
  const { theme } = useTheme()
  const [devices, setDevices] = useState<Device[]>(() =>
    memoryCachedDevices.map((d) => ({ ...d, isOnline: false }))
  )
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<
    'all' | 'online' | 'trusted' | 'desktops' | 'mobile'
  >('all')

  const [myCode, setMyCode] = useState(identity?.pairingCode || '')
  const [codeCopied, setCodeCopied] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)

  // QR Modal
  const [showQRModal, setShowQRModal] = useState(false)

  // Pair Modal
  const [showPairModal, setShowPairModal] = useState(false)
  const [pairCodeInput, setPairCodeInput] = useState('')
  const [pairLoading, setPairLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)

  // Details Modal
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)

  // Pairing intent: a pairing screen open (manual entry, scanner) means this
  // device wants to be reachable for pairing — the engine brings the relay
  // fallback up immediately in lazy 'auto' mode. Sticky on close.
  useEffect(() => {
    const pairing = showPairModal || showScanner
    if (!pairing) return
    call('pairingIntent', { active: true }).catch(() => {})
  }, [showPairModal, showScanner])

  const refresh = useCallback(() => {
    call('listDevices')
      .then((res: any) => {
        if (Array.isArray(res)) {
          setDevices(res)
          memoryCachedDevices = res
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()

    const unsubPeers = on('peers', () => {
      refresh()
    })

    const unsubStatus = on('status', () => {
      refresh()
    })

    return () => {
      unsubPeers()
      unsubStatus()
    }
  }, [refresh])

  useEffect(() => {
    if (identity?.pairingCode) {
      setMyCode(identity.pairingCode)
    }
  }, [identity?.pairingCode])

  const handleCopyCode = () => {
    if (!myCode) return
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
    call('copyToClipboard', { text: myCode }).catch(() => {})
  }

  const handleRefreshCode = () => {
    setCodeLoading(true)
    call('rotatePairingCode')
      .then((res: any) => {
        if (res?.pairingCode) setMyCode(res.pairingCode)
      })
      .finally(() => setCodeLoading(false))
  }

  const handlePair = () => {
    if (!pairCodeInput.trim()) return
    setPairLoading(true)
    call('pairDevice', { code: pairCodeInput.trim() })
      .then(() => {
        setShowPairModal(false)
        setPairCodeInput('')
        refresh()
        Alert.alert('Success', 'Pairing request dispatched to mesh peer.')
      })
      .catch((err: any) => {
        Alert.alert('Pairing Failed', err?.message || 'Could not verify pairing code.')
      })
      .finally(() => setPairLoading(false))
  }

  const handleToggleTrust = (dev: Device) => {
    const nextTrust = !dev.isTrusted
    call('setDeviceTrust', { id: dev.id, trusted: nextTrust })
      .then(() => refresh())
      .catch(() => {})
  }

  const handleForgetDevice = (dev: Device) => {
    Alert.alert(
      'Remove Device',
      `Forget "${dev.name}" from your mesh cluster?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            call('forgetDevice', { id: dev.id })
              .then(() => {
                setSelectedDevice(null)
                refresh()
              })
              .catch(() => {})
          },
        },
      ]
    )
  }

  const handleDirectSend = async (dev: Device) => {
    const picked = await pickFiles()
    if (!picked || picked.length === 0) return

    for (const f of picked) {
      call('sendFileOffer', {
        targetDeviceId: dev.id,
        filePath: f.path,
        fileName: f.name,
        size: f.size,
      }).catch((err: any) => {
        Alert.alert('Send Error', err?.message || 'Failed to dispatch file.')
      })
    }
  }

  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      const matchQuery =
        !query ||
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        (d.os && d.os.toLowerCase().includes(query.toLowerCase())) ||
        (d.ipAddress && d.ipAddress.includes(query))

      if (!matchQuery) return false

      if (activeTab === 'online') return d.isOnline
      if (activeTab === 'trusted') return d.isTrusted
      if (activeTab === 'desktops') {
        const os = (d.os || '').toLowerCase()
        return os.match(/win|mac|linux|darwin/)
      }
      if (activeTab === 'mobile') {
        const os = (d.os || '').toLowerCase()
        return os.match(/android|ios|iphone|ipad/)
      }
      return true
    })
  }, [devices, query, activeTab])

  const onlineCount = useMemo(() => devices.filter((d) => d.isOnline).length, [devices])

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Node Pairing Code Hero Card */}
      <PairingCodeCard
        code={myCode}
        onCopy={handleCopyCode}
        onShowQR={() => setShowQRModal(true)}
        onRefresh={handleRefreshCode}
        copied={codeCopied}
        loading={codeLoading}
      />

      {/* Action Header with Pair & QR Trigger */}
      <View style={styles.actionHeaderRow}>
        <SectionHeader title="Swarm Nodes" badge={devices.length} />
        <View style={styles.topBtnGroup}>
          <TouchableOpacity
            style={[styles.scanCodeBtn, { backgroundColor: theme.primarySoft, borderColor: theme.primary + '35' }]}
            onPress={() => setShowScanner(true)}
            activeOpacity={0.8}
          >
            <Camera size={14} color={theme.primary} />
            <Text style={[styles.scanCodeText, { color: theme.primary }]}>Scan QR</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pairCodeBtn, { backgroundColor: theme.primary }]}
            onPress={() => setShowPairModal(true)}
            activeOpacity={0.8}
          >
            <Plus size={14} color="#FFFFFF" />
            <Text style={styles.pairCodeText}>Pair Code</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Fast Filter / Search Input */}
      <View style={[styles.searchBar, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <Search size={15} color={theme.muted} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search peers by name or OS…"
          placeholderTextColor={theme.muted}
          value={query}
          onChangeText={setQuery}
        />
        {!!query && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={[styles.clearSearchText, { color: theme.muted }]}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScroll}
      >
        {(
          [
            { key: 'all', label: `All (${devices.length})` },
            { key: 'online', label: `Online (${onlineCount})` },
            { key: 'trusted', label: 'Trusted' },
            { key: 'desktops', label: 'Desktops' },
            { key: 'mobile', label: 'Mobile' },
          ] as const
        ).map((t) => {
          const isActive = activeTab === t.key
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setActiveTab(t.key)}
              style={[
                styles.filterChip,
                { backgroundColor: theme.bgCard, borderColor: theme.border },
                isActive && { backgroundColor: theme.primarySoft, borderColor: theme.primary + '50' },
              ]}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: theme.muted },
                  isActive && { color: theme.primary, fontWeight: '800' },
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Devices List / Empty Radar Pulse State */}
      {filteredDevices.length === 0 ? (
        <RadarPulseEmptyState
          title={query ? 'No matching peers found' : 'No paired devices yet'}
          subtitle={
            query
              ? 'Try modifying your search filter.'
              : 'Share a code with anyone. Pair the devices you own — paired devices connect directly for file sends and sync.'
          }
          actionLabel="Enter Pairing Code"
          onAction={() => setShowPairModal(true)}
        />
      ) : (
        <View style={styles.deviceList}>
          {filteredDevices.map((dev) => (
            <DeviceCard
              key={dev.id}
              device={dev}
              onPress={() => setSelectedDevice(dev)}
              onSendFile={() => handleDirectSend(dev)}
              onToggleTrust={() => handleToggleTrust(dev)}
              onForget={() => handleForgetDevice(dev)}
            />
          ))}
        </View>
      )}

      {/* QR Code Presentation Modal */}
      <QRCodeModal
        visible={showQRModal}
        title="Pairing Code"
        subtitle="Scan this with your other MeshDrop device to pair instantly"
        value={myCode}
        onClose={() => setShowQRModal(false)}
      />

      {/* Native Camera QR Scanner Modal */}
      <QRScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScanSuccess={(code) => {
          setPairCodeInput(code)
          setShowPairModal(true)
        }}
      />

      {/* Manual Pairing Input Modal */}
      <SimpleModal
        visible={showPairModal}
        title="Pair a Device"
        subtitle="Enter the code shown on your other device. Share a code with anyone — pair the devices you own."
        onClose={() => {
          setShowPairModal(false)
          setPairCodeInput('')
        }}
      >
        <View style={styles.pairModalContent}>
          <TextInput
            style={[styles.pairInput, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.primary }]}
            placeholder="MD-XXXX-XXXX-XXXX-XXXX"
            placeholderTextColor={theme.muted}
            value={pairCodeInput}
            onChangeText={(txt) => setPairCodeInput(formatCodeInput(txt))}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <View style={styles.pairActionsRow}>
            <Btn
              label="Scan Camera"
              icon={Camera}
              variant="secondary"
              onPress={() => {
                setShowPairModal(false)
                setShowScanner(true)
              }}
              style={styles.flex1}
            />
            <Btn
              label="Pair"
              icon={ShieldCheck}
              variant="primary"
              onPress={handlePair}
              disabled={pairCodeInput.length < 8}
              loading={pairLoading}
              style={styles.flex1}
            />
          </View>
        </View>
      </SimpleModal>

      {/* Device Details Bottom Modal */}
      {selectedDevice && (
        <SimpleModal
          visible={Boolean(selectedDevice)}
          title={selectedDevice.name}
          subtitle={`Node ID: ${selectedDevice.id.slice(0, 12)}…`}
          onClose={() => setSelectedDevice(null)}
        >
          <View style={styles.detailContainer}>
            <View style={[styles.detailCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.muted }]}>Connection Status</Text>
                <Pill
                  label={selectedDevice.isOnline ? 'Online · Connected' : 'Offline'}
                  color={selectedDevice.isOnline ? theme.success : theme.muted}
                  dot
                />
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.muted }]}>Operating System</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>{selectedDevice.os || 'Unknown'}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.muted }]}>Trust Level</Text>
                <Pill
                  label={selectedDevice.isTrusted ? 'Verified & Trusted' : 'Standard Peer'}
                  color={selectedDevice.isTrusted ? theme.primary : theme.muted}
                  icon={ShieldCheck}
                />
              </View>

              {selectedDevice.ipAddress && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.muted }]}>Direct IP</Text>
                  <Text style={[styles.detailValueMono, { color: theme.primary }]}>{selectedDevice.ipAddress}</Text>
                </View>
              )}
            </View>

            {/* Quick Actions */}
            <View style={styles.detailActions}>
              {selectedDevice.isOnline && (
                <Btn
                  label="Beam Files to Device"
                  icon={Send}
                  variant="primary"
                  onPress={() => {
                    const d = selectedDevice
                    setSelectedDevice(null)
                    handleDirectSend(d)
                  }}
                  style={{ marginBottom: 10 }}
                />
              )}

              <Btn
                label="Remove from Mesh"
                icon={Trash2}
                variant="danger"
                onPress={() => handleForgetDevice(selectedDevice)}
              />
            </View>
          </View>
        </SimpleModal>
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
  },
  content: {
    padding: 16,
    paddingBottom: 90,
  },
  actionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  topBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  scanCodeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  pairCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  pairCodeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  clearSearchText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tabScroll: {
    gap: 8,
    paddingBottom: 14,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  deviceList: {
    marginTop: 4,
  },
  pairModalContent: {
    paddingVertical: 8,
  },
  pairInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: fonts.mono,
    textAlign: 'center',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  pairActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  detailContainer: {
    paddingVertical: 6,
  },
  detailCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  detailValueMono: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: fonts.mono,
  },
  detailActions: {
    gap: 4,
  },
})
