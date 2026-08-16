import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native'
import { Radio, QrCode, Sparkles, Cpu } from 'lucide-react-native'
import { theme, fonts } from '../theme'

interface RadarPulseEmptyStateProps {
  topicName?: string
  onScanQR?: () => void
}

export function RadarPulseEmptyState({
  topicName = 'Hyperswarm Swarm',
  onScanQR,
}: RadarPulseEmptyStateProps) {
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
        <View style={styles.gridRingOuter} />
        <View style={styles.gridRingMid} />

        {/* Animated Ripple Wave 1 */}
        <Animated.View
          style={[
            styles.circle,
            {
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
            styles.circleAccent,
            {
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
          <View style={styles.sweepArm} />
        </Animated.View>

        {/* Center Quantum Beacon Hub */}
        <View style={styles.centerHub}>
          <Radio size={22} color="#FFFFFF" />
        </View>
      </View>

      <View style={styles.telemetryBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.telemetryText}>LISTENING ON HYPERSWARM DHT</Text>
      </View>

      <Text style={styles.title}>Scanning {topicName}</Text>
      <Text style={styles.subtitle}>
        Keep MeshDrop open on your other devices or scan a pairing QR code to establish an encrypted link immediately.
      </Text>

      {onScanQR && (
        <TouchableOpacity style={styles.scanBtn} onPress={onScanQR} activeOpacity={0.8}>
          <QrCode size={15} color={theme.primary} />
          <Text style={styles.scanBtnText}>Scan Pairing QR Code</Text>
        </TouchableOpacity>
      )}
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
    borderColor: 'rgba(79, 70, 229, 0.12)',
    borderStyle: 'dashed',
  },
  gridRingMid: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1,
    borderColor: 'rgba(8, 145, 178, 0.15)',
  },
  circle: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1.5,
    borderColor: theme.primary,
    backgroundColor: 'rgba(79, 70, 229, 0.05)',
  },
  circleAccent: {
    borderColor: theme.accent,
    backgroundColor: 'rgba(8, 145, 178, 0.05)',
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
    backgroundColor: theme.primary,
    opacity: 0.5,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  centerHub: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  telemetryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.primarySoft,
    borderColor: 'rgba(79, 70, 229, 0.2)',
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: theme.radiusFull,
    marginBottom: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.success,
  },
  telemetryText: {
    color: theme.primary,
    fontSize: 10,
    fontWeight: '900',
    fontFamily: fonts.mono,
    letterSpacing: 0.6,
  },
  title: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: theme.textSecondary,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 290,
    marginBottom: 16,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  scanBtnText: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '800',
  },
})
