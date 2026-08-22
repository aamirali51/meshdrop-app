import React, { useEffect, useState } from 'react'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import {
  Upload,
  FileText,
  Laptop,
  Smartphone,
  Monitor,
  X,
  CheckCircle2,
  AlertCircle,
  Zap,
  Send,
} from 'lucide-react-native'
import { call } from '../bridge'
import { useTheme, fonts } from '../theme'
import { Pill, PulseIndicator } from '../components'
import type { SharedPayload } from '../shareTarget'

interface ShareTargetModalProps {
  visible: boolean
  payload: SharedPayload | null
  onClose: () => void
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

function getDeviceIcon(os?: string) {
  const s = String(os || '').toLowerCase()
  if (s.includes('android') || s.includes('ios') || s.includes('iphone')) {
    return Smartphone
  }
  if (s.includes('mac') || s.includes('win') || s.includes('linux')) {
    return Laptop
  }
  return Monitor
}

export function ShareTargetModal({ visible, payload, onClose }: ShareTargetModalProps) {
  const { theme } = useTheme()
  const [devices, setDevices] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [sendingDevice, setSendingDevice] = useState<string | null>(null)
  const [successDevice, setSuccessDevice] = useState<string | null>(null)

  useEffect(() => {
    if (visible) {
      setSuccessDevice(null)
      setSendingDevice(null)
      setLoading(true)
      call('listDevices')
        .then((devs) => {
          if (Array.isArray(devs)) {
            setDevices(devs)
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [visible])

  if (!visible || !payload) return null

  const itemCount = payload.items?.length || (payload.text ? 1 : 0)
  const totalBytes = payload.items?.reduce((acc, it) => acc + (it.size || 0), 0) || 0

  const handleSendToDevice = async (device: any) => {
    if (!payload) return
    setSendingDevice(device.id || device.publicKey)
    try {
      if (payload.type === 'files' && payload.items?.length > 0) {
        for (const item of payload.items) {
          await call('sendOffer', {
            recipientPeerId: device.id || device.publicKey,
            filePath: item.path,
            filename: item.name,
            fileSize: item.size,
          })
        }
      } else if (payload.type === 'text' && payload.text) {
        await call('sendOffer', {
          recipientPeerId: device.id || device.publicKey,
          text: payload.text,
          filename: `note_${Date.now()}.txt`,
          fileSize: unescape(encodeURIComponent(payload.text)).length,
        })
      }

      setSuccessDevice(device.name || 'Device')
      setTimeout(() => {
        onClose()
      }, 1400)
    } catch (err: any) {
      Alert.alert('Transfer Error', err?.message || 'Could not dispatch share offer.')
      setSendingDevice(null)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.bgCard }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconCircle, { backgroundColor: theme.primarySoft }]}>
                <Upload size={20} color={theme.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.text }]}>Share to MeshDrop</Text>
                <Text style={[styles.subtitle, { color: theme.muted }]}>Select a paired device to send</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: theme.bgElevated }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={18} color={theme.muted} />
            </TouchableOpacity>
          </View>

          {/* Shared Content Summary Card */}
          <View style={[styles.summaryCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
            <View style={[styles.summaryIconBox, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <FileText size={22} color={theme.primary} />
            </View>
            <View style={styles.summaryDetails}>
              <Text style={[styles.summaryTitle, { color: theme.text }]} numberOfLines={1}>
                {payload.type === 'text'
                  ? 'Shared Text'
                  : payload.items?.length === 1
                  ? payload.items[0].name
                  : `${payload.items?.length || 0} Files Selected`}
              </Text>
              <Text style={[styles.summarySub, { color: theme.muted }]}>
                {payload.type === 'text'
                  ? `${payload.text?.length || 0} characters`
                  : formatBytes(totalBytes)}
              </Text>
            </View>
          </View>

          {/* Success State Notification */}
          {successDevice && (
            <View style={[styles.successBanner, { backgroundColor: theme.successBg, borderColor: theme.successBorder }]}>
              <CheckCircle2 size={20} color={theme.success} />
              <Text style={[styles.successText, { color: theme.success }]}>Dispatched to {successDevice}!</Text>
            </View>
          )}

          {/* Device Selection List */}
          <Text style={[styles.sectionLabel, { color: theme.muted }]}>DESTINATION DEVICE</Text>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.muted }]}>Locating mesh peers...</Text>
            </View>
          ) : devices.length === 0 ? (
            <View style={styles.emptyBox}>
              <AlertCircle size={28} color={theme.muted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No Paired Devices</Text>
              <Text style={[styles.emptySub, { color: theme.muted }]}>
                Pair with another device using a pairing code in the MeshDrop app first.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.deviceList} showsVerticalScrollIndicator={false}>
              {devices.map((device) => {
                const IconComponent = getDeviceIcon(device.os)
                const isSending = sendingDevice === (device.id || device.publicKey)
                const isOnline = device.isOnline

                return (
                  <TouchableOpacity
                    key={device.id || device.publicKey}
                    style={[
                      styles.deviceCard,
                      { backgroundColor: theme.bgCard, borderColor: theme.border },
                      !isOnline && [styles.deviceCardOffline, { backgroundColor: theme.bgElevated }],
                      isSending && { borderColor: theme.primary },
                    ]}
                    disabled={isSending || !!successDevice}
                    onPress={() => handleSendToDevice(device)}>
                    <View style={[styles.deviceIconWrapper, { backgroundColor: theme.bgElevated }]}>
                      <IconComponent
                        size={22}
                        color={isOnline ? theme.primary : theme.muted}
                      />
                    </View>

                    <View style={styles.deviceInfo}>
                      <Text style={[styles.deviceName, { color: theme.text }]} numberOfLines={1}>
                        {device.name || 'Unnamed Peer'}
                      </Text>
                      <View style={styles.statusRow}>
                        <PulseIndicator color={isOnline ? theme.success : theme.muted} />
                        <Text style={[styles.deviceStatusText, { color: theme.muted }]}>
                          {isOnline ? 'Online & Ready' : 'Offline'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.sendAction}>
                      {isSending ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <View style={[styles.sendBtnPill, { backgroundColor: theme.primarySoft }]}>
                          <Send size={14} color={isOnline ? theme.primary : theme.muted} />
                          <Text
                            style={[
                              styles.sendBtnText,
                              { color: theme.primary },
                              !isOnline && { color: theme.muted },
                            ]}>
                            Send
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
  },
  summaryIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  summaryDetails: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  summarySub: {
    fontSize: 12,
    marginTop: 2,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  successText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  loadingBox: {
    paddingVertical: 36,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyBox: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 260,
  },
  deviceList: {
    maxHeight: 280,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  deviceCardOffline: {
    opacity: 0.65,
  },
  deviceIconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  deviceStatusText: {
    fontSize: 12,
  },
  sendAction: {
    paddingLeft: 4,
  },
  sendBtnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  sendBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
})

