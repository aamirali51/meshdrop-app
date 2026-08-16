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
import { theme, fonts } from '../theme'

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

  const refresh = useCallback(() => {
    call('listDevices')
      .then((res: any) => {
        if (Array.isArray(res)) {
          setDevices(res)
          memoryCachedDevices = res
        }
      })
      .catch(() => {})

    call('getIdentity')
      .then((res: any) => {
        if (res && res.pairingCode) setMyCode(res.pairingCode)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (identity?.pairingCode) {
      setMyCode(identity.pairingCode)
    }
  }, [identity])

  useEffect(() => {
    refresh()
    const t1 = setTimeout(refresh, 400)
    const t2 = setTimeout(refresh, 1500)
    const t3 = setTimeout(refresh, 3500)
    const events = [
      '__engine',
      'trust:paired',
      'peer:connected',
      'peer:disconnected',
      'device:updated',
      'device:removed',
    ]
    const unsubs = events.map((e) => on(e, refresh))
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      unsubs.forEach((u) => u())
    }
  }, [refresh])

  const copyMyCode = () => {
    if (!myCode) return
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
    Alert.alert('Code Copied', `${myCode} copied to clipboard.`)
  }

  const handlePairWithCode = async (targetCode: string) => {
    const formatted = targetCode.trim().toUpperCase()
    if (!formatted) return
    setPairLoading(true)
    try {
      await call('pairWithCode', { code: formatted })
      setShowPairModal(false)
      setPairCodeInput('')
      Alert.alert('Success', 'Device paired successfully over Hyperswarm DHT!')
      refresh()
    } catch (err: any) {
      Alert.alert('Pairing Failed', err?.message || 'Could not verify pairing code.')
    } finally {
      setPairLoading(false)
    }
  }

  const handlePair = () => handlePairWithCode(pairCodeInput)

  const handleScanCode = (scannedValue: string) => {
    let clean = scannedValue.trim().toUpperCase()
    if (clean.includes('CODE=')) {
      const match = clean.match(/CODE=([A-Z0-9-]+)/i)
      if (match && match[1]) clean = match[1]
    }
    setPairCodeInput(clean)
    setShowPairModal(true)
    handlePairWithCode(clean)
  }

  const handleForgetDevice = (dev: Device) => {
    Alert.alert(
      'Remove Device',
      `Are you sure you want to remove "${dev.name}" from your trusted mesh network?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await call('forgetDevice', { id: dev.id })
              setSelectedDevice(null)
              refresh()
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to remove device.')
            }
          },
        },
      ]
    )
  }

  const handleDirectSend = async (dev: Device) => {
    try {
      const files = await pickFiles()
      if (!files || files.length === 0) return
      for (const file of files) {
        await call('sendOffer', {
          recipientPeerId: dev.id,
          filePath: file.path,
          filename: file.name,
          fileSize: file.size,
        })
      }
      Alert.alert('Files Sent', `Offered ${files.length} file(s) to ${dev.name}.`)
    } catch (err: any) {
      Alert.alert('Send Failed', err?.message || 'Could not send files.')
    }
  }

  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      const matchesQuery =
        !query ||
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        (d.os && d.os.toLowerCase().includes(query.toLowerCase()))

      if (!matchesQuery) return false

      if (activeTab === 'online') return d.isOnline
      if (activeTab === 'trusted') return d.isTrusted
      if (activeTab === 'desktops')
        return (d.os || '').toLowerCase().match(/win|mac|linux|darwin/)
      if (activeTab === 'mobile')
        return (d.os || '').toLowerCase().match(/android|ios|iphone|ipad/)
      return true
    })
  }, [devices, query, activeTab])

  const onlineCount = useMemo(() => devices.filter((d) => d.isOnline).length, [devices])

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Pairing Code Hero Card */}
      <PairingCodeCard
        code={myCode}
        onCopy={copyMyCode}
        onShowQR={() => setShowQRModal(true)}
        onRefresh={refresh}
        copied={codeCopied}
        loading={codeLoading}
      />

      {/* Action Header & Scan Trigger */}
      <View style={styles.actionHeaderRow}>
        <View style={styles.flex1}>
          <SectionHeader
            title="Mesh Swarm"
            badge={devices.length}
          />
        </View>

        <View style={styles.topBtnGroup}>
          <TouchableOpacity
            style={styles.scanCodeBtn}
            onPress={() => setShowScanner(true)}
            activeOpacity={0.8}
          >
            <Camera size={14} color={theme.primary} />
            <Text style={styles.scanCodeText}>Scan QR</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pairCodeBtn}
            onPress={() => setShowPairModal(true)}
            activeOpacity={0.8}
          >
            <Plus size={14} color="#FFFFFF" />
            <Text style={styles.pairCodeText}>Pair</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Search size={15} color={theme.muted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search devices by name or OS…"
          placeholderTextColor={theme.muted}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={styles.clearSearchText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScroll}
      >
        {[
          { key: 'all', label: `All (${devices.length})` },
          { key: 'online', label: `Online (${onlineCount})` },
          { key: 'trusted', label: 'Trusted' },
          { key: 'desktops', label: 'Desktops' },
          { key: 'mobile', label: 'Mobile' },
        ].map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setActiveTab(tab.key as any)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive && styles.filterChipTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Device List or Empty Radar State */}
      {filteredDevices.length > 0 ? (
        <View style={styles.deviceList}>
          {filteredDevices.map((dev) => (
            <DeviceCard
              key={dev.id}
              device={dev}
              onPress={() => setSelectedDevice(dev)}
              onSendFile={() => handleDirectSend(dev)}
            />
          ))}
        </View>
      ) : (
        <RadarPulseEmptyState
          topicName="DHT Swarm Nodes"
          onScanQR={() => setShowScanner(true)}
        />
      )}

      {/* QR Code Modal for Self Identity */}
      <QRCodeModal
        visible={showQRModal}
        value={myCode}
        title="Your Node Pairing Matrix"
        subtitle="Scan with another MeshDrop node to link devices instantly"
        onClose={() => setShowQRModal(false)}
      />

      {/* QR Code Camera Scanner Modal */}
      <QRScannerModal
        visible={showScanner}
        title="Scan Pairing QR Code"
        instruction="Align camera with the QR code on your other device"
        onScan={handleScanCode}
        onClose={() => setShowScanner(false)}
      />

      {/* Manual Pair Code Modal */}
      <SimpleModal
        visible={showPairModal}
        title="Pair Node"
        subtitle="Enter the 16-character code shown on the other device"
        onClose={() => {
          setShowPairModal(false)
          setPairCodeInput('')
        }}
      >
        <View style={styles.pairModalContent}>
          <TextInput
            style={styles.pairInput}
            placeholder="MD-XXXX-XXXX-XXXX-XXXX"
            placeholderTextColor={theme.muted}
            value={pairCodeInput}
            onChangeText={(t) => setPairCodeInput(formatCodeInput(t))}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <View style={styles.pairActionsRow}>
            <Btn
              label="Cancel"
              variant="ghost"
              onPress={() => {
                setShowPairModal(false)
                setPairCodeInput('')
              }}
              style={styles.flex1}
            />
            <Btn
              label="Pair Node"
              variant="primary"
              onPress={handlePair}
              disabled={!pairCodeInput.trim() || pairLoading}
              loading={pairLoading}
              style={styles.flex1}
            />
          </View>
        </View>
      </SimpleModal>

      {/* Device Detail & Management Modal */}
      {selectedDevice && (
        <SimpleModal
          visible={Boolean(selectedDevice)}
          title={selectedDevice.name}
          subtitle={`Node ID: ${selectedDevice.id.slice(0, 12)}…`}
          onClose={() => setSelectedDevice(null)}
        >
          <View style={styles.detailContainer}>
            <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Connection Status</Text>
                <Pill
                  label={selectedDevice.isOnline ? 'Online · Connected' : 'Offline'}
                  color={selectedDevice.isOnline ? theme.success : theme.muted}
                  dot
                />
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Operating System</Text>
                <Text style={styles.detailValue}>{selectedDevice.os || 'Unknown'}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Trust Level</Text>
                <Pill
                  label={selectedDevice.isTrusted ? 'Verified & Trusted' : 'Standard Peer'}
                  color={selectedDevice.isTrusted ? theme.primary : theme.muted}
                  icon={ShieldCheck}
                />
              </View>

              {selectedDevice.ipAddress && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Direct IP</Text>
                  <Text style={styles.detailValueMono}>{selectedDevice.ipAddress}</Text>
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
    backgroundColor: theme.bg,
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
    backgroundColor: theme.primarySoft,
    borderColor: 'rgba(79, 70, 229, 0.2)',
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  scanCodeText: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  pairCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.primary,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    shadowColor: theme.primary,
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
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    color: theme.text,
    fontSize: 13,
    padding: 0,
  },
  clearSearchText: {
    color: theme.muted,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterChipActive: {
    backgroundColor: theme.primarySoft,
    borderColor: 'rgba(79, 70, 229, 0.3)',
  },
  filterChipText: {
    color: theme.muted,
    fontSize: 11.5,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: theme.primary,
    fontWeight: '800',
  },
  deviceList: {
    marginTop: 4,
  },
  pairModalContent: {
    paddingVertical: 8,
  },
  pairInput: {
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    padding: 14,
    color: theme.primary,
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
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
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
    color: theme.muted,
    fontSize: 12.5,
    fontWeight: '700',
  },
  detailValue: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '800',
  },
  detailValueMono: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: fonts.mono,
  },
  detailActions: {
    gap: 4,
  },
})
