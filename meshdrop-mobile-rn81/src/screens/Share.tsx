import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Share as NativeShare,
  Alert,
} from 'react-native'
import {
  Upload,
  Clock,
  Copy,
  Check,
  Trash2,
  QrCode,
  FileText,
  Plus,
  Share2,
  Zap,
  Send,
  Sparkles,
  Layers,
  ShieldCheck,
} from 'lucide-react-native'
import { call, on } from '../bridge'
import {
  Card,
  Btn,
  Pill,
  SectionHeader,
  SimpleModal,
} from '../components'
import { StagingBasket, type StagedItem } from '../components/StagingBasket'
import { QRCodeModal } from '../components/QRCodeModal'
import { pickFiles } from '../filePicker'
import { copyToClipboard } from '../clipboard'
import { useTheme, fonts } from '../theme'

interface PendingShare {
  id: string
  code: string
  filename: string
  fileSize: number
  expiresAt: number
  status: string
  downloadCount?: number
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

export function Share() {
  const { theme } = useTheme()
  const [activeShares, setActiveShares] = useState<PendingShare[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([])
  const [basketOpen, setBasketOpen] = useState(false)

  // QR presentation modal
  const [qrModalShare, setQrModalShare] = useState<PendingShare | null>(null)

  // Direct send device target picker modal
  const [showRecipientModal, setShowRecipientModal] = useState(false)
  const [onlineDevices, setOnlineDevices] = useState<any[]>([])

  const refreshShares = useCallback(() => {
    call('listPendingShares')
      .then((res: any) => {
        if (Array.isArray(res)) setActiveShares(res)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshShares()
    const unsub = on('drop:created', () => {
      refreshShares()
    })
    const unsubClaimed = on('drop:claimed', () => {
      refreshShares()
    })
    const unsubExpired = on('drop:expired', () => {
      refreshShares()
    })
    return () => {
      unsub()
      unsubClaimed()
      unsubExpired()
    }
  }, [refreshShares])

  const handlePickFiles = async () => {
    const files = await pickFiles()
    if (!files || files.length === 0) return

    const newItems: StagedItem[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      name: f.name,
      path: f.path,
      size: f.size,
      type: f.name.includes('.') ? f.name.split('.').pop() : 'file',
    }))

    setStagedItems((prev) => [...prev, ...newItems])
    setBasketOpen(true)
  }

  const handleRemoveStagedItem = (id: string) => {
    setStagedItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleClearStaging = () => {
    setStagedItems([])
  }

  const handleGenerateDropCode = async (items: StagedItem[]) => {
    if (items.length === 0) return
    try {
      const filePaths = items.map((i) => i.path)
      const res: any = await call('createMultiDropShare', {
        filePaths,
        names: items.map((i) => i.name),
        sizes: items.map((i) => i.size),
      })
      if (res && res.code) {
        setStagedItems([])
        refreshShares()
        Alert.alert(
          'Drop Code Created!',
          `Code: ${res.code}\nShare this code with your peer to download the ${items.length} file(s).`
        )
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not generate drop code.')
    }
  }

  const handleOpenDirectSendPicker = () => {
    call('listDevices')
      .then((res: any) => {
        if (Array.isArray(res)) {
          setOnlineDevices(res)
          setShowRecipientModal(true)
        }
      })
      .catch(() => {
        Alert.alert('Swarm Error', 'Could not query online devices.')
      })
  }

  const handleSendToDevice = async (device: any) => {
    if (stagedItems.length === 0) return
    setShowRecipientModal(false)

    for (const item of stagedItems) {
      call('sendFileOffer', {
        targetDeviceId: device.id,
        filePath: item.path,
        fileName: item.name,
        size: item.size,
      }).catch((err: any) => {
        Alert.alert('Beam Error', err?.message || 'Failed to dispatch file.')
      })
    }

    setStagedItems([])
    Alert.alert('Beaming Files', `Offered ${stagedItems.length} file(s) to ${device.name}.`)
  }

  const handleCopyCode = async (share: PendingShare) => {
    const ok = await copyToClipboard(share.code)
    setCopiedId(share.id)
    setTimeout(() => setCopiedId(null), 2000)
    Alert.alert(
      'Drop Code Copied',
      ok ? `${share.code} copied to clipboard.` : 'Clipboard is not available.'
    )
  }

  const handleShareNative = async (share: PendingShare) => {
    try {
      await NativeShare.share({
        message: `MeshDrop Code: ${share.code}\nDownload ${share.filename} (${formatBytes(share.fileSize)}) peer-to-peer on MeshDrop.`,
        title: 'MeshDrop Share Code',
      })
    } catch {}
  }

  const handleDeleteShare = (id: string) => {
    call('deletePendingShare', { id })
      .then(() => {
        setActiveShares((prev) => prev.filter((s) => s.id !== id))
      })
      .catch(() => {})
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Dispatch Card */}
      <Card glow style={[styles.heroCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <View style={styles.heroHeader}>
          <View style={[styles.heroIconBox, { backgroundColor: theme.primarySoft, borderColor: theme.primary + '35' }]}>
            <Upload size={22} color={theme.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.heroTitle, { color: theme.text }]}>Beam Files & Folders</Text>
            <Text style={[styles.heroSub, { color: theme.textSecondary }]}>
              Stage payloads to share via Drop code or direct P2P stream
            </Text>
          </View>
        </View>

        <Text style={[styles.heroDescription, { color: theme.textSecondary }]}>
          Select documents, photos, videos, or folders to generate high-speed zero-knowledge transmission links.
        </Text>

        <View style={styles.heroActionsRow}>
          <Btn
            label="Pick Files to Stage"
            icon={Plus}
            variant="primary"
            onPress={handlePickFiles}
            style={styles.flex1}
          />
        </View>
      </Card>

      {/* Staged Payload Basket */}
      {stagedItems.length > 0 && (
        <StagingBasket
          items={stagedItems}
          isOpen={basketOpen}
          onToggleOpen={() => setBasketOpen(!basketOpen)}
          onRemoveItem={handleRemoveStagedItem}
          onClear={handleClearStaging}
          onDirectSend={handleOpenDirectSendPicker}
          onGenerateDropCode={handleGenerateDropCode}
        />
      )}

      {/* Active Shares Section */}
      <SectionHeader title="Active Drop Codes" badge={activeShares.length} />

      {activeShares.length === 0 ? (
        <Card style={[styles.emptySharesCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Layers size={32} color={theme.muted} style={{ marginBottom: 8 }} />
          <Text style={[styles.emptySharesTitle, { color: theme.text }]}>No Active Drop Codes</Text>
          <Text style={[styles.emptySharesSub, { color: theme.muted }]}>
            Stage and share files to create persistent, single-use, or broadcast drop codes.
          </Text>
        </Card>
      ) : (
        <View style={styles.sharesList}>
          {activeShares.map((share) => {
            const isCopied = copiedId === share.id
            return (
              <Card key={share.id} style={[styles.shareCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                <View style={styles.shareHeader}>
                  <View style={[styles.fileIconBox, { backgroundColor: theme.primarySoft }]}>
                    <FileText size={18} color={theme.primary} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={[styles.shareFilename, { color: theme.text }]} numberOfLines={1}>
                      {share.filename}
                    </Text>
                    <Text style={[styles.shareMeta, { color: theme.textSecondary }]}>
                      {formatBytes(share.fileSize)} · {share.downloadCount || 0} claims
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.trashBtn}
                    onPress={() => handleDeleteShare(share.id)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={15} color={theme.danger} />
                  </TouchableOpacity>
                </View>

                {/* Drop Code Pill */}
                <TouchableOpacity
                  style={[styles.codePill, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
                  onPress={() => handleCopyCode(share)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.codeText, { color: theme.primary }]}>{share.code}</Text>
                  <Copy size={13} color={theme.primary} />
                </TouchableOpacity>

                {/* Share Actions */}
                <View style={styles.shareActions}>
                  <Btn
                    label={isCopied ? 'Copied' : 'Copy'}
                    icon={isCopied ? Check : Copy}
                    variant="secondary"
                    size="sm"
                    onPress={() => handleCopyCode(share)}
                    style={styles.flex1}
                  />
                  <Btn
                    label="QR Code"
                    icon={QrCode}
                    variant="secondary"
                    size="sm"
                    onPress={() => setQrModalShare(share)}
                    style={styles.flex1}
                  />
                  <Btn
                    label="Share"
                    icon={Share2}
                    variant="primary"
                    size="sm"
                    onPress={() => handleShareNative(share)}
                    style={styles.flex1}
                  />
                </View>
              </Card>
            )
          })}
        </View>
      )}

      {/* QR Code Presentation Modal */}
      {qrModalShare && (
        <QRCodeModal
          visible={Boolean(qrModalShare)}
          title="Drop QR Matrix"
          subtitle={`Scan to claim "${qrModalShare.filename}" (${formatBytes(qrModalShare.fileSize)})`}
          value={`DROP=${qrModalShare.code}`}
          onClose={() => setQrModalShare(null)}
        />
      )}

      {/* Direct Send Recipient Picker Modal */}
      <SimpleModal
        visible={showRecipientModal}
        title="Select Target Device"
        subtitle={`Beam ${stagedItems.length} staged file(s) to a connected peer`}
        onClose={() => setShowRecipientModal(false)}
      >
        <View style={styles.recipientList}>
          {onlineDevices.length === 0 ? (
            <Text style={[styles.noDevicesText, { color: theme.muted }]}>
              No peer devices discovered on the mesh swarm.
            </Text>
          ) : (
            onlineDevices.map((dev) => (
              <TouchableOpacity
                key={dev.id}
                style={[
                  styles.recipientItem,
                  { backgroundColor: theme.bgElevated, borderColor: theme.border },
                  !dev.isOnline && styles.recipientItemOffline,
                ]}
                onPress={() => handleSendToDevice(dev)}
                disabled={!dev.isOnline}
                activeOpacity={0.8}
              >
                <View style={styles.recipientInfo}>
                  <Text style={[styles.recipientName, { color: theme.text }]}>{dev.name}</Text>
                  <Text style={[styles.recipientMeta, { color: theme.muted }]}>
                    {dev.os || 'Mesh Node'} · {dev.isOnline ? 'Online' : 'Offline'}
                  </Text>
                </View>
                <Pill
                  label={dev.isOnline ? 'Beam Now' : 'Offline'}
                  color={dev.isOnline ? theme.primary : theme.muted}
                />
              </TouchableOpacity>
            ))
          )}
        </View>
      </SimpleModal>
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
  heroCard: {
    padding: 18,
    marginBottom: 16,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  heroIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: 12,
    marginTop: 1,
  },
  heroDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  heroActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sharesList: {
    gap: 10,
    marginTop: 6,
  },
  shareCard: {
    padding: 14,
    marginBottom: 10,
  },
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  fileIconBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareFilename: {
    fontSize: 14,
    fontWeight: '800',
  },
  shareMeta: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: fonts.mono,
  },
  trashBtn: {
    padding: 6,
  },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  codeText: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: fonts.mono,
    letterSpacing: 1.2,
  },
  shareActions: {
    flexDirection: 'row',
    gap: 8,
  },
  emptySharesCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderStyle: 'dashed',
    marginTop: 6,
  },
  emptySharesTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySharesSub: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  recipientList: {
    gap: 8,
    paddingVertical: 8,
  },
  recipientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  recipientItemOffline: {
    opacity: 0.5,
  },
  recipientInfo: {
    flex: 1,
  },
  recipientName: {
    fontSize: 14,
    fontWeight: '800',
  },
  recipientMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  noDevicesText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
})

