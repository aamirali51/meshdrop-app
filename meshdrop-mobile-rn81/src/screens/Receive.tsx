import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  TouchableOpacity,
} from 'react-native'
import {
  Download,
  KeyRound,
  ShieldCheck,
  Lock,
  Zap,
  Camera,
  Check,
  AlertCircle,
  Radio,
  Sparkles,
  ArrowDownToLine,
  ClipboardCheck,
} from 'lucide-react-native'
import { call, on } from '../bridge'
import {
  Card,
  Btn,
  Pill,
} from '../components'
import { QRScannerModal } from '../components/QRScannerModal'
import { DropPreviewModal, type ClaimPreview } from '../components/DropPreviewModal'
import { formatCodeInput } from '../utils/formatCode'
import { getClipboardText } from '../clipboard'
import { theme, fonts } from '../theme'

export function Receive() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [detectedClipboardCode, setDetectedClipboardCode] = useState<string | null>(null)
  const [claimPreview, setClaimPreview] = useState<ClaimPreview | null>(null)

  // Smart Clipboard Detection on Mount
  useEffect(() => {
    let active = true
    getClipboardText().then((text) => {
      if (!active || !text) return
      const trimmed = text.trim().toUpperCase()
      // Match code patterns: DROP-XXXX-XXXX, XXXX-XXXX, or 8-character hex/alphanumeric
      const codeMatch = trimmed.match(/(?:DROP-)?([A-Z0-9]{4}-[A-Z0-9]{4})/i) || trimmed.match(/^([A-Z0-9]{8})$/i)
      if (codeMatch) {
        const formatted = formatCodeInput(codeMatch[1] || codeMatch[0])
        setDetectedClipboardCode(formatted)
      }
    }).catch(() => {})

    const unsubPreview = on('claim:preview', (preview: any) => {
      if (preview && preview.shareId) {
        setClaimPreview(preview)
      }
    })

    return () => {
      active = false
      unsubPreview()
    }
  }, [])

  const handleClaimWithCode = async (targetCode: string) => {
    const clean = targetCode.trim().toUpperCase()
    if (!clean) return
    setBusy(true)
    setMsg('')
    setError('')
    try {
      await call('claimDropCode', { code: clean })
      setMsg(`Code "${clean}" verified! Direct P2P transfer started.`)
      setCode('')
      setDetectedClipboardCode(null)
    } catch (e: any) {
      setError(e?.message || 'Could not claim the drop code.')
      Alert.alert('Claim Failed', e?.message || 'Could not verify code.')
    } finally {
      setBusy(false)
    }
  }

  const handleConfirmPreview = async (selectedIndices: number[]) => {
    if (!claimPreview) return
    try {
      await call('confirmClaimDownload', {
        shareId: claimPreview.shareId,
        selectedIndices
      })
      setMsg(`Downloading ${selectedIndices.length} file(s) from ${claimPreview.code}`)
      setClaimPreview(null)
    } catch (e: any) {
      Alert.alert('Download Error', e?.message || 'Could not start download.')
    }
  }

  const handleCancelPreview = async () => {
    if (!claimPreview) return
    try {
      await call('cancelClaimDownload', {
        shareId: claimPreview.shareId,
        code: claimPreview.code
      })
    } catch {}
    setClaimPreview(null)
  }

  const handleClaim = () => handleClaimWithCode(code)

  const handleScanCode = (scannedValue: string) => {
    let clean = scannedValue.trim().toUpperCase()
    if (clean.includes('CODE=')) {
      const match = clean.match(/CODE=([A-Z0-9-]+)/i)
      if (match && match[1]) clean = match[1]
    }
    const formatted = formatCodeInput(clean)
    setCode(formatted)
    handleClaimWithCode(formatted)
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Smart Clipboard Code Detection Banner */}
      {detectedClipboardCode && (
        <TouchableOpacity
          style={styles.clipboardBanner}
          onPress={() => {
            setCode(detectedClipboardCode)
            handleClaimWithCode(detectedClipboardCode)
          }}
          activeOpacity={0.8}
        >
          <View style={styles.clipboardIconBox}>
            <Sparkles size={16} color={theme.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.clipboardTitle}>Drop Code in Clipboard</Text>
            <Text style={styles.clipboardCode}>{detectedClipboardCode}</Text>
          </View>
          <View style={styles.clipboardActionBtn}>
            <Text style={styles.clipboardActionText}>Claim Now</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Hero Claim Card */}
      <Card glow style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroIconBox}>
            <Download size={22} color={theme.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.heroTitle}>Claim Drop Code</Text>
            <Text style={styles.heroSub}>Direct Serverless P2P Reception</Text>
          </View>
        </View>

        <Text style={styles.heroDescription}>
          Enter an 8-character Drop Code from the sender or scan their QR code to stream files directly to this device with end-to-end encryption.
        </Text>

        <Btn
          label="Scan Drop QR Code"
          icon={Camera}
          variant="secondary"
          onPress={() => setShowScanner(true)}
          style={{ marginBottom: 16 }}
        />

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Drop Code</Text>
          <View style={styles.inputBoxWrap}>
            <TextInput
              style={styles.input}
              placeholder="DROP-XXXX-XXXX"
              placeholderTextColor={theme.muted}
              value={code}
              onChangeText={(t) => setCode(formatCodeInput(t))}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
        </View>

        <Btn
          label="Claim & Start Download"
          icon={Zap}
          variant="primary"
          disabled={!code.trim() || busy}
          loading={busy}
          onPress={handleClaim}
          size="lg"
        />

        {/* Success / Error Feedback */}
        {!!msg && (
          <View style={styles.successBanner}>
            <Check size={16} color={theme.success} />
            <Text style={styles.successText}>{msg}</Text>
          </View>
        )}

        {!!error && (
          <View style={styles.errorBanner}>
            <AlertCircle size={16} color={theme.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </Card>

      {/* Security & Protocol Safeguards Card */}
      <Card style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <ShieldCheck size={18} color={theme.primary} />
          <Text style={styles.infoTitle}>P2P Transfer Security</Text>
        </View>

        <View style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <Text style={styles.bulletText}>
            End-to-End Encrypted via Noise Protocol Handshake.
          </Text>
        </View>

        <View style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <Text style={styles.bulletText}>
            Direct stream over local Wi-Fi or Hyperswarm DHT without cloud relay.
          </Text>
        </View>

        <View style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <Text style={styles.bulletText}>
            One-time single-use codes auto-expire after transfer completion.
          </Text>
        </View>
      </Card>

      {/* QR Scanner Modal */}
      <QRScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScanCode}
      />

      {/* Folder & Multi-File Perusal Modal */}
      <DropPreviewModal
        visible={!!claimPreview}
        preview={claimPreview}
        onConfirm={handleConfirmPreview}
        onCancel={handleCancelPreview}
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
    backgroundColor: theme.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 90,
  },
  clipboardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.primarySoft,
    borderColor: 'rgba(79, 70, 229, 0.25)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  clipboardIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipboardTitle: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  clipboardCode: {
    color: theme.primary,
    fontSize: 14,
    fontWeight: '900',
    fontFamily: fonts.mono,
    letterSpacing: 0.5,
  },
  clipboardActionBtn: {
    backgroundColor: theme.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  clipboardActionText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  heroCard: {
    padding: 18,
    marginBottom: 16,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
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
    fontSize: 17,
    fontWeight: '900',
  },
  heroSub: {
    color: theme.muted,
    fontSize: 12,
    marginTop: 2,
  },
  heroDescription: {
    color: theme.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  inputBoxWrap: {
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  input: {
    height: 48,
    color: theme.text,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: fonts.mono,
    letterSpacing: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.successBg,
    borderColor: theme.successBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 14,
  },
  successText: {
    color: theme.success,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.dangerBg,
    borderColor: theme.dangerBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 14,
  },
  errorText: {
    color: theme.danger,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  infoCard: {
    padding: 16,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  infoTitle: {
    color: theme.text,
    fontSize: 13.5,
    fontWeight: '800',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.primary,
    marginTop: 6,
  },
  bulletText: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
})
