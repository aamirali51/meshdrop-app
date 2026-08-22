import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native'
import { Radio, QrCode, Sparkles, Cpu } from 'lucide-react-native'
import { useTheme, fonts } from '../theme'

interface RadarPulseEmptyStateProps {
  topicName?: string
  title?: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
  onScanQR?: () => void
}

export function RadarPulseEmptyState({
  topicName = 'Hyperswarm Swarm',
  title,
  subtitle,
  actionLabel,
  onAction,
  onScanQR,
}: RadarPulseEmptyStateProps) {
  const { theme } = useTheme()
  const pulse1 = useRef(new Animated.Value(0)).current
  const pulse2 = useRef(new Animated.Value(0)).current
  const pulse3 = useRef(new Animated.Value(0)).current
  const rotateAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const createPulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      )

    const a1 = createPulse(pulse1, 0)
    const a2 = createPulse(pulse2, 900)
    const a3 = createPulse(pulse3, 1800)

    const rotateLoop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    )

    a1.start()
    a2.start()
    a3.start()
    rotateLoop.start()

    return () => {
      a1.stop()
      a2.stop()
      a3.stop()
      rotateLoop.stop()
    }
  }, [pulse1, pulse2, pulse3, rotateAnim])

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <View style={styles.container}>
      <View style={styles.radarWrapper}>
        {/* Outer Ring Grid */}
        <View style={[styles.gridRingOuter, { borderColor: theme.primary + '20' }]} />
        <View style={[styles.gridRingMid, { borderColor: theme.accent + '25' }]} />

        {/* Animated Ripple Wave 1 */}
        <Animated.View
          style={[
            styles.circle,
            {
              borderColor: theme.primary,
              backgroundColor: theme.primary + '10',
              transform: [
                {
                  scale: pulse1.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 2.6],
                  }),
                },
              ],
              opacity: pulse1.interpolate({
                inputRange: [0, 0.6, 1],
                outputRange: [0.8, 0.3, 0],
              }),
            },
          ]}
        />
        {/* Animated Ripple Wave 2 */}
        <Animated.View
          style={[
            styles.circle,
            {
              borderColor: theme.accent,
              backgroundColor: theme.accent + '10',
              transform: [
                {
                  scale: pulse2.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 2.6],
                  }),
                },
              ],
              opacity: pulse2.interpolate({
                inputRange: [0, 0.6, 1],
                outputRange: [0.7, 0.25, 0],
              }),
            },
          ]}
        />
        {/* Animated Ripple Wave 3 */}
        <Animated.View
          style={[
            styles.circle,
            {
              borderColor: theme.primary,
              backgroundColor: theme.primary + '10',
              transform: [
                {
                  scale: pulse3.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 2.6],
                  }),
                },
              ],
              opacity: pulse3.interpolate({
                inputRange: [0, 0.6, 1],
                outputRange: [0.6, 0.2, 0],
              }),
            },
          ]}
        />

        {/* Rotating Radar Sweep Line */}
        <Animated.View
          style={[
            styles.sweepArmContainer,
            {
              transform: [{ rotate: spin }],
            },
          ]}
        >
          <View style={[styles.sweepArm, { backgroundColor: theme.primary }]} />
        </Animated.View>

        {/* Center Quantum Beacon Hub */}
        <View style={[styles.centerHub, { backgroundColor: theme.primary }]}>
          <Radio size={22} color="#FFFFFF" />
        </View>
      </View>

      <View style={[styles.telemetryBadge, { backgroundColor: theme.primarySoft, borderColor: theme.primary + '35' }]}>
        <View style={[styles.liveDot, { backgroundColor: theme.success }]} />
        <Text style={[styles.telemetryText, { color: theme.primary }]}>LISTENING ON HYPERSWARM DHT</Text>
      </View>

      <Text style={[styles.title, { color: theme.text }]}>
        {title || `Scanning ${topicName}`}
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        {subtitle ||
          'Keep MeshDrop open on your other devices or scan a pairing QR code to establish an encrypted link immediately.'}
      </Text>

      {onAction && actionLabel ? (
        <TouchableOpacity
          style={[styles.scanBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
          onPress={onAction}
          activeOpacity={0.8}
        >
          <Sparkles size={15} color={theme.primary} />
          <Text style={[styles.scanBtnText, { color: theme.primary }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : onScanQR ? (
        <TouchableOpacity
          style={[styles.scanBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
          onPress={onScanQR}
          activeOpacity={0.8}
        >
          <QrCode size={15} color={theme.primary} />
          <Text style={[styles.scanBtnText, { color: theme.primary }]}>Scan Pairing QR Code</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  radarWrapper: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  gridRingOuter: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  gridRingMid: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1,
  },
  circle: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1.5,
  },
  sweepArmContainer: {
    position: 'absolute',
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  sweepArm: {
    width: 2,
    height: 65,
    opacity: 0.5,
  },
  centerHub: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 6,
  },
  telemetryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 9999,
    marginBottom: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  telemetryText: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: fonts.mono,
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 290,
    marginBottom: 16,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    elevation: 2,
  },
  scanBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
})

