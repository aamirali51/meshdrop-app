import React from 'react'
import {
  View,
  Text,
  StyleSheet,
} from 'react-native'
import {
  Download,
  ShieldCheck,
  Check,
  X,
  FileText,
  Zap,
} from 'lucide-react-native'
import { SimpleModal, Btn, Pill } from '../components'
import { useTheme, fonts } from '../theme'

interface TransferApprovalDialogProps {
  visible: boolean
  transfer?: {
    id?: string
    transferId?: string
    filename?: string
    fileSize?: number
    peerName?: string
    peerId?: string
    senderIdentity?: { name?: string; id?: string }
  } | null
  onAccept: (id: string) => void
  onDecline: (id: string) => void
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

export function TransferApprovalDialog({
  visible,
  transfer,
  onAccept,
  onDecline,
  onClose,
}: TransferApprovalDialogProps) {
  const { theme } = useTheme()
  if (!transfer) return null

  const resolvedId = transfer.id || transfer.transferId || ''
  const resolvedName = transfer.peerName || transfer.senderIdentity?.name || 'Remote Peer'

  return (
    <SimpleModal
      visible={visible}
      title="Incoming Transmission"
      subtitle="Encrypted peer-to-peer file offer"
      onClose={onClose}
    >
      <View style={styles.container}>
        {/* File Details Hero */}
        <View style={[styles.fileCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
          <View style={[styles.fileIconBox, { backgroundColor: theme.primarySoft, borderColor: theme.primary + '35' }]}>
            <FileText size={22} color={theme.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={2}>
              {transfer.filename || 'Incoming File'}
            </Text>
            <Text style={[styles.fileMeta, { color: theme.textSecondary }]}>
              Size: {formatBytes(transfer.fileSize)} · Direct P2P
            </Text>
          </View>
        </View>

        {/* Sender Info Row */}
        <View style={[styles.senderRow, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
          <Text style={[styles.senderLabel, { color: theme.muted }]}>From Peer:</Text>
          <View style={styles.senderBadge}>
            <View style={[styles.senderDot, { backgroundColor: theme.success }]} />
            <Text style={[styles.senderName, { color: theme.text }]}>{resolvedName}</Text>
          </View>
        </View>

        <View style={styles.trustBadgeRow}>
          <Pill label="End-to-End Encrypted" color={theme.primary} icon={ShieldCheck} />
          <Pill label="Zero-Cloud Direct" color={theme.success} icon={Zap} />
        </View>

        <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
          Files are received directly through encrypted Hyperswarm DHT streams and written directly to your device storage.
        </Text>

        {/* Action Buttons */}
        <View style={styles.btnRow}>
          <Btn
            label="Decline"
            icon={X}
            variant="ghost"
            onPress={() => onDecline(resolvedId)}
            style={styles.flex1}
          />
          <Btn
            label="Accept & Beam"
            icon={Download}
            variant="primary"
            onPress={() => onAccept(resolvedId)}
            style={styles.flex1}
          />
        </View>
      </View>
    </SimpleModal>
  )
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  container: {
    paddingVertical: 6,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  fileIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '800',
  },
  fileMeta: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: fonts.mono,
  },
  senderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  senderLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  senderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  senderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  senderName: {
    fontSize: 13,
    fontWeight: '800',
  },
  trustBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  noticeText: {
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 18,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
})

