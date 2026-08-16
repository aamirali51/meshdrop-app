import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  Share as NativeShare,
  Alert,
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { Copy, Share2, Check, QrCode } from 'lucide-react-native'
import { SimpleModal } from '../components'
import { Btn } from '../components'
import { copyToClipboard } from '../clipboard'
import { theme, fonts } from '../theme'

interface QRCodeModalProps {
  visible: boolean
  title?: string
  subtitle?: string
  value: string
  onClose: () => void
}

export function QRCodeModal({
  visible,
  title = 'Node QR Matrix',
  subtitle = 'Scan with another MeshDrop node to initiate instant link',
  value,
  onClose,
}: QRCodeModalProps) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    if (!value) return
    const ok = await copyToClipboard(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    Alert.alert(
      'Code Copied',
      ok ? `${value} copied to clipboard.` : 'Clipboard is not available on this build.'
    )
  }

  const handleShare = async () => {
    if (!value) return
    try {
      await NativeShare.share({
        message: `MeshDrop Code: ${value}\nClaim or pair directly with this code in the MeshDrop app.`,
        title: 'MeshDrop Share Code',
      })
    } catch {
      // Ignored
    }
  }

  return (
    <SimpleModal
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
    >
      <View style={styles.container}>
        {/* Holographic QR Code Plate */}
        <View style={styles.qrPlateWrap}>
          <View style={styles.cornerTL} />
          <View style={styles.cornerTR} />
          <View style={styles.cornerBL} />
          <View style={styles.cornerBR} />
          <View style={styles.qrPlate}>
            {value ? (
              <QRCode
                value={value}
                size={190}
                color="#0F172A"
                backgroundColor="#FFFFFF"
              />
            ) : (
              <View style={styles.placeholder} />
            )}
          </View>
        </View>

        {/* Monospace Code Display */}
        <View style={styles.codeBox}>
          <Text style={styles.codeText} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.btnRow}>
          <Btn
            label={copied ? 'Copied' : 'Copy Code'}
            icon={copied ? Check : Copy}
            variant="secondary"
            onPress={handleCopy}
            style={styles.flex1}
          />
          <Btn
            label="Share Link"
            icon={Share2}
            variant="primary"
            onPress={handleShare}
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
    alignItems: 'center',
    paddingVertical: 8,
  },
  qrPlateWrap: {
    position: 'relative',
    padding: 12,
    marginBottom: 16,
  },
  cornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 16,
    height: 16,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: theme.primary,
  },
  cornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 16,
    height: 16,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: theme.primary,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 16,
    height: 16,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: theme.primary,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: theme.primary,
  },
  qrPlate: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 1,
    borderColor: theme.border,
  },
  placeholder: {
    width: 190,
    height: 190,
    backgroundColor: '#EEEEEE',
  },
  codeBox: {
    width: '100%',
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  codeText: {
    color: theme.primary,
    fontSize: 16,
    fontWeight: '900',
    fontFamily: fonts.mono,
    letterSpacing: 1.2,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
})
