import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  useWindowDimensions,
  GestureResponderEvent,
} from 'react-native'
import {
  Tv,
  Film,
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
  Copy,
  Check,
  Sparkles,
  LogOut,
} from 'lucide-react-native'
import RNFS from 'react-native-fs'
import { call, on } from '../bridge'
import { copyToClipboard } from '../clipboard'
import { pickFiles } from '../filePicker'
import { useTheme, fonts } from '../theme'
import { Card, Btn } from '../components'
import { NativeVideoView } from '../components/NativeVideoView'

const REACTIONS = ['🍿', '🔥', '👏', '❤️', '😂']

interface DiscoveredRoom {
  roomCode: string
  title: string
  hostName: string
  hostPeerId: string
  timestamp: number
}

interface WatchPartyProps {
  onActiveRoomChange?: (active: boolean) => void
}

export function WatchParty({ onActiveRoomChange }: WatchPartyProps) {
  const { theme } = useTheme()
  const { width, height } = useWindowDimensions()
  const isLandscape = width > height

  // Room State
  const [activeRoom, setActiveRoom] = useState<any | null>(null)
  const [discoveredRooms, setDiscoveredRooms] = useState<DiscoveredRoom[]>([])
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [roomTitleInput, setRoomTitleInput] = useState('')
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string; size: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // Playback State
  const [videoSrc, setVideoSrc] = useState<string>('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [seekTarget, setSeekTarget] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [floatingReaction, setFloatingReaction] = useState<string | null>(null)

  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncRef = useRef<number>(0)
  const scrubberLayoutRef = useRef<{ width: number; pageX: number }>({ width: 1, pageX: 0 })

  const isImmersive = isLandscape || isFullscreen

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || isNaN(secs) || secs < 0) return '00:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // Notify parent on room change
  useEffect(() => {
    onActiveRoomChange?.(Boolean(activeRoom))
  }, [activeRoom, onActiveRoomChange])

  // Controls Auto-Hide Management
  const resetControlsTimer = useCallback(() => {
    setShowControls(true)
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    if (isPlaying) {
      controlsTimer.current = setTimeout(() => {
        setShowControls(false)
      }, 3500)
    }
  }, [isPlaying])

  const toggleControls = () => {
    if (showControls) {
      if (controlsTimer.current) clearTimeout(controlsTimer.current)
      setShowControls(false)
    } else {
      resetControlsTimer()
    }
  }

  useEffect(() => {
    if (isPlaying) {
      resetControlsTimer()
    } else {
      if (controlsTimer.current) clearTimeout(controlsTimer.current)
      setShowControls(true)
    }
  }, [isPlaying, resetControlsTimer])

  // Load initial state & subscriptions
  useEffect(() => {
    call('getPartyRoom').then((room: any) => {
      if (room) setActiveRoom(room)
    }).catch(() => {})

    call('listPartyRooms').then((rooms: any) => {
      if (Array.isArray(rooms)) setDiscoveredRooms(rooms)
    }).catch(() => {})

    const unsubs = [
      on('party:rooms:discovered', (rooms: any) => {
        if (Array.isArray(rooms)) setDiscoveredRooms(rooms)
      }),
      on('party:room:created', (room: any) => {
        setActiveRoom(room)
      }),
      on('party:room:joined', (room: any) => {
        setActiveRoom(room)
      }),
      on('party:room:left', () => {
        setActiveRoom(null)
        setVideoSrc('')
      }),
      on('party:room:closed', () => {
        setActiveRoom(null)
        setVideoSrc('')
        Alert.alert('Party Closed', 'The host has ended the Watch Party.')
      }),
      on('party:state:sync', (state: any) => {
        if (!state) return
        if (state.action === 'play') {
          setIsPlaying(true)
          if (typeof state.positionSec === 'number') {
            setCurrentTime(state.positionSec)
            setSeekTarget(state.positionSec)
          }
        } else if (state.action === 'pause') {
          setIsPlaying(false)
          if (typeof state.positionSec === 'number') {
            setCurrentTime(state.positionSec)
            setSeekTarget(state.positionSec)
          }
        } else if (state.action === 'seek') {
          if (typeof state.positionSec === 'number') {
            setCurrentTime(state.positionSec)
            setSeekTarget(state.positionSec)
          }
        }
      }),
      on('party:reaction', (data: any) => {
        if (data?.emoji) {
          setFloatingReaction(data.emoji)
          setTimeout(() => setFloatingReaction(null), 2500)
        }
      }),
      on('party:media:offer', () => {
        resolvePartyMediaRef.current?.(false)
      }),
      on('party:media:ready', () => {
        resolvePartyMediaRef.current?.(true)
      }),
      on('party:media:error', () => {
        Alert.alert('Media Error', 'The party media could not be transferred.')
      }),
      on('transfer:progress', (t: any) => {
        if (t?.id && shareIdRef.current && t.id === shareIdRef.current) {
          resolvePartyMediaRef.current?.(false)
        }
      }),
      on('transfer:completed', (t: any) => {
        if (t?.id && shareIdRef.current && t.id === shareIdRef.current) {
          resolvePartyMediaRef.current?.(true)
        }
      }),
    ]

    return () => {
      unsubs.forEach((u) => u?.())
      if (controlsTimer.current) clearTimeout(controlsTimer.current)
    }
  }, [])

  // Party media resolution: the engine transfers party media under the room's
  // deterministic shareId into Download/.p2p-staging/<shareId>/<name>.part
  // (renamed to its final path on completion). React to transfer events rather
  // than scanning the staging directory a single time.
  const shareIdRef = useRef<string | null>(null)
  const lastMediaScanRef = useRef<number>(0)

  const resolvePartyMedia = useCallback(async (force: boolean) => {
    const shareId = shareIdRef.current
    if (!shareId) return
    const now = Date.now()
    if (!force && now - lastMediaScanRef.current < 1500) return
    lastMediaScanRef.current = now

    const stagingDir = `/storage/emulated/0/Download/.p2p-staging/${shareId}`
    try {
      if (await RNFS.exists(stagingDir)) {
        const files = await RNFS.readDir(stagingDir)
        const part = files.find((f) => f.name.endsWith('.part'))
        if (part) {
          setVideoSrc(part.path)
          return
        }
      }
      const list = await call('listTransfers').catch(() => [])
      const match = Array.isArray(list) ? list.find((t: any) => t.id === shareId) : null
      if (match?.destPath) setVideoSrc(match.destPath)
    } catch {}
  }, [])
  const resolvePartyMediaRef = useRef<((force: boolean) => Promise<void>) | null>(null)
  resolvePartyMediaRef.current = resolvePartyMedia

  // Resolve video path for active room
  useEffect(() => {
    if (!activeRoom) {
      setVideoSrc('')
      shareIdRef.current = null
      return
    }

    if (activeRoom.filePath) {
      setVideoSrc(activeRoom.filePath)
      return
    }

    if (activeRoom.roomCode) {
      shareIdRef.current = `watch-${activeRoom.roomCode.toLowerCase()}`
    }
    resolvePartyMediaRef.current?.(true)
  }, [activeRoom])

  const broadcastPlayback = (action: 'play' | 'pause' | 'seek', posSec: number) => {
    const now = Date.now()
    if (now - lastSyncRef.current < 200 && action !== 'seek') return
    lastSyncRef.current = now

    call('broadcastWatchState', {
      roomCode: activeRoom?.roomCode,
      action,
      positionSec: posSec,
    }).catch(() => {})
  }

  const handlePickFile = async () => {
    try {
      const files = await pickFiles()
      const first = files[0]
      if (first && first.path) {
        setSelectedFile({
          path: first.path,
          name: first.name || first.path.split(/[\\/]/).pop() || 'Video',
          size: first.size || 0,
        })
        if (!roomTitleInput) {
          setRoomTitleInput(first.name?.replace(/\.[^/.]+$/, '') || 'Watch Party')
        }
      }
    } catch {}
  }

  const handleCreateRoom = async () => {
    if (!selectedFile) {
      Alert.alert('File Required', 'Please select a video file to host the party.')
      return
    }
    setLoading(true)
    try {
      const room = await call('createPartyRoom', {
        title: roomTitleInput || selectedFile.name,
        filePath: selectedFile.path,
        controlsMode: 'host',
      })
      setActiveRoom(room)
    } catch (err: any) {
      Alert.alert('Creation Failed', err?.message || 'Could not create room')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinRoom = async (codeToJoin?: string) => {
    const code = (codeToJoin || roomCodeInput).trim().toUpperCase()
    if (!code) {
      Alert.alert('Code Required', 'Enter a valid Watch Party room code.')
      return
    }
    setLoading(true)
    try {
      const room = await call('joinPartyRoom', { roomCode: code })
      setActiveRoom(room)
    } catch (err: any) {
      Alert.alert('Join Failed', err?.message || 'Could not join room')
    } finally {
      setLoading(false)
    }
  }

  const handleLeaveRoom = async () => {
    await call('leavePartyRoom').catch(() => {})
    setActiveRoom(null)
    setVideoSrc('')
    setSelectedFile(null)
  }

  const handleCopyCode = async () => {
    if (!activeRoom?.roomCode) return
    await copyToClipboard(activeRoom.roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    Alert.alert('Room Code Copied', `Room ${activeRoom.roomCode} copied to clipboard!`)
  }

  const handleReaction = (emoji: string) => {
    setFloatingReaction(emoji)
    setTimeout(() => setFloatingReaction(null), 2500)
    call('sendPartyReaction', { emoji }).catch(() => {})
  }

  const handleScrubberTouch = (e: GestureResponderEvent) => {
    resetControlsTimer()
    if (duration <= 0) return
    const { locationX } = e.nativeEvent
    const w = scrubberLayoutRef.current.width || 1
    const ratio = Math.max(0, Math.min(1, locationX / w))
    const target = ratio * duration
    setCurrentTime(target)
    setSeekTarget(target)
    broadcastPlayback('seek', target)
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Non-Immersive Header (Shown only in Lobby or Portrait Active Room) */}
      {!isImmersive && (
        <View style={[styles.header, { borderBottomColor: theme.hairline }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.iconBadge, { backgroundColor: theme.primarySoft, borderColor: theme.primary + '35' }]}>
              <Tv size={18} color={theme.primary} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: theme.text }]}>Mesh Party</Text>
              <Text style={[styles.headerSub, { color: theme.muted }]}>
                {activeRoom ? activeRoom.title : 'Live Synchronized Swarm Theater'}
              </Text>
            </View>
          </View>

          {activeRoom && (
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={[styles.codePill, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
                onPress={handleCopyCode}
              >
                <Radio size={12} color={theme.primary} />
                <Text style={[styles.codePillText, { color: theme.text }]}>{activeRoom.roomCode}</Text>
                {copied ? <Check size={12} color={theme.success} /> : <Copy size={12} color={theme.muted} />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.leaveBtn, { backgroundColor: theme.dangerBg }]}
                onPress={handleLeaveRoom}
              >
                <LogOut size={14} color={theme.danger} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {!activeRoom ? (
        /* Lobby Mode */
        <ScrollView style={styles.lobbyScroll} contentContainerStyle={styles.lobbyContent}>
          {/* Host Party Card */}
          <Card style={[styles.lobbyCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={styles.cardHeaderRow}>
              <Sparkles size={18} color={theme.primary} />
              <Text style={[styles.cardHeaderTitle, { color: theme.text }]}>Host a Watch Party</Text>
            </View>
            <Text style={[styles.cardSubText, { color: theme.muted }]}>
              Select a video file from your device to stream across your mesh swarm in sync.
            </Text>

            {/* File Pick Surface */}
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.filePickArea,
                {
                  borderColor: selectedFile ? theme.primary : theme.border,
                  backgroundColor: selectedFile ? theme.primarySoft : theme.bgElevated,
                },
              ]}
              onPress={handlePickFile}
            >
              <Film size={28} color={selectedFile ? theme.primary : theme.muted} />
              {selectedFile ? (
                <View style={styles.selectedFileInfo}>
                  <Text style={[styles.selectedFileName, { color: theme.text }]} numberOfLines={1}>
                    {selectedFile.name}
                  </Text>
                  <Text style={[styles.selectedFileSize, { color: theme.muted }]}>
                    {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · Ready to Host
                  </Text>
                </View>
              ) : (
                <View style={styles.pickFilePrompt}>
                  <Text style={[styles.pickFilePromptText, { color: theme.text }]}>Tap to select video</Text>
                  <Text style={[styles.pickFilePromptSub, { color: theme.muted }]}>MP4, MKV, TS, WebM, MOV</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Room Title Input */}
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text },
              ]}
              value={roomTitleInput}
              onChangeText={setRoomTitleInput}
              placeholder="Party Title (optional)"
              placeholderTextColor={theme.muted}
            />

            <Btn
              label={loading ? 'Starting...' : 'Start Watch Party'}
              variant="primary"
              disabled={!selectedFile || loading}
              onPress={handleCreateRoom}
              style={{ marginTop: 6 }}
            />
          </Card>

          {/* Join with Code Card */}
          <Card style={[styles.lobbyCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={styles.cardHeaderRow}>
              <Radio size={18} color="#818CF8" />
              <Text style={[styles.cardHeaderTitle, { color: theme.text }]}>Join with Room Code</Text>
            </View>
            <Text style={[styles.cardSubText, { color: theme.muted }]}>
              Enter a 6 to 8 character code shared by your mesh host.
            </Text>

            <View style={styles.joinInputRow}>
              <TextInput
                style={[
                  styles.joinInput,
                  { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text },
                ]}
                value={roomCodeInput}
                onChangeText={(t) => setRoomCodeInput(t.toUpperCase())}
                placeholder="PARTY-XXXX"
                placeholderTextColor={theme.muted}
                autoCapitalize="characters"
              />
              <Btn
                label="Join"
                variant="primary"
                disabled={!roomCodeInput.trim() || loading}
                onPress={() => handleJoinRoom()}
              />
            </View>
          </Card>

          {/* Discovered Swarm Rooms */}
          <Card style={[styles.lobbyCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={styles.cardHeaderRow}>
              <Users size={18} color={theme.success} />
              <Text style={[styles.cardHeaderTitle, { color: theme.text }]}>
                Discovered Swarm Parties ({discoveredRooms.length})
              </Text>
            </View>

            {discoveredRooms.length > 0 ? (
              discoveredRooms.map((room) => (
                <View
                  key={room.roomCode}
                  style={[styles.discoveredRoomRow, { backgroundColor: theme.bgElevated, borderColor: theme.hairline }]}
                >
                  <View style={styles.discoveredRoomInfo}>
                    <Text style={[styles.discoveredRoomTitle, { color: theme.text }]} numberOfLines={1}>
                      {room.title}
                    </Text>
                    <Text style={[styles.discoveredRoomHost, { color: theme.muted }]}>
                      Host: {room.hostName} · {room.roomCode}
                    </Text>
                  </View>
                  <Btn
                    label="Join"
                    size="sm"
                    variant="outline"
                    onPress={() => handleJoinRoom(room.roomCode)}
                  />
                </View>
              ))
            ) : (
              <View style={styles.emptyDiscovered}>
                <Film size={28} color={theme.muted} style={{ marginBottom: 6 }} />
                <Text style={[styles.emptyDiscoveredText, { color: theme.muted }]}>
                  No active watch parties found on paired peers. Start one above!
                </Text>
              </View>
            )}
          </Card>
        </ScrollView>
      ) : (
        /* Active Theater Mode */
        <View style={[styles.theaterContainer, isImmersive && styles.immersiveTheaterContainer]}>
          {/* Main Video Viewport */}
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.videoViewport, isImmersive && styles.fullscreenViewport]}
            onPress={toggleControls}
          >
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
                  if (typeof e.nativeEvent?.currentTime === 'number') {
                    setCurrentTime(e.nativeEvent.currentTime)
                    if (e.nativeEvent?.duration > 0) {
                      setDuration(e.nativeEvent.duration)
                    }
                  }
                }}
                onError={(e: any) => {
                  console.warn('[WatchParty] Video error:', e.nativeEvent?.error)
                }}
              />
            ) : (
              <View style={styles.connectingPlaceholder}>
                <Tv size={48} color={theme.primary} />
                <Text style={[styles.connectingTitle, { color: '#F8FAFC' }]}>Streaming P2P Video Track</Text>
                <Text style={[styles.connectingSub, { color: '#94A3B8' }]}>
                  {activeRoom.isHost ? 'Broadcasting to swarm...' : 'Prefetching chunks from host...'}
                </Text>
              </View>
            )}

            {/* Floating Reaction Bubble (Always visible when triggered) */}
            {floatingReaction && (
              <View style={styles.floatingReactionBubble}>
                <Text style={styles.floatingReactionText}>{floatingReaction}</Text>
              </View>
            )}

            {/* Secondary Controls Overlay (Fades out when playing) */}
            {showControls && (
              <View style={styles.controlsOverlay}>
                {/* Immersive Top Bar */}
                {isImmersive && (
                  <View style={styles.immersiveTopBar}>
                    <View style={styles.immersiveTitleBox}>
                      <Text style={styles.immersiveTitleText} numberOfLines={1}>
                        {activeRoom.title}
                      </Text>
                      <TouchableOpacity style={styles.immersiveCodePill} onPress={handleCopyCode}>
                        <Text style={styles.immersiveCodeText}>{activeRoom.roomCode}</Text>
                        {copied ? <Check size={12} color="#10B981" /> : <Copy size={12} color="#94A3B8" />}
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={styles.immersiveCloseBtn} onPress={handleLeaveRoom}>
                      <LogOut size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Center Playback HUD */}
                <View style={styles.centerRow}>
                  <TouchableOpacity
                    style={styles.seekBtn}
                    onPress={(e) => {
                      e.stopPropagation()
                      resetControlsTimer()
                      const next = Math.max(0, currentTime - 10)
                      setCurrentTime(next)
                      setSeekTarget(next)
                      broadcastPlayback('seek', next)
                    }}
                  >
                    <RotateCcw size={26} color="#FFFFFF" />
                    <Text style={styles.seekBtnText}>10s</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.playBtn, { backgroundColor: theme.primary }]}
                    onPress={(e) => {
                      e.stopPropagation()
                      resetControlsTimer()
                      const next = !isPlaying
                      setIsPlaying(next)
                      broadcastPlayback(next ? 'play' : 'pause', currentTime)
                    }}
                  >
                    {isPlaying ? (
                      <Pause size={30} color="#000000" />
                    ) : (
                      <Play size={30} color="#000000" style={{ marginLeft: 3 }} />
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.seekBtn}
                    onPress={(e) => {
                      e.stopPropagation()
                      resetControlsTimer()
                      const next = Math.min(duration, currentTime + 10)
                      setCurrentTime(next)
                      setSeekTarget(next)
                      broadcastPlayback('seek', next)
                    }}
                  >
                    <RotateCw size={26} color="#FFFFFF" />
                    <Text style={styles.seekBtnText}>10s</Text>
                  </TouchableOpacity>
                </View>

                {/* Bottom Bar Controls & Quick Emoji Reactions */}
                <View style={styles.bottomControlsBar}>
                  {/* Interactive Scrubber Bar */}
                  <TouchableOpacity
                    activeOpacity={1}
                    style={styles.scrubberTouchArea}
                    onLayout={(e) => {
                      scrubberLayoutRef.current.width = e.nativeEvent.layout.width
                    }}
                    onPress={handleScrubberTouch}
                  >
                    <View style={styles.scrubberBg}>
                      <View style={[styles.scrubberFill, { width: `${progressPercent}%`, backgroundColor: theme.primary }]} />
                      <View style={[styles.scrubberThumb, { left: `${progressPercent}%`, backgroundColor: theme.primary }]} />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.bottomMetaRow}>
                    <Text style={styles.timeLabel}>
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </Text>

                    {/* Quick Reactions embedded in HUD */}
                    <View style={styles.immersiveReactionsRow}>
                      {REACTIONS.map((emoji) => (
                        <TouchableOpacity
                          key={emoji}
                          style={styles.immersiveReactionBtn}
                          onPress={(e) => {
                            e.stopPropagation()
                            resetControlsTimer()
                            handleReaction(emoji)
                          }}
                        >
                          <Text style={styles.reactionText}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.bottomActionIcons}>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation()
                          resetControlsTimer()
                          setIsMuted((p) => !p)
                        }}
                        style={styles.iconPad}
                      >
                        {isMuted ? <VolumeX size={20} color="#94A3B8" /> : <Volume2 size={20} color="#FFFFFF" />}
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation()
                          setIsFullscreen((p) => !p)
                        }}
                        style={styles.iconPad}
                      >
                        {isImmersive ? <Minimize2 size={20} color="#FFFFFF" /> : <Maximize2 size={20} color="#FFFFFF" />}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </TouchableOpacity>

          {/* Portrait Audience & Roster Card (Only when in non-immersive portrait) */}
          {!isImmersive && (
            <View style={[styles.audienceCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <View style={styles.reactionsRow}>
                {REACTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.reactionBtn, { backgroundColor: theme.bgElevated }]}
                    onPress={() => handleReaction(emoji)}
                  >
                    <Text style={styles.reactionText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.rosterRow}>
                <Users size={14} color={theme.primary} />
                <Text style={[styles.rosterText, { color: theme.text }]}>
                  {activeRoom.isHost ? '👑 Host (You)' : `Host: ${activeRoom.hostName}`} · 🟢 Synchronized
                </Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  codePillText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts?.mono || 'monospace',
  },
  leaveBtn: {
    padding: 6,
    borderRadius: 8,
  },
  lobbyScroll: {
    flex: 1,
  },
  lobbyContent: {
    padding: 16,
    gap: 14,
  },
  lobbyCard: {
    padding: 16,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  cardSubText: {
    fontSize: 12,
    lineHeight: 17,
  },
  filePickArea: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  selectedFileInfo: {
    alignItems: 'center',
  },
  selectedFileName: {
    fontSize: 13,
    fontWeight: '700',
  },
  selectedFileSize: {
    fontSize: 11,
    marginTop: 2,
  },
  pickFilePrompt: {
    alignItems: 'center',
  },
  pickFilePromptText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pickFilePromptSub: {
    fontSize: 11,
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  joinInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  joinInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: fonts?.mono || 'monospace',
  },
  discoveredRoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  discoveredRoomInfo: {
    flex: 1,
    marginRight: 8,
  },
  discoveredRoomTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  discoveredRoomHost: {
    fontSize: 11,
    fontFamily: fonts?.mono || 'monospace',
    marginTop: 2,
  },
  emptyDiscovered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  emptyDiscoveredText: {
    fontSize: 12,
    textAlign: 'center',
  },
  theaterContainer: {
    flex: 1,
  },
  immersiveTheaterContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    backgroundColor: '#000000',
  },
  videoViewport: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenViewport: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  connectingPlaceholder: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  connectingTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  connectingSub: {
    fontSize: 12,
  },
  floatingReactionBubble: {
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 1000,
  },
  floatingReactionText: {
    fontSize: 44,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    zIndex: 900,
  },
  immersiveTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  immersiveTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 16,
  },
  immersiveTitleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  immersiveCodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  immersiveCodeText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts?.mono || 'monospace',
  },
  immersiveCloseBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    padding: 8,
    borderRadius: 20,
  },
  centerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  seekBtn: {
    alignItems: 'center',
    gap: 4,
    padding: 8,
  },
  seekBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bottomControlsBar: {
    gap: 10,
    paddingBottom: 4,
  },
  scrubberTouchArea: {
    paddingVertical: 8,
  },
  scrubberBg: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 3,
    position: 'relative',
    justifyContent: 'center',
  },
  scrubberFill: {
    height: '100%',
    borderRadius: 3,
  },
  scrubberThumb: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 6.5,
    marginLeft: -6.5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  bottomMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeLabel: {
    fontSize: 12,
    color: '#E2E8F0',
    fontFamily: fonts?.mono || 'monospace',
    fontWeight: '600',
  },
  immersiveReactionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  immersiveReactionBtn: {
    padding: 2,
  },
  bottomActionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconPad: {
    padding: 4,
  },
  audienceCard: {
    padding: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  reactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  reactionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  reactionText: {
    fontSize: 20,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  rosterText: {
    fontSize: 11,
    fontWeight: '600',
  },
})
