import React, { useState } from 'react'
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
} from 'lucide-react-native'
import { call } from '../bridge'
import {
  Card,
  Btn,
  Pill,
} from '../components'
import { QRScannerModal } from '../components/QRScannerModal'
import { formatCodeInput } from '../utils/formatCode'
import { theme, fonts } from '../theme'

export function Receive() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [showScanner, setShowScanner] = useState(false)

  const handleClaimWithCode = async (targetCode: string) => {
    const clean = targetCode.trim().toUpperCase()
    if (!clean) return
    setBusy(true)
    setMsg('')
    setError('')
    try {
      await call('claimDropCode', { code: clean })
      setMsg(`Code "${clean}" verified! P2P Download stream initiated.`)
      setCode('')
    } catch (e: any) {
      setError(e?.message || 'Could not claim the drop code.')
      Alert.alert('Claim Failed', e?.message || 'Could not verify code.')
    } finally {
      setBusy(false)
    }
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
      {/* Hero Quantum Claim Card */}
      <Card glow style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroIconBox}>
            <Download size={22} color={theme.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.heroTitle}>Quantum Claim</Text>
            <Text style={styles.heroSub}>Instant Serverless P2P Reception</Text>
          </View>
        </View>

        <Text style={styles.heroDescription}>
          Enter an 8-character DROP code from the sender or scan their QR matrix to stream files directly into your local storage.
        </Text>

        <Btn
          label="Scan DROP QR Matrix"
          icon={Camera}
          variant="secondary"
          onPress={() => setShowScanner(true)}
          style={{ marginBottom: 16 }}
        />

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>DROP Code</Text>
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
          label="Claim & Download Payload"
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

      {/* Security & Protocol Telemetry Card */}
      <Card style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <ShieldCheck size={18} color={theme.primary} />
          <Text style={styles.infoTitle}>Cryptographic Safeguards</Text>
        </View>

        <View style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <Text style={styles.bulletText}>
            <Text style={styles.bulletBold}>Direct Device Hop:</Text> Zero cloud relays; traffic moves peer-to-peer over encrypted Hyperswarm DHT streams.
          </Text>
        </View>

        <View style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <Text style={styles.bulletText}>
            <Text style={styles.bulletBold}>Cryptographic Verification:</Text> Payloads are verified against SHA-256 Merkle hashes prior to disk writing.
          </Text>
        </View>

        <View style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <Text style={styles.bulletText}>
            <Text style={styles.bulletBold}>One-Time Use:</Text> DROP codes automatically self-destruct once downloaded or when their TTL timer expires.
          </Text>
        </View>
      </Card>

      {/* QR Code Camera Scanner Modal */}
      <QRScannerModal
        visible={showScanner}
        title="Scan DROP Code Matrix"
        instruction="Align camera with the sender's DROP QR code"
        onScan={handleScanCode}
        onClose={() => setShowScanner(false)}
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
    borderRadius: theme.radiusSm,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    color: theme.primary,
    fontSize: 17,
    fontWeight: '900',
    fontFamily: fonts.mono,
    letterSpacing: 1.5,
    padding: 0,
    textAlign: 'center',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.successBg,
    borderColor: theme.successBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  successText: {
    color: theme.success,
    fontSize: 12.5,
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
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  errorText: {
    color: theme.danger,
    fontSize: 12.5,
    fontWeight: '700',
    flex: 1,
  },
  infoCard: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  infoTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.primary,
    marginTop: 6,
  },
  bulletText: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  bulletBold: {
    color: theme.text,
    fontWeight: '700',
  },
})
