import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native'
import { ArrowUp, ArrowDown, Zap, Sparkles } from 'lucide-react-native'
import { on } from '../bridge'
import { theme, fonts } from '../theme'

function formatSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return 'Syncing…'
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  }
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
}

export function FloatingTransferPill({ onExpand }: { onExpand?: () => void }) {
  const [activeTransfer, setActiveTransfer] = useState<any | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const progressAnim = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.02,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    )
    pulseLoop.start()

    const unsubStarted = on('transfer:started', (t: any) => {
      if (!t || t.isSync || t.source === 'sync') return
      setActiveTransfer(t)
      progressAnim.setValue(0)
    })

    const unsubOffer = on('transfer:offer', (t: any) => {
      if (!t || t.isSync || t.source === 'sync') return
      setActiveTransfer(t)
    })

    const unsubProgress = on('transfer:progress', (delta: any) => {
      if (!delta || delta.isSync || delta.source === 'sync' || delta.syncLibraryId) {
        setActiveTransfer((prev: any) => {
          if (prev && (prev.id === delta?.id || prev.isSync || prev.source === 'sync')) return null
          return prev
        })
        return
      }
      const now = Date.now()
      if (now - lastUpdateRef.current > 80) {
        lastUpdateRef.current = now
        setActiveTransfer((prev: any) => {
          if (!prev || prev.isSync || prev.source === 'sync') return null
          return { ...prev, ...delta }
        })
        if (typeof delta?.progress === 'number') {
          const clamped = Math.max(0, Math.min(100, delta.progress)) / 100
          Animated.timing(progressAnim, {
            toValue: clamped,
            duration: 100,
            useNativeDriver: false,
          }).start()
        }
      }
    })

    const unsubCompleted = on('transfer:completed', () => {
      setActiveTransfer(null)
    })

    const unsubFailed = on('transfer:failed', () => {
      setActiveTransfer(null)
    })

    const unsubCancelled = on('transfer:cancelled', () => {
      setActiveTransfer(null)
    })

    return () => {
      pulseLoop.stop()
      unsubStarted()
      unsubOffer()
      unsubProgress()
      unsubCompleted()
      unsubFailed()
      unsubCancelled()
    }
  }, [progressAnim, pulseAnim])

  if (!activeTransfer) return null

  const isSend = activeTransfer.direction === 'send'
  const rawSpeed = activeTransfer.speed ?? activeTransfer.speedBytesPerSec ?? 0
  const speedText = formatSpeed(rawSpeed)
  const progressPercent = Math.round(
    activeTransfer.progress != null
      ? activeTransfer.progress > 1
        ? activeTransfer.progress
        : activeTransfer.progress * 100
      : 0
  )

  return (
    <Animated.View style={[styles.floatingContainer, { transform: [{ scale: pulseAnim }] }]}>
      <TouchableOpacity
        onPress={onExpand}
        activeOpacity={0.9}
        style={styles.touchable}
      >
        <View style={styles.contentRow}>
          <View style={[styles.directionBadge, isSend ? styles.sendBg : styles.recvBg]}>
            {isSend ? (
              <ArrowUp size={15} color={theme.primary} />
            ) : (
              <ArrowDown size={15} color={theme.accent} />
            )}
          </View>

          <View style={styles.textContainer}>
            <View style={styles.titleRow}>
              <Text style={styles.filename} numberOfLines={1}>
                {activeTransfer.filename || 'P2P File Transfer'}
              </Text>
            </View>
            <Text style={styles.subtext}>
              {isSend ? 'Direct Beam' : 'Receiving'} · {progressPercent}%
            </Text>
          </View>

          <View style={styles.speedBadge}>
            <Zap size={11} color={theme.success} />
            <Text style={styles.speedText}>{speedText}</Text>
          </View>
        </View>

        {/* 60fps Native Interpolated Progress Bar */}
        <View style={styles.progressBarBg}>
          <Animated.View
            style={[
              styles.progressBarFill,
              {
                backgroundColor: isSend ? theme.primary : theme.accent,
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    bottom: 74, // Sits above the floating dock
    left: 16,
    right: 16,
    zIndex: 999,
  },
  touchable: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 8,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  directionBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBg: {
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.2)',
  },
  recvBg: {
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(8, 145, 178, 0.2)',
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filename: {
    color: theme.text,
    fontSize: 13.5,
    fontWeight: '800',
  },
  subtext: {
    color: theme.textSecondary,
    fontSize: 11,
    marginTop: 2,
    fontFamily: fonts.mono,
  },
  speedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.successBg,
    borderColor: theme.successBorder,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 9999,
    gap: 4,
  },
  speedText: {
    color: theme.success,
    fontSize: 11,
    fontWeight: '900',
    fontFamily: fonts.mono,
  },
  progressBarBg: {
    height: 3.5,
    backgroundColor: theme.bgElevated,
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
  },
})
