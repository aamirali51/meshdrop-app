import React, { useState, useEffect, useRef, Suspense } from 'react'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  Animated,
  Easing,
} from 'react-native'
import { Camera } from 'react-native-camera-kit'
import { X, Zap, ZapOff, QrCode, AlertCircle, Sparkles } from 'lucide-react-native'
import { theme, fonts } from '../theme'

interface QRScannerModalProps {
  visible: boolean
  onClose: () => void
  onScan: (code: string) => void
  title?: string
  instruction?: string
}

export function QRScannerModal({
  visible,
  onClose,
  onScan,
  title = 'Scan Node QR Code',
  instruction = 'Align camera with the QR code on the desktop or peer device',
}: QRScannerModalProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const laserAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!visible) {
      setTorchOn(false)
      setIsProcessing(false)
      return
    }

    checkCameraPermission()

    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(laserAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(laserAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    )
    scanLoop.start()

    return () => scanLoop.stop()
  }, [visible, laserAnim])

  const checkCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.CAMERA
        )
        if (granted) {
          setHasPermission(true)
        } else {
          const status = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA,
            {
              title: 'Camera Permission Required',
              message:
                'MeshDrop needs camera access to scan pairing and drop share QR codes.',
              buttonPositive: 'Allow',
              buttonNegative: 'Cancel',
            }
          )
          setHasPermission(status === PermissionsAndroid.RESULTS.GRANTED)
        }
      } catch (err) {
        console.warn('[QRScanner] Permission request error:', err)
        setHasPermission(false)
      }
    } else {
      setHasPermission(true)
    }
  }

  const handleReadCode = (event: any) => {
    if (isProcessing) return
    const rawValue = event?.nativeEvent?.codeStringValue
    if (!rawValue) return

    setIsProcessing(true)
    const cleaned = rawValue.trim()
    console.log('[QRScanner] Scanned raw value:', cleaned)

    onScan(cleaned)
    onClose()
  }

  if (!visible) return null

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Top Navigation Bar */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <X size={20} color={theme.text} />
          </TouchableOpacity>

          <View style={styles.headerTitleContainer}>
            <QrCode size={16} color={theme.primary} style={{ marginRight: 6 }} />
            <Text style={styles.headerTitle}>{title}</Text>
          </View>

          <TouchableOpacity
            style={[styles.iconButton, torchOn && styles.iconButtonActive]}
            onPress={() => setTorchOn((prev) => !prev)}
            activeOpacity={0.7}
          >
            {torchOn ? (
              <Zap size={20} color={theme.primary} />
            ) : (
              <ZapOff size={20} color={theme.textSecondary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Camera View or Permission Prompt */}
        {hasPermission === true ? (
          <View style={styles.cameraContainer}>
            <Suspense
              fallback={
                <View style={styles.centerContainer}>
                  <ActivityIndicator size="large" color={theme.primary} />
                </View>
              }
            >
              <Camera
                style={StyleSheet.absoluteFill}
                scanBarcode={true}
                onReadCode={handleReadCode}
                showFrame={false}
                torchMode={torchOn ? 'on' : 'off'}
              />
            </Suspense>

            {/* Futuristic Holographic Reticle Frame */}
            <View style={styles.reticleFrame}>
              <View style={styles.cornerTL} />
              <View style={styles.cornerTR} />
              <View style={styles.cornerBL} />
              <View style={styles.cornerBR} />

              {/* Animated Laser Line */}
              <Animated.View
                style={[
                  styles.laserLine,
                  {
                    transform: [
                      {
                        translateY: laserAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 216],
                        }),
                      },
                    ],
                  },
                ]}
              />
            </View>

            {/* Instruction Overlay */}
            <View style={styles.overlayBottom}>
              <Text style={styles.instructionText}>{instruction}</Text>
              <Text style={styles.subText}>
                Supports MD-XXXX pairing codes and DROP-XXXX share codes
              </Text>
            </View>
          </View>
        ) : hasPermission === false ? (
          <View style={styles.centerContainer}>
            <AlertCircle size={48} color={theme.danger} />
            <Text style={styles.permissionDeniedTitle}>Camera Access Denied</Text>
            <Text style={styles.permissionDeniedText}>
              Camera permission is required to scan QR codes. Please enable Camera in device settings.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={checkCameraPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.retryButtonText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={styles.loadingText}>Initializing camera…</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    zIndex: 10,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.text,
    letterSpacing: 0.2,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: theme.primary,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleFrame: {
    width: 230,
    height: 230,
    position: 'relative',
  },
  cornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 24,
    height: 24,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: theme.primary,
    borderRadius: 2,
  },
  cornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 24,
    height: 24,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: theme.primary,
    borderRadius: 2,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 24,
    height: 24,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: theme.primary,
    borderRadius: 2,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: theme.primary,
    borderRadius: 2,
  },
  laserLine: {
    width: '100%',
    height: 2,
    backgroundColor: theme.primary,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: theme.radius,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  instructionText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  subText: {
    fontSize: 11,
    color: theme.textSecondary,
    textAlign: 'center',
    fontFamily: fonts.mono,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: theme.textSecondary,
  },
  permissionDeniedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    marginTop: 16,
    marginBottom: 8,
  },
  permissionDeniedText: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: theme.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
})
