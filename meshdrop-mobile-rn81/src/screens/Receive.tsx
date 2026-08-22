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
} from '../components'
import { QRScannerModal } from '../components/QRScannerModal'
import { DropPreviewModal, type ClaimPreview } from '../components/DropPreviewModal'
import { formatCodeInput } from '../utils/formatCode'
import { getClipboardText } from '../clipboard'
import { useTheme, fonts } from '../theme'

export function Receive() {
  const { theme } = useTheme()
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

  const handleClaimWithCode = async (claimCode: string) => {
    const cleanCode = claimCode.trim().toUpperCase()
    if (!cleanCode) {
      setError('Please enter a valid 8-character drop code')
      return
    }

    setBusy(true)
    setError('')
    setMsg('Locating drop topic on Hyperswarm…')

    try {
      const res: any = await call('claimDrop', { code: cleanCode })
      if (res?.preview) {
        setClaimPreview(res.preview)
        setMsg('')
      } else if (res?.accepted) {
        setMsg(`Claim verified! Inbound payload: ${res.fileName || 'file(s)'}`)
        setCode('')
        setDetectedClipboardCode(null)
      } else {
        setMsg('Claim dispatched. Connecting to peer stream…')
        setCode('')
        setDetectedClipboardCode(null)
      }
    } catch (err: any) {
      setError(err?.message || 'Could not locate payload with this Drop code.')
      setMsg('')
    } finally {
      setBusy(false)
    }
  }

  const handleClaim = () => handleClaimWithCode(code)

  const handleScanSuccess = (scannedValue: string) => {
    let clean = scannedValue.trim().toUpperCase()
    if (clean.includes('DROP=')) {
      const match = clean.match(/DROP=([A-Z0-9-]+)/i)
      if (match && match[1]) clean = match[1]
    }
    const formatted = formatCodeInput(clean)
    setCode(formatted)
    setShowScanner(false)
    handleClaimWithCode(formatted)
  }

  const handleAcceptPreview = () => {
    if (!claimPreview) return
    call('acceptClaimPreview', { shareId: claimPreview.shareId })
      .then(() => {
        setClaimPreview(null)
        setMsg('Download initiated from peer swarm.')
      })
      .catch((err: any) => {
        Alert.alert('Download Error', err?.message || 'Failed to start payload download.')
      })
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Smart Clipboard Sniffer Bar */}
      {detectedClipboardCode && (
        <View style={[styles.clipboardSniffer, { backgroundColor: theme.bgCard, borderColor: theme.primary + '35' }]}>
          <View style={[styles.clipboardIconBox, { backgroundColor: theme.primarySoft }]}>
            <ClipboardCheck size={18} color={theme.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.clipboardTitle, { color: theme.textSecondary }]}>Detected Drop Code in Clipboard</Text>
            <Text style={[styles.clipboardCode, { color: theme.primary }]}>{detectedClipboardCode}</Text>
          </View>
          <TouchableOpacity
            style={[styles.clipboardActionBtn, { backgroundColor: theme.primary }]}
            onPress={() => {
              setCode(detectedClipboardCode)
              handleClaimWithCode(detectedClipboardCode)
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.clipboardActionText}>Claim Now</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Hero Card */}
      <Card glow style={[styles.heroCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <View style={styles.heroHeader}>
          <View style={[styles.heroIconBox, { backgroundColor: theme.primarySoft, borderColor: theme.primary + '35' }]}>
            <ArrowDownToLine size={22} color={theme.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.heroTitle, { color: theme.text }]}>Claim Drop Payload</Text>
            <Text style={[styles.heroSub, { color: theme.muted }]}>
              Enter a drop code or scan a matrix to download
            </Text>
          </View>
        </View>

        <Text style={[styles.heroDescription, { color: theme.textSecondary }]}>
          MeshDrop codes allow serverless, peer-to-peer file downloads across any device on your Wi-Fi or DHT swarm with end-to-end encryption.
        </Text>

        {/* Input Box */}
        <View style={styles.inputContainer}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Drop Code</Text>
          <View style={[styles.inputBoxWrap, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="e.g. DROP-4A82-9B1C"
              placeholderTextColor={theme.muted}
              value={code}
              onChangeText={(t) => setCode(formatCodeInput(t))}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.btnRow}>
          <Btn
            label="Scan Camera"
            icon={Camera}
            variant="secondary"
            onPress={() => setShowScanner(true)}
            style={styles.flex1}
          />
          <Btn
            label={busy ? 'Connecting…' : 'Claim Payload'}
            icon={Download}
            variant="primary"
            onPress={handleClaim}
            disabled={!code.trim() || busy}
            loading={busy}
            style={styles.flex1}
          />
        </View>

        {/* Feedback Banners */}
        {!!msg && (
          <View style={[styles.successBanner, { backgroundColor: theme.successBg, borderColor: theme.successBorder }]}>
            <Check size={14} color={theme.success} />
            <Text style={[styles.successText, { color: theme.success }]}>{msg}</Text>
          </View>
        )}

        {!!error && (
          <View style={[styles.errorBanner, { backgroundColor: theme.dangerBg, borderColor: theme.dangerBorder }]}>
            <AlertCircle size={14} color={theme.danger} />
            <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
          </View>
        )}
      </Card>

      {/* Info Card */}
      <Card style={[styles.infoCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <View style={styles.infoHeader}>
          <ShieldCheck size={16} color={theme.primary} />
          <Text style={[styles.infoTitle, { color: theme.text }]}>Zero-Knowledge Transfer</Text>
        </View>

        <View style={styles.bulletRow}>
          <View style={[styles.bulletDot, { backgroundColor: theme.primary }]} />
          <Text style={[styles.bulletText, { color: theme.textSecondary }]}>
            Files transfer directly between devices over local Wi-Fi or DHT holepunching.
          </Text>
        </View>

        <View style={styles.bulletRow}>
          <View style={[styles.bulletDot, { backgroundColor: theme.primary }]} />
          <Text style={[styles.bulletText, { color: theme.textSecondary }]}>
            Data never touches cloud servers, storage buckets, or intermediary relays unencrypted.
          </Text>
        </View>

        <View style={styles.bulletRow}>
          <View style={[styles.bulletDot, { backgroundColor: theme.primary }]} />
          <Text style={[styles.bulletText, { color: theme.textSecondary }]}>
            Once the sender closes the session, the temporary drop code expires immediately.
          </Text>
        </View>
      </Card>

      {/* QR Scanner Modal */}
      <QRScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* Drop Preview Modal */}
      <DropPreviewModal
        visible={Boolean(claimPreview)}
        preview={claimPreview}
        onAccept={handleAcceptPreview}
        onDecline={() => setClaimPreview(null)}
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
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  clipboardSniffer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 10,
  },
  clipboardIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipboardTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  clipboardCode: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: fonts.mono,
    letterSpacing: 0.5,
  },
  clipboardActionBtn: {
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  heroSub: {
    fontSize: 12,
    marginTop: 2,
  },
  heroDescription: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  inputBoxWrap: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  input: {
    height: 48,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: fonts.mono,
    letterSpacing: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 14,
  },
  successText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 14,
  },
  errorText: {
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
    marginTop: 6,
  },
  bulletText: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
})
