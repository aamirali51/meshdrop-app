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
import { theme, fonts } from '../theme'
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
        // If text was shared, send as a quick text snippet or offer
        await call('sendOffer', {
          recipientPeerId: device.id || device.publicKey,
          text: payload.text,
          filename: `note_${Date.now()}.txt`,
          fileSize: Buffer.byteLength(payload.text, 'utf8'),
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
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.iconCircle}>
                <Upload size={20} color={theme.primary} />
              </View>
              <View>
                <Text style={styles.title}>Share to MeshDrop</Text>
                <Text style={styles.subtitle}>Select a paired device to send</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={18} color={theme.muted} />
            </TouchableOpacity>
          </View>

          {/* Shared Content Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconBox}>
              <FileText size={22} color={theme.primary} />
            </View>
            <View style={styles.summaryDetails}>
              <Text style={styles.summaryTitle} numberOfLines={1}>
                {payload.type === 'text'
                  ? 'Shared Text'
                  : payload.items?.length === 1
                  ? payload.items[0].name
                  : `${payload.items?.length || 0} Files Selected`}
              </Text>
              <Text style={styles.summarySub}>
                {payload.type === 'text'
                  ? `${payload.text?.length || 0} characters`
                  : formatBytes(totalBytes)}
              </Text>
            </View>
          </View>

          {/* Success State Notification */}
          {successDevice && (
            <View style={styles.successBanner}>
              <CheckCircle2 size={20} color={theme.success} />
              <Text style={styles.successText}>Dispatched to {successDevice}!</Text>
            </View>
          )}

          {/* Device Selection List */}
          <Text style={styles.sectionLabel}>DESTINATION DEVICE</Text>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={theme.primary} />
              <Text style={styles.loadingText}>Locating mesh peers...</Text>
            </View>
          ) : devices.length === 0 ? (
            <View style={styles.emptyBox}>
              <AlertCircle size={28} color={theme.muted} />
              <Text style={styles.emptyTitle}>No Paired Devices</Text>
              <Text style={styles.emptySub}>
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
                      !isOnline && styles.deviceCardOffline,
                      isSending && styles.deviceCardSending,
                    ]}
                    disabled={isSending || !!successDevice}
                    onPress={() => handleSendToDevice(device)}>
                    <View style={styles.deviceIconWrapper}>
                      <IconComponent
                        size={22}
                        color={isOnline ? theme.primary : theme.muted}
                      />
                    </View>

                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceName} numberOfLines={1}>
                        {device.name || 'Unnamed Peer'}
                      </Text>
                      <View style={styles.statusRow}>
                        <PulseIndicator active={isOnline} />
                        <Text style={styles.deviceStatusText}>
                          {isOnline ? 'Online & Ready' : 'Offline'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.sendAction}>
                      {isSending ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <View style={styles.sendBtnPill}>
                          <Send size={14} color={isOnline ? theme.primary : theme.muted} />
                          <Text
                            style={[
                              styles.sendBtnText,
                              !isOnline && styles.sendBtnTextOffline,
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
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.bgCard,
    borderTopLeftRadius: theme.radiusLg,
    borderTopRightRadius: theme.radiusLg,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    maxHeight: '85%',
    ...theme.shadowLg,
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
    borderRadius: theme.radiusSm,
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.text,
  },
  subtitle: {
    fontSize: 12,
    color: theme.muted,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.bgElevated,
    padding: 14,
    borderRadius: theme.radius,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  summaryIconBox: {
    width: 44,
    height: 44,
    borderRadius: theme.radiusSm,
    backgroundColor: theme.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  summaryDetails: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
  },
  summarySub: {
    fontSize: 12,
    color: theme.muted,
    marginTop: 2,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.successBg,
    borderColor: theme.successBorder,
    borderWidth: 1,
    padding: 12,
    borderRadius: theme.radiusSm,
    marginBottom: 14,
  },
  successText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.success,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.muted,
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
    color: theme.muted,
  },
  emptyBox: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
  },
  emptySub: {
    fontSize: 12,
    color: theme.muted,
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
    backgroundColor: theme.bgCard,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 10,
    gap: 12,
    ...theme.shadowSm,
  },
  deviceCardOffline: {
    opacity: 0.65,
    backgroundColor: theme.bgElevated,
  },
  deviceCardSending: {
    borderColor: theme.primary,
  },
  deviceIconWrapper: {
    width: 42,
    height: 42,
    borderRadius: theme.radiusSm,
    backgroundColor: theme.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  deviceStatusText: {
    fontSize: 12,
    color: theme.muted,
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
    borderRadius: theme.radiusFull,
    backgroundColor: theme.primarySoft,
  },
  sendBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.primary,
  },
  sendBtnTextOffline: {
    color: theme.muted,
  },
})
