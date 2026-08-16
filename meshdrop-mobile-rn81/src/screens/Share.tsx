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
import { theme, fonts } from '../theme'

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

function formatRemaining(expiresAt: number): string {
  if (!expiresAt || expiresAt <= 0) return 'Permanent'
  const ms = expiresAt - Date.now()
  if (ms <= 0) return 'Expired'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}m ${s}s`
}

export function Share() {
  const [activeShares, setActiveShares] = useState<PendingShare[]>([])
  const [busy, setBusy] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Staged Basket State
  const [stagedFiles, setStagedFiles] = useState<StagedItem[]>([])
  const [showRecipientModal, setShowRecipientModal] = useState(false)
  const [pairedDevices, setPairedDevices] = useState<any[]>([])

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [customFileName, setCustomFileName] = useState('')
  const [expirationPreset, setExpirationPreset] = useState<'15m' | '1h' | '24h'>('1h')

  // QR Modal State
  const [qrCodeTarget, setQrCodeTarget] = useState<string | null>(null)

  const refresh = useCallback(() => {
    call('listPendingShares')
      .then((shares) => {
        if (Array.isArray(shares)) setActiveShares(shares)
      })
      .catch(() => {})

    call('listDevices')
      .then((devs) => {
        if (Array.isArray(devs)) setPairedDevices(devs)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 2500)
    const events = ['transfer:started', 'transfer:completed', 'transfer:cancelled']
    const unsubs = events.map((e) => on(e, refresh))
    return () => {
      clearInterval(timer)
      unsubs.forEach((u) => u())
    }
  }, [refresh])

  const handlePickAndStageFiles = async () => {
    try {
      const files = await pickFiles()
      if (!files || files.length === 0) return
      const newItems: StagedItem[] = files.map((f) => ({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: f.name,
        size: f.size,
        path: f.path,
      }))
      setStagedFiles((prev) => [...prev, ...newItems])
    } catch {}
  }

  const handleRemoveStagedItem = (id: string) => {
    setStagedFiles((prev) => prev.filter((it) => it.id !== id))
  }

  const handleSendToDevice = async (device: any) => {
    if (stagedFiles.length === 0) return
    setBusy(true)
    try {
      for (const item of stagedFiles) {
        await call('sendOffer', {
          recipientPeerId: device.id,
          filePath: item.path,
          filename: item.name,
          fileSize: item.size,
        })
      }
      setShowRecipientModal(false)
      setStagedFiles([])
      Alert.alert(
        'Beam Dispatched',
        `Successfully sent ${stagedFiles.length} file(s) to ${device.name}.`
      )
    } catch (err: any) {
      Alert.alert('Send Failed', err?.message || 'Could not send files to device.')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateDropCode = async () => {
    if (stagedFiles.length === 0) {
      Alert.alert('No Files Staged', 'Please select at least one file to share.')
      return
    }

    const firstItem = stagedFiles[0]

    setBusy(true)
    try {
      const res: any = await call('createDropCode', {
        files: stagedFiles.map((item) => ({
          filePath: item.path,
          filename: item.name,
          fileSize: item.size,
        })),
        filename: customFileName.trim() || undefined,
        expirationPreset,
      })

      setShowCreateModal(false)
      setCustomFileName('')
      setStagedFiles([])
      refresh()

      if (res && res.code) {
        Alert.alert(
          'Quantum DROP Code Created',
          `Code: ${res.code}\nRecipient can claim this file with zero pairing required.`,
          [
            { text: 'Done', style: 'cancel' },
            {
              text: 'Share Code',
              onPress: () => {
                NativeShare.share({
                  message: `MeshDrop Code: ${res.code}\nEnter this code in MeshDrop to download "${firstItem.name}" directly.`,
                  title: 'MeshDrop One-Time Share',
                }).catch(() => {})
              },
            },
          ]
        )
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to generate drop code.')
    } finally {
      setBusy(false)
    }
  }

  const handleCancelShare = async (id: string) => {
    try {
      await call('cancelDropCode', { id })
      refresh()
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to cancel share.')
    }
  }

  const handleCopyCode = async (code: string, id: string) => {
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    const ok = await copyToClipboard(code)
    Alert.alert(
      'Code Copied',
      ok ? `${code} copied to clipboard.` : 'Clipboard is not available on this build.'
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Quantum Beam Card */}
      <Card glow style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroIconBox}>
            <Upload size={22} color={theme.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.heroTitle}>Quantum Beam</Text>
            <Text style={styles.heroSub}>P2P Direct File & Folder Transmission</Text>
          </View>
        </View>

        <Text style={styles.heroDescription}>
          Stage files to beam directly to your paired mesh swarm, or generate a 1-time DROP code for air-drop to any remote device.
        </Text>

        <View style={styles.heroActionsRow}>
          <Btn
            label="Select Files to Beam"
            icon={Plus}
            variant="primary"
            onPress={handlePickAndStageFiles}
            style={styles.flex1}
          />
        </View>
      </Card>

      {/* Staged Basket Tray */}
      {stagedFiles.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <StagingBasket
            items={stagedFiles}
            onRemoveItem={handleRemoveStagedItem}
            onAddMore={handlePickAndStageFiles}
            onSelectRecipient={() => setShowRecipientModal(true)}
            onCreateDropCode={() => setShowCreateModal(true)}
          />
        </View>
      )}

      {/* Active One-Time DROP Shares */}
      <SectionHeader
        title="Active Quantum DROP Codes"
        badge={activeShares.length}
      />

      {activeShares.length > 0 ? (
        <View style={styles.sharesList}>
          {activeShares.map((share) => {
            const isCopied = copiedId === share.id
            return (
              <Card key={share.id} style={styles.shareCard}>
                <View style={styles.shareHeader}>
                  <View style={styles.fileIconBox}>
                    <FileText size={18} color={theme.primary} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.shareFilename} numberOfLines={1}>
                      {share.filename}
                    </Text>
                    <Text style={styles.shareMeta}>
                      {formatBytes(share.fileSize)} · Expires in {formatRemaining(share.expiresAt)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleCancelShare(share.id)}
                    style={styles.trashBtn}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={15} color={theme.danger} />
                  </TouchableOpacity>
                </View>

                {/* Monospace Code Box */}
                <TouchableOpacity
                  style={styles.codePill}
                  activeOpacity={0.8}
                  onPress={() => handleCopyCode(share.code, share.id)}
                >
                  <Text style={styles.codeText}>{share.code}</Text>
                  <Copy size={12} color={theme.primary} />
                </TouchableOpacity>

                {/* Action Buttons */}
                <View style={styles.shareActions}>
                  <Btn
                    label={isCopied ? 'Copied' : 'Copy'}
                    icon={isCopied ? Check : Copy}
                    variant="secondary"
                    size="sm"
                    onPress={() => handleCopyCode(share.code, share.id)}
                    style={styles.flex1}
                  />
                  <Btn
                    label="QR Matrix"
                    icon={QrCode}
                    variant="secondary"
                    size="sm"
                    onPress={() => setQrCodeTarget(share.code)}
                    style={styles.flex1}
                  />
                  <Btn
                    label="Share"
                    icon={Share2}
                    variant="primary"
                    size="sm"
                    onPress={() => {
                      NativeShare.share({
                        message: `MeshDrop Code: ${share.code}\nEnter this code in MeshDrop to download "${share.filename}".`,
                        title: 'MeshDrop Code',
                      }).catch(() => {})
                    }}
                    style={styles.flex1}
                  />
                </View>
              </Card>
            )
          })}
        </View>
      ) : (
        <Card style={styles.emptySharesCard}>
          <Text style={styles.emptySharesTitle}>No Active DROP Codes</Text>
          <Text style={styles.emptySharesSub}>
            Select files above to create an instant 1-time DROP code with automatic expiry.
          </Text>
        </Card>
      )}

      {/* Recipient Selection Modal */}
      <SimpleModal
        visible={showRecipientModal}
        title="Target Peer Node"
        subtitle="Select an online peer to beam staged payload"
        onClose={() => setShowRecipientModal(false)}
      >
        <View style={styles.recipientList}>
          {pairedDevices.length > 0 ? (
            pairedDevices.map((dev) => (
              <TouchableOpacity
                key={dev.id}
                style={[styles.recipientItem, !dev.isOnline && styles.recipientItemOffline]}
                disabled={!dev.isOnline || busy}
                onPress={() => handleSendToDevice(dev)}
                activeOpacity={0.8}
              >
                <View style={styles.recipientInfo}>
                  <Text style={styles.recipientName}>{dev.name}</Text>
                  <Text style={styles.recipientMeta}>
                    {dev.os || 'Mesh Node'} · {dev.isOnline ? 'Online' : 'Offline'}
                  </Text>
                </View>
                <Send size={16} color={dev.isOnline ? theme.primary : theme.muted} />
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.noDevicesText}>
              No paired devices found. Pair a device in the Swarm tab first or use a DROP code.
            </Text>
          )}
        </View>
      </SimpleModal>

      {/* Create DROP Code Modal */}
      <SimpleModal
        visible={showCreateModal}
        title="Create Quantum DROP Code"
        subtitle="Generate temporary peer access code"
        onClose={() => setShowCreateModal(false)}
      >
        <View style={styles.createModalContent}>
          <Text style={styles.inputLabel}>Payload Display Name (Optional)</Text>
          <TextInput
            style={styles.textInput}
            placeholder={stagedFiles[0]?.name || 'Enter display name…'}
            placeholderTextColor={theme.muted}
            value={customFileName}
            onChangeText={setCustomFileName}
          />

          <Text style={styles.inputLabel}>Expiration Window</Text>
          <View style={styles.presetsRow}>
            {(['15m', '1h', '24h'] as const).map((p) => {
              const isActive = expirationPreset === p
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.presetChip, isActive && styles.presetChipActive]}
                  onPress={() => setExpirationPreset(p)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      isActive && styles.presetChipTextActive,
                    ]}
                  >
                    {p === '15m' ? '15 Minutes' : p === '1h' ? '1 Hour' : '24 Hours'}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Btn
            label="Generate DROP Code"
            icon={Sparkles}
            variant="primary"
            onPress={handleCreateDropCode}
            loading={busy}
            style={{ marginTop: 16 }}
          />
        </View>
      </SimpleModal>

      {/* QR Code Viewer Modal */}
      {qrCodeTarget && (
        <QRCodeModal
          visible={Boolean(qrCodeTarget)}
          value={qrCodeTarget}
          title="DROP Code Matrix"
          subtitle="Scan with recipient device to initiate instant download"
          onClose={() => setQrCodeTarget(null)}
        />
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
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.2)',
  },
  heroTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  heroSub: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  heroDescription: {
    color: theme.textSecondary,
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
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
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
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareFilename: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
  },
  shareMeta: {
    color: theme.textSecondary,
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
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  codeText: {
    color: theme.primary,
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
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
    borderStyle: 'dashed',
    marginTop: 6,
  },
  emptySharesTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySharesSub: {
    color: theme.muted,
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
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    padding: 12,
  },
  recipientItemOffline: {
    opacity: 0.5,
  },
  recipientInfo: {
    flex: 1,
  },
  recipientName: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
  },
  recipientMeta: {
    color: theme.muted,
    fontSize: 11,
    marginTop: 2,
  },
  noDevicesText: {
    color: theme.muted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  createModalContent: {
    paddingVertical: 8,
  },
  inputLabel: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    padding: 12,
    color: theme.text,
    fontSize: 13,
    marginBottom: 10,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radiusSm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  presetChipActive: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  presetChipText: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  presetChipTextActive: {
    color: theme.primary,
    fontWeight: '900',
  },
})
