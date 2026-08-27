import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Animated,
  PanResponder,
  Alert,
  requireNativeComponent,
  Platform,
} from 'react-native'
import RNFS from 'react-native-fs'
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Radio,
  Users,
  Film,
  Sparkles,
  Check,
  Copy,
  Layers,
  X,
  Tv,
} from 'lucide-react-native'
import { call, on } from '../bridge'
import { copyToClipboard } from '../clipboard'
import { useTheme, fonts } from '../theme'
import { Pill, Btn } from '../components'

const NativeVideoView = requireNativeComponent<any>('MeshDropVideoView')

interface WatchPartyModalProps {
  visible: boolean
  onClose: () => void
  roomCode?: string
  roomTitle?: string
  transferId?: string
  filePath?: string
  isHost?: boolean
}

export function WatchPartyModal({
  visible,
  onClose,
  roomCode = 'PARTY-MESH-P2P',
  roomTitle = 'Synchronized Media Stream',
  transferId,
  filePath,
  isHost = false,
}: WatchPartyModalProps) {
  const { theme } = useTheme()
  const [videoSrc, setVideoSrc] = useState<string>('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(120)
  const [seekTarget, setSeekTarget] = useState(0)
  const [syncWithHost, setSyncWithHost] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [peerCount, setPeerCount] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSeeking, setIsSeeking] = useState(false)

  // Resolve local or staging video file path
  useEffect(() => {
    if (!visible) {
      setVideoSrc('')
      setIsPlaying(false)
      return
    }

    let active = true

    const resolveVideo = async () => {
      if (filePath) {
        setVideoSrc(filePath)
        return
      }

      if (transferId) {
        const downloadDir = '/storage/emulated/0/Download'
        const stagingDir = `${downloadDir}/.p2p-staging/${transferId}`
        try {
          if (await RNFS.exists(stagingDir)) {
            const files = await RNFS.readDir(stagingDir)
            const part = files.find((f) => f.name.endsWith('.part'))
            if (active && part) {
              setVideoSrc(part.path)
              return
            }
          }
        } catch {}

        try {
          const list = await call('listTransfers').catch(() => [])
          const match = Array.isArray(list) ? list.find((t: any) => t.id === transferId) : null
          if (active && match?.destPath) {
            setVideoSrc(match.destPath)
            return
          }
        } catch {}
      }
    }

    resolveVideo()
    return () => {
      active = false
    }
  }, [visible, filePath, transferId])

  const playbackTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastBroadcastRef = useRef<number>(0)

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || isNaN(secs) || secs < 0) return '00:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const resetControlsTimer = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
    if (isPlaying) {
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false)
      }, 4000)
    }
  }, [isPlaying])

  useEffect(() => {
    if (isPlaying && !isSeeking) {
      playbackTimer.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false)
            return duration
          }
          return prev + 1
        })
      }, 1000)
    } else {
      if (playbackTimer.current) {
        clearInterval(playbackTimer.current)
        playbackTimer.current = null
      }
    }
    return () => {
      if (playbackTimer.current) clearInterval(playbackTimer.current)
    }
  }, [isPlaying, isSeeking, duration])

  useEffect(() => {
    if (!visible) return

    const unsub = on('watch:state:updated', (state: any) => {
      if (!state) return
      if (!syncWithHost && !isHost) return

      if (state.action === 'play') {
        setIsPlaying(true)
        if (typeof state.positionSec === 'number') {
          setCurrentTime(state.positionSec)
        }
      } else if (state.action === 'pause') {
        setIsPlaying(false)
        if (typeof state.positionSec === 'number') {
          setCurrentTime(state.positionSec)
        }
      } else if (state.action === 'seek') {
        if (typeof state.positionSec === 'number') {
          setCurrentTime(state.positionSec)
        }
      }
    })

    return () => {
      unsub()
    }
  }, [visible, syncWithHost, isHost])

  const broadcast = useCallback(
    (action: 'play' | 'pause' | 'seek', positionSec: number) => {
      const now = Date.now()
      if (now - lastBroadcastRef.current < 200 && action !== 'seek') return
      lastBroadcastRef.current = now

      call('broadcastWatchState', {
        roomCode,
        action,
        positionSec,
      }).catch(() => {})
    },
    [roomCode]
  )

  const handleTogglePlay = () => {
    resetControlsTimer()
    const nextState = !isPlaying
    setIsPlaying(nextState)
    broadcast(nextState ? 'play' : 'pause', currentTime)
  }

  const handleSeekDelta = (delta: number) => {
    resetControlsTimer()
    const next = Math.max(0, Math.min(duration, currentTime + delta))
    setCurrentTime(next)
    setSeekTarget(next)
    broadcast('seek', next)
  }

  const handleCopyCode = async () => {
    const ok = await copyToClipboard(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    Alert.alert(
      'Room Code Copied',
      ok
        ? `Room ${roomCode} copied. Share with mesh peers to watch in sync.`
        : 'Clipboard unavailable.'
    )
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: '#06090E' }]}>
        {/* Top Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.pulseDot}>
              <View style={styles.innerDot} />
            </View>
            <Text style={styles.headerTitle}>Mesh Party</Text>
            <View style={styles.hostBadge}>
              <Text style={styles.hostBadgeText}>{isHost ? 'HOST' : 'PEER'}</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.codeButton} onPress={handleCopyCode}>
              <Radio size={14} color="#818CF8" />
              <Text style={styles.codeText}>{roomCode}</Text>
              {copied ? <Check size={14} color="#34D399" /> : <Copy size={14} color="#94A3B8" />}
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={20} color="#F8FAFC" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Video Viewport Container */}
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.viewport, isFullscreen && styles.fullscreenViewport]}
          onPress={resetControlsTimer}
        >
          {/* Native Video Player */}
          {videoSrc ? (
            <NativeVideoView
              style={StyleSheet.absoluteFillObject}
              src={videoSrc}
              paused={!isPlaying}
              muted={isMuted}
              seek={seekTarget}
              onReady={(e: any) => {
                if (e.nativeEvent?.duration > 0) {
                  setDuration(e.nativeEvent.duration)
                }
              }}
              onProgress={(e: any) => {
                if (!isSeeking && typeof e.nativeEvent?.currentTime === 'number') {
                  setCurrentTime(e.nativeEvent.currentTime)
                  if (e.nativeEvent?.duration > 0) {
                    setDuration(e.nativeEvent.duration)
                  }
                }
              }}
              onError={(e: any) => {
                console.warn('[WatchParty] Video playback error:', e.nativeEvent?.error)
              }}
            />
          ) : (
            <View style={styles.videoSurface}>
              <Film size={56} color="#475569" />
              <Text style={styles.streamTitle} numberOfLines={1}>
                {roomTitle || 'Streaming P2P Video Track'}
              </Text>
              <View style={styles.streamPill}>
                <Text style={styles.streamPillText}>
                  {transferId ? `Transfer: ${transferId.slice(0, 14)}...` : 'Connecting to Stream...'}
                </Text>
              </View>
            </View>
          )}

          {/* Controls Overlay */}
          {showControls && (
            <View style={styles.controlsOverlay}>
              {/* Center Play / Pause Big Button */}
              <View style={styles.centerControls}>
                <TouchableOpacity
                  style={styles.seekButton}
                  onPress={() => handleSeekDelta(-10)}
                >
                  <RotateCcw size={24} color="#F8FAFC" />
                  <Text style={styles.seekButtonText}>10s</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.bigPlayButton} onPress={handleTogglePlay}>
                  {isPlaying ? (
                    <Pause size={32} color="#0B0F17" />
                  ) : (
                    <Play size={32} color="#0B0F17" style={{ marginLeft: 4 }} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.seekButton}
                  onPress={() => handleSeekDelta(10)}
                >
                  <RotateCw size={24} color="#F8FAFC" />
                  <Text style={styles.seekButtonText}>10s</Text>
                </TouchableOpacity>
              </View>

              {/* Bottom Scrubber & Action Bar */}
              <View style={styles.bottomBar}>
                {/* Timeline Progress Bar */}
                <View style={styles.scrubberContainer}>
                  <View style={styles.progressBackground}>
                    <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                    <View style={[styles.progressThumb, { left: `${Math.max(0, Math.min(96, progressPercent))}%` }]} />
                  </View>
                </View>

                {/* Bottom Row Controls */}
                <View style={styles.bottomRow}>
                  <View style={styles.timeContainer}>
                    <Text style={styles.timeText}>
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </Text>
                  </View>

                  <View style={styles.bottomActions}>
                    <TouchableOpacity
                      style={[styles.actionIcon, syncWithHost && styles.syncActiveIcon]}
                      onPress={() => setSyncWithHost((prev) => !prev)}
                    >
                      <Radio size={16} color={syncWithHost ? '#818CF8' : '#64748B'} />
                      <Text
                        style={[
                          styles.syncText,
                          { color: syncWithHost ? '#818CF8' : '#64748B' },
                        ]}
                      >
                        {syncWithHost ? 'SYNCED' : 'LOCAL'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionIcon}
                      onPress={() => setIsMuted((prev) => !prev)}
                    >
                      {isMuted ? (
                        <VolumeX size={18} color="#94A3B8" />
                      ) : (
                        <Volume2 size={18} color="#F8FAFC" />
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionIcon}
                      onPress={() => setIsFullscreen((prev) => !prev)}
                    >
                      {isFullscreen ? (
                        <Minimize2 size={18} color="#F8FAFC" />
                      ) : (
                        <Maximize2 size={18} color="#F8FAFC" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* Room & Swarm Status Footer */}
        {!isFullscreen && (
          <View style={styles.footerInfo}>
            <View style={styles.infoCard}>
              <View style={styles.infoCardRow}>
                <Users size={16} color="#818CF8" />
                <Text style={styles.infoTitle}>Mesh Swarm Playback</Text>
              </View>
              <Text style={styles.infoSubtitle}>
                Play, pause, and scrubber actions are synchronized across all connected desktop and
                mobile peers over direct end-to-end encrypted mesh channels.
              </Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(52, 211, 153, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: -0.3,
  },
  hostBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(129, 140, 248, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.4)',
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#818CF8',
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  codeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  codeText: {
    fontSize: 12,
    fontFamily: fonts?.mono || 'monospace',
    color: '#E2E8F0',
    fontWeight: '600',
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  viewport: {
    flex: 1,
    backgroundColor: '#0B0F17',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenViewport: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  ambientGlow: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  videoSurface: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  streamTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E2E8F0',
    textAlign: 'center',
  },
  streamPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  streamPillText: {
    fontSize: 12,
    color: '#94A3B8',
    fontFamily: fonts?.mono || 'monospace',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'space-between',
    padding: 16,
  },
  centerControls: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 28,
  },
  bigPlayButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  seekButton: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  seekButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  bottomBar: {
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  scrubberContainer: {
    height: 16,
    justifyContent: 'center',
  },
  progressBackground: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#38BDF8',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#38BDF8',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeContainer: {},
  timeText: {
    fontSize: 12,
    color: '#CBD5E1',
    fontFamily: fonts?.mono || 'monospace',
  },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionIcon: {
    padding: 6,
  },
  syncActiveIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(129, 140, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  syncText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerInfo: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  infoSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
  },
})
