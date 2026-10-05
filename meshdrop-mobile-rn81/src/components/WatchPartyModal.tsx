import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native'
import RNFS from 'react-native-fs'
import {
  Radio,
  Users,
  Check,
  Copy,
  X,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { call, on } from '../bridge'
import { copyToClipboard } from '../clipboard'
import { fonts, mediaPalette } from '../theme'
import { MediaPlayer, type MediaPlayerHandle } from './MediaPlayer'

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
  const insets = useSafeAreaInsets()
  const [videoSrc, setVideoSrc] = useState<string>('')
  const [loopbackSrc, setLoopbackSrc] = useState<string>('')
  const [syncWithHost, setSyncWithHost] = useState(true)
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const playerRef = useRef<MediaPlayerHandle>(null)
  const lastBroadcastRef = useRef<number>(0)

  // Resolve local or staging video file path. MKV goes through the native
  // loopback byte-range server (see MeshDropVideoView.setLoopbackSrc) so
  // Media3's MatroskaExtractor can issue 206 reads against a stable-length
  // source — a growing .part has no length and stalls Matroska seeking. MP4
  // (moov at head) keeps playing the file path directly.
  useEffect(() => {
    if (!visible) {
      setVideoSrc('')
      setLoopbackSrc('')
      return
    }

    let active = true
    let retryTimer: ReturnType<typeof setInterval> | null = null

    const isMkvPath = (p: string) => /\.mkv$/i.test(p)

    const resolveVideo = async () => {
      if (filePath) {
        if (isMkvPath(filePath)) {
          if (active) { setVideoSrc(''); setLoopbackSrc(filePath) }
        } else if (active) {
          setVideoSrc(filePath)
          setLoopbackSrc('')
        }
        return
      }

      if (transferId) {
        const downloadDir = '/storage/emulated/0/Download'
        const stagingDir = `${downloadDir}/.p2p-staging/${transferId}`
        try {
          const list = await call('listTransfers').catch(() => [])
          const match = Array.isArray(list) ? list.find((t: any) => t.id === transferId) : null
          // Progressive-playback gate: only mount once the engine has verified
          // enough of the file head to be playable (moov / prefix watermark).
          const ready = match && (match.playable === true || match.status === 'completed')
          if (ready) {
            if (match.destPath && (await RNFS.exists(match.destPath))) {
              if (active) {
                if (isMkvPath(match.destPath)) { setVideoSrc(''); setLoopbackSrc(match.destPath) }
                else { setVideoSrc(match.destPath); setLoopbackSrc('') }
              }
              return
            }
            if (await RNFS.exists(stagingDir)) {
              const files = await RNFS.readDir(stagingDir)
              const part = files.find((f) => f.name.endsWith('.part'))
              if (active && part) {
                if (isMkvPath(part.name)) { setVideoSrc(''); setLoopbackSrc(part.path) }
                else { setVideoSrc(part.path); setLoopbackSrc('') }
                return
              }
            }
          }
        } catch {}
      }
    }

    resolveVideo()
    // Keep polling at a low rate until the transfer becomes playable (or the
    // modal closes) so a claim/party transfer never dead-ends on "Connecting".
    retryTimer = setInterval(() => {
      if (!active) return
      resolveVideo()
    }, 3000)

    return () => {
      active = false
      if (retryTimer) clearInterval(retryTimer)
    }
  }, [visible, filePath, transferId])

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

  // Host-side: broadcast every local play/pause/seek.
  const handlePlayChange = useCallback(
    (playing: boolean, seconds: number) => {
      broadcast(playing ? 'play' : 'pause', seconds)
    },
    [broadcast]
  )

  const handleSeek = useCallback(
    (seconds: number) => {
      broadcast('seek', seconds)
      // P4: re-key the in-flight transfer around the seek target so the chunk
      // scheduler prioritizes the blocks the player just asked for.
      if (transferId) {
        const byteOffset = Math.floor(seconds * 1024 * 1024) // ~1MB/s heuristic
        call('setPlayheadByte', { transferId, byteOffset }).catch(() => {})
      }
    },
    [broadcast, transferId]
  )

  // Viewer-side: follow host state from either legacy or room-based channel.
  useEffect(() => {
    if (!visible) return

    const applyState = (state: any) => {
      if (!state) return
      if (!syncWithHost && !isHost) return
      if (state.action === 'play' || state.action === 'pause' || state.action === 'seek') {
        playerRef.current?.applyExternal(
          state.action,
          typeof state.positionSec === 'number' ? state.positionSec : undefined
        )
      }
    }

    const unsubLegacy = on('watch:state:updated', applyState)
    const unsubParty = on('party:state:sync', applyState)

    return () => {
      unsubLegacy()
      unsubParty()
    }
  }, [visible, syncWithHost, isHost])

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

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: mediaPalette.bg }]}>
        {/* Top Header Bar (hidden in fullscreen) */}
        {!isFullscreen && (
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
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
              <TouchableOpacity
                style={[styles.syncBtn, syncWithHost && styles.syncBtnActive]}
                onPress={() => setSyncWithHost((prev) => !prev)}
              >
                <Radio size={13} color={syncWithHost ? mediaPalette.accent : mediaPalette.faint} />
                <Text style={[styles.syncText, { color: syncWithHost ? mediaPalette.accent : mediaPalette.faint }]}>
                  {syncWithHost ? 'SYNCED' : 'LOCAL'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.codeButton} onPress={handleCopyCode}>
                <Radio size={13} color={mediaPalette.accent} />
                <Text style={styles.codeText}>{roomCode}</Text>
                {copied ? <Check size={13} color={mediaPalette.success} /> : <Copy size={13} color={mediaPalette.muted} />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <X size={18} color={mediaPalette.text} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Full-featured media player (fills the flex space) */}
        <View style={styles.playerWrap}>
          <MediaPlayer
            ref={playerRef}
            src={videoSrc || undefined}
            loopbackSrc={loopbackSrc || undefined}
            title={roomTitle}
            onPlayChange={handlePlayChange}
            onSeek={handleSeek}
            onFullscreenChange={setIsFullscreen}
            onError={(message) => console.warn('[WatchParty] playback error:', message)}
          />
        </View>

        {/* Room & Swarm Status Footer (hidden in fullscreen) */}
        {!isFullscreen && (
          <View style={styles.footerInfo}>
            <View style={styles.infoCard}>
              <View style={styles.infoCardRow}>
                <Users size={16} color={mediaPalette.accent} />
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: mediaPalette.border,
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
    backgroundColor: mediaPalette.success,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: mediaPalette.text,
    letterSpacing: -0.3,
  },
  hostBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: mediaPalette.accentSoft,
    borderWidth: 1,
    borderColor: mediaPalette.accentBorder,
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: mediaPalette.accent,
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  syncBtnActive: {
    backgroundColor: mediaPalette.accentSoft,
  },
  syncText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  codeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: mediaPalette.borderFaint,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: mediaPalette.border,
  },
  codeText: {
    fontSize: 11,
    fontFamily: fonts?.mono || 'monospace',
    color: mediaPalette.textSecondary,
    fontWeight: '600',
  },
  closeButton: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: mediaPalette.borderFaint,
  },
  playerWrap: {
    flex: 1,
  },
  footerInfo: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: mediaPalette.border,
  },
  infoCard: {
    backgroundColor: mediaPalette.borderFaint,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: mediaPalette.borderFaint,
  },
  infoCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: mediaPalette.text,
  },
  infoSubtitle: {
    fontSize: 12,
    color: mediaPalette.muted,
    lineHeight: 18,
  },
})
