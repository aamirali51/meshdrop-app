import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
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
  MessageCircle,
  UserX,
  Crown,
  Lock,
  ListVideo,
  FastForward,
  Send,
  Trash2,
  Plus,
  MicOff,
} from 'lucide-react-native'
import RNFS from 'react-native-fs'
import { call, on } from '../bridge'
import { copyToClipboard } from '../clipboard'
import { pickFiles } from '../filePicker'
import { useTheme, fonts } from '../theme'
import { Card, Btn } from '../components'
import { NativeVideoView } from '../components/NativeVideoView'

const REACTIONS = ['🍿', '🔥', '👏', '❤️', '😂']
const LAST_PARTY_FILE = 'last-watch-party.json'

/** A reaction emoji that floats up the player viewport and fades out —
 *  mirrors the desktop overlay behavior (the old static centered bubble
 *  looked broken: it popped in the middle and vanished). */
function FloatingEmoji({ emoji, x }: { emoji: string; x: number }) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 2400,
      useNativeDriver: true
    }).start()
  }, [anim])
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -260] })
  const opacity = anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] })
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.6] })
  return (
    <Animated.View
      pointerEvents='none'
      style={{
        position: 'absolute',
        bottom: 16,
        left: `${x}%`,
        transform: [{ translateY }, { scale }],
        opacity
      }}
    >
      <Text style={{ fontSize: 40 }}>{emoji}</Text>
    </Animated.View>
  )
}

interface ChatMessage {
  messageId: string
  text: string
  sender: { id: string; name: string }
  timestamp: number
}

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
  const activeRoomRef = useRef<any | null>(null)
  activeRoomRef.current = activeRoom
  const [discoveredRooms, setDiscoveredRooms] = useState<DiscoveredRoom[]>([])
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [roomTitleInput, setRoomTitleInput] = useState('')
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string; size: number } | null>(null)
  const [controlsMode, setControlsMode] = useState<'host' | 'open'>('host')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isPrivateRoom, setIsPrivateRoom] = useState(false)
  const [lastPartyCode, setLastPartyCode] = useState('')

  // Chat / roster panel state
  const [sideTab, setSideTab] = useState<'party' | 'chat'>('party')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  // Catch-up (guest): latest authoritative master position
  const [hostPosition, setHostPosition] = useState<number | null>(null)

  // Queue (from room info)
  const [queueItems, setQueueItems] = useState<{ title: string; filename: string; fileSize: number }[]>([])

  // Playback State
  const [videoSrc, setVideoSrc] = useState<string>('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [seekTarget, setSeekTarget] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [floatingReactions, setFloatingReactions] = useState<{ id: number; emoji: string; x: number }[]>([])

  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncRef = useRef<number>(0)
  const scrubberLayoutRef = useRef<{ width: number; pageX: number }>({ width: 1, pageX: 0 })
  const currentTimeRef = useRef(0)
  const sideTabRef = useRef(sideTab)
  sideTabRef.current = sideTab
  const identityIdRef = useRef<string>('')
  call('getIdentity').then((id: any) => {
    if (id?.id) identityIdRef.current = id.id
  }).catch(() => {})

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

  // Pull the chat history when joining a room (host replays recent messages).
  useEffect(() => {
    if (!activeRoom?.roomCode) return
    call('watch.chatHistory')
      .then((history: any) => {
        if (Array.isArray(history) && history.length > 0) setChatMessages(history.slice(-200))
      })
      .catch(() => {})
  }, [activeRoom?.roomCode])

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

  // Video mounting follows the app-wide playback rule (Folders/MediaPlayer):
  // still-downloading sources go through the native loopback byte-range
  // server (ExoPlayer cannot open staged files directly — IO_NO_PERMISSION),
  // completed ones play from their final local path.
  const [loopbackMode, setLoopbackMode] = useState(false)
  const [loopbackTotal, setLoopbackTotal] = useState(0)
  const [loopbackWritten, setLoopbackWritten] = useState(0)
  const [streamComplete, setStreamComplete] = useState(false)

  const mountVideo = useCallback(
    (path: string, opts: { mode: 'file' | 'loopback'; total?: number; written?: number; complete?: boolean }) => {
      resolvedRef.current = { path, complete: opts.complete === true }
      if (opts.mode === 'loopback') {
        setLoopbackMode(true)
        setLoopbackTotal(opts.total || 0)
        setLoopbackWritten(opts.written || 0)
        setStreamComplete(opts.complete === true)
        setVideoSrc(path)
      } else {
        setLoopbackMode(false)
        setStreamComplete(opts.complete === true)
        setVideoSrc(path.startsWith('file://') ? path : `file://${path}`)
      }
    },
    []
  )

  const clearVideo = useCallback(() => {
    resolvedRef.current = null
    setVideoSrc('')
    setLoopbackMode(false)
    setLoopbackTotal(0)
    setLoopbackWritten(0)
    setStreamComplete(false)
  }, [])

  // Load initial state & subscriptions
  useEffect(() => {
    call('getPartyRoom').then((room: any) => {
      if (room) setActiveRoom(room)
    }).catch(() => {})

    call('listPartyRooms').then((rooms: any) => {
      if (Array.isArray(rooms)) setDiscoveredRooms(rooms)
    }).catch(() => {})

    // Rejoin-last-party convenience: a tiny JSON file in app storage.
    RNFS.readFile(`${RNFS.DocumentDirectoryPath}/${LAST_PARTY_FILE}`)
      .then((content) => {
        const saved = JSON.parse(content)
        if (saved?.roomCode) setLastPartyCode(saved.roomCode)
      })
      .catch(() => {})

    const persistLastParty = (roomCode: string) => {
      setLastPartyCode(roomCode)
      RNFS.writeFile(`${RNFS.DocumentDirectoryPath}/${LAST_PARTY_FILE}`, JSON.stringify({ roomCode }), 'utf8').catch(() => {})
    }

    const unsubs = [
      on('party:rooms:discovered', (rooms: any) => {
        if (Array.isArray(rooms)) setDiscoveredRooms(rooms)
      }),
      on('party:room:created', (room: any) => {
        setActiveRoom(room)
        clearVideo()
        setIsPlaying(false)
        if (room?.roomCode) persistLastParty(room.roomCode)
      }),
      on('party:room:joined', (room: any) => {
        setActiveRoom(room)
        clearVideo()
        setIsPlaying(false)
        if (room?.roomCode) persistLastParty(room.roomCode)
      }),
      on('party:room:updated', (room: any) => {
        // Fresh snapshot after a guest's media offer arrives (host identity,
        // real media title / controlsMode) — but also on every throttled roster
        // tick. Only replace state when the room materially changed so the
        // [activeRoom] effect (and its media retry) does not restart constantly.
        if (!room) return
        setQueueItems(Array.isArray(room.queue) ? room.queue : [])
        setHostPosition(typeof room.hostPositionSec === 'number' ? room.hostPositionSec : null)
        const cur = activeRoomRef.current
        if (cur && cur.roomCode === room.roomCode) {
          const materiallyChanged =
            room.hostName !== cur.hostName ||
            room.title !== cur.title ||
            room.controlsMode !== cur.controlsMode ||
            room.participantCount !== cur.participantCount ||
            room.mediaEpoch !== cur.mediaEpoch ||
            room.playbackPeerId !== cur.playbackPeerId ||
            room.isPrivate !== cur.isPrivate ||
            room.rewindWindowSec !== cur.rewindWindowSec ||
            (room.queue?.length || 0) !== (cur.queue?.length || 0) ||
            JSON.stringify((room.participants || []).map((p: any) => [
              p.peerId, p.name, Math.round((p.positionSec || 0) * 2) / 2, p.buffering, p.isMuted
            ])) !==
              JSON.stringify((cur.participants || []).map((p: any) => [
                p.peerId, p.name, Math.round((p.positionSec || 0) * 2) / 2, p.buffering, p.isMuted
              ]))
          if (!materiallyChanged) return
        }
        setActiveRoom(room)
      }),
      on('party:room:left', () => {
        setActiveRoom(null)
        clearVideo()
        setIsPlaying(false)
        setLoading(false)
        setChatMessages([])
        setQueueItems([])
        setHostPosition(null)
        RNFS.unlink(`${RNFS.DocumentDirectoryPath}/${LAST_PARTY_FILE}`).catch(() => {})
        setLastPartyCode('')
      }),
      on('party:room:closed', (evt: any) => {
        setActiveRoom(null)
        clearVideo()
        setIsPlaying(false)
        setLoading(false)
        setChatMessages([])
        setQueueItems([])
        setHostPosition(null)
        const reason = evt?.reason || ''
        if (reason === 'kicked') {
          Alert.alert('Removed', evt?.error || 'You were removed from the party by the host.')
        } else if (reason === 'join-timeout') {
          Alert.alert('Room Not Found', evt?.error || 'No host responded to your join request.')
        } else if (reason === 'host-lost') {
          Alert.alert('Party Ended', 'The host is no longer reachable.')
        } else {
          Alert.alert('Party Closed', 'The host has ended the Watch Party.')
        }
      }),
      on('party:chat', (msg: any) => {
        if (!msg?.text) return
        setChatMessages((prev) => [...prev.slice(-199), msg])
        if (sideTabRef.current !== 'chat') setUnreadCount((c) => c + 1)
      }),
      on('party:chat:history', (payload: any) => {
        if (Array.isArray(payload?.messages)) setChatMessages(payload.messages.slice(-200))
      }),
      on('party:moderated', (mod: any) => {
        if (!mod?.action) return
        const meId = identityIdRef.current
        if (mod.action === 'mute' && mod.targetPeerId === meId) {
          Alert.alert('Muted', 'The host muted your microphone.')
        } else if (mod.action === 'unmute' && mod.targetPeerId === meId) {
          Alert.alert('Unmuted', 'The host unmuted your microphone.')
        } else if (mod.action === 'promote' && mod.targetPeerId === meId) {
          Alert.alert('Playback Control Granted', 'You can now drive play/pause/seek for everyone.')
        } else if (mod.action === 'promote') {
          Alert.alert('Playback Control Moved', `${mod.by?.name || 'The host'} promoted another peer to control playback.`)
        }
      }),
      on('party:state:sync', (state: any) => {
        if (!state) return
        // Track the playback master's authoritative position for catch-up.
        const room = activeRoomRef.current
        const masterId = room?.playbackPeerId || room?.hostPeerId
        if (room && !room.isHost && state.sender?.id && state.sender.id === masterId && typeof state.positionSec === 'number') {
          setHostPosition(state.positionSec)
        }
        if (state.action === 'play') {
          setIsPlaying(true)
          // The host re-broadcasts its position every ~5s; only correct when
          // meaningfully drifted, and only when the target region is actually
          // downloaded (gated seek — see maybeSeekToHost).
          if (
            typeof state.positionSec === 'number' &&
            Math.abs(currentTimeRef.current - state.positionSec) > 2 &&
            maybeSeekToHostRef.current(state.positionSec)
          ) {
            setCurrentTime(state.positionSec)
            setSeekTarget(state.positionSec)
          }
        } else if (state.action === 'pause') {
          setIsPlaying(false)
          if (
            typeof state.positionSec === 'number' &&
            Math.abs(currentTimeRef.current - state.positionSec) > 2 &&
            maybeSeekToHostRef.current(state.positionSec)
          ) {
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
          showTimestampedReaction(data)
        }
      }),
      on('party:media:offer', () => {
        resolvePartyMediaRef.current?.(false)
      }),
      on('party:media:ready', (m: any) => {
        if (m?.destPath) finalDestRef.current = m.destPath
        resolvePartyMediaRef.current?.(true)
      }),
      on('party:media:error', (media: any) => {
        setLoading(false)
        Alert.alert('Media Error', media?.error || 'The party media could not be transferred.')
      }),
      on('transfer:progress', (t: any) => {
        if (t?.id && shareIdRef.current && t.id === shareIdRef.current) {
          resolvePartyMediaRef.current?.(false)
          // A deferred catch-up seek retries as the target region downloads.
          if (pendingCatchUpRef.current && hostPositionRef.current != null) {
            if (maybeSeekToHostRef.current(hostPositionRef.current)) {
              pendingCatchUpRef.current = false
              caughtUpKeyRef.current = `${activeRoomRef.current?.roomCode || ''}:${activeRoomRef.current?.mediaEpoch || 1}`
              console.log('[WatchParty] deferred catch-up applied at', hostPositionRef.current)
            }
          }
        }
      }),
      on('transfer:completed', (t: any) => {
        if (t?.id && shareIdRef.current && t.id === shareIdRef.current) {
          resolvePartyMediaRef.current?.(true)
          // Source complete: any deferred catch-up seek is now unconditionally
          // safe — apply it.
          if (pendingCatchUpRef.current && hostPositionRef.current != null) {
            pendingCatchUpRef.current = false
            maybeSeekToHostRef.current(hostPositionRef.current)
            caughtUpKeyRef.current = `${activeRoomRef.current?.roomCode || ''}:${activeRoomRef.current?.mediaEpoch || 1}`
          }
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
  //
  // Two lifecycle rules the old latch-based resolver got wrong: the .part
  // source DIES when the engine renames it into the final path on completion
  // (so the source must be remounted, not latched), and a completed file must
  // be preferred over the record's destPath because dedup can rename the
  // on-disk file to a " (n)" name the record never learns about.
  const shareIdRef = useRef<string | null>(null)
  const lastMediaScanRef = useRef<number>(0)
  const resolvedRef = useRef<{ path: string; complete: boolean } | null>(null)
  const finalDestRef = useRef<string | null>(null)

  const resolvePartyMedia = useCallback(async (force: boolean) => {
    const shareId = shareIdRef.current
    if (!shareId) return
    if (!force && resolvedRef.current?.complete) return
    const now = Date.now()
    if (!force && now - lastMediaScanRef.current < 1500) return
    lastMediaScanRef.current = now

    // Progressive-playback gate: only mount the .part once the engine has
    // verified enough of the file head to be playable (moov / prefix
    // watermark). Playing a near-empty .part is the "timeline but no video"
    // failure. The record carries playable/completed once the threshold hits.
    const stagingDir = `/storage/emulated/0/Download/.p2p-staging/${shareId}`
    try {
      const list = await call('listTransfers').catch(() => [])
      const match = Array.isArray(list) ? list.find((t: any) => t.id === shareId) : null
      // Fresh transfer stats for the gated-seek helper (refs declared below).
      matchSizeRef.current = match?.fileSize || 0
      matchProgressRef.current = match?.progress || 0
      matchCommittedRef.current = typeof match?.committedPrefix === 'number' ? match.committedPrefix : -1

      // Completed: play the final file directly. Prefer the destPath the
      // engine announced in party:media:ready — the record may still carry a
      // pre-dedup path while the on-disk file got a " (n)" suffix.
      const finalPath = finalDestRef.current || (match?.status === 'completed' ? match.destPath : null)
      if (finalPath && (await RNFS.exists(finalPath))) {
        const done = resolvedRef.current
        if (done && done.path === finalPath && done.complete) return
        mountVideo(finalPath, { mode: 'file', complete: true })
        return
      }

      // Still transferring: serve the .part through the loopback server
      // (grow-aware) instead of handing ExoPlayer a raw staging path it
      // cannot open.
      if (!match || match.playable !== true) return
      const files = await RNFS.readDir(stagingDir)
      const part = files.find((f) => f.name.endsWith('.part'))
      if (!part) return
      const total = match.fileSize || 0
      // Watermark = the EXACT contiguous committed prefix from the engine
      // (head+tail prefetch makes percent progress unsafe). The native server
      // serves reads inside the prefix immediately and waits (bounded) for
      // reads past it while the sequential sweep advances — that is what
      // keeps a growing MP4/TS parse intact without serving holes.
      const committed = matchCommittedRef.current >= 0 ? matchCommittedRef.current : 0
      if (resolvedRef.current?.path === part.path && !resolvedRef.current.complete) {
        setLoopbackTotal(total)
        setLoopbackWritten(committed)
        return
      }
      mountVideo(part.path, { mode: 'loopback', total, written: committed, complete: false })
    } catch {}
  }, [mountVideo])
  const resolvePartyMediaRef = useRef<((force: boolean) => Promise<void>) | null>(null)
  resolvePartyMediaRef.current = resolvePartyMedia

  // Resolve video path for active room. Keyed by room+epoch+filePath so
  // roster-tick room:updated snapshots don't reset a healthy source.
  const roomKeyRef = useRef('')
  useEffect(() => {
    const key = activeRoom
      ? `${activeRoom.roomCode || ''}:${activeRoom.mediaEpoch || 1}:${activeRoom.filePath || ''}`
      : ''
    if (roomKeyRef.current !== key) {
      roomKeyRef.current = key
      resolvedRef.current = null
      finalDestRef.current = null
      clearVideo()
    }

    if (!activeRoom) {
      shareIdRef.current = null
      return
    }

    if (activeRoom.filePath) {
      mountVideo(activeRoom.filePath, { mode: 'file', complete: true })
      shareIdRef.current = null
      return
    }

    if (activeRoom.roomCode) {
      // Epoch > 1 (queue advance) derives a fresh shareId per media item.
      const epoch = activeRoom.mediaEpoch || 1
      shareIdRef.current = `watch-${activeRoom.roomCode.toLowerCase()}${epoch > 1 ? `-e${epoch}` : ''}`
    }
    // Resolve once immediately, then keep a slow retry so a guest source that
    // appears late (missed media-ready / transfer events) still starts playing.
    resolvePartyMediaRef.current?.(true)
    const retry = setInterval(() => {
      if (!shareIdRef.current) return
      resolvePartyMediaRef.current?.(false)
    }, 3000)
    return () => {
      clearInterval(retry)
      shareIdRef.current = null
    }
  }, [activeRoom, clearVideo, mountVideo])

  // Guest catch-up on join: seek ONCE to the host's position once both the
  // local source is mounted and the host position is known (whichever arrives
  // later). Without this a guest that joins mid-playback starts from 0:00 and
  // only a manual "Jump to host" could recover. Keyed per media item.
  const caughtUpKeyRef = useRef('')
  useEffect(() => {
    const room = activeRoom
    if (!room || room.isHost) {
      caughtUpKeyRef.current = ''
      pendingCatchUpRef.current = false
      return
    }
    const key = `${room.roomCode || ''}:${room.mediaEpoch || 1}`
    if (caughtUpKeyRef.current === key) return
    if (!videoSrc || hostPosition == null) return
    // The seek is GATED (maybeSeekToHost): while the .part is still
    // downloading, the target region may not be on disk — the seek is
    // deferred and retried on transfer progress ticks until committed.
    if (maybeSeekToHostRef.current(hostPosition)) {
      caughtUpKeyRef.current = key
      pendingCatchUpRef.current = false
      console.log('[WatchParty] caught up to host position:', hostPosition)
    } else {
      pendingCatchUpRef.current = true
    }
  }, [activeRoom, videoSrc, hostPosition])

  const broadcastPlayback = (action: 'play' | 'pause' | 'seek', posSec: number) => {
    const now = Date.now()
    if (now - lastSyncRef.current < 200 && action !== 'seek') return
    lastSyncRef.current = now

    // Host-authority: only the host (or an open/collaborative room, or a
    // guest the host PROMOTED to playback master) drives the swarm. The core
    // drops non-master syncs in host mode, but we shouldn't even try.
    const room = activeRoom
    const promoted = room && !room.isHost && room.controlsMode === 'host' && room.playbackPeerId && room.playbackPeerId !== room.hostPeerId
    if (room && !room.isHost && room.controlsMode === 'host' && !promoted) return

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
        controlsMode,
        isPrivate: isPrivateRoom,
      })
      setActiveRoom(room)
      if (room?.roomCode) {
        setLastPartyCode(room.roomCode)
        RNFS.writeFile(`${RNFS.DocumentDirectoryPath}/${LAST_PARTY_FILE}`, JSON.stringify({ roomCode: room.roomCode }), 'utf8').catch(() => {})
      }
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
      setLastPartyCode(code)
      RNFS.writeFile(`${RNFS.DocumentDirectoryPath}/${LAST_PARTY_FILE}`, JSON.stringify({ roomCode: code }), 'utf8').catch(() => {})
    } catch (err: any) {
      Alert.alert('Join Failed', err?.message || 'Could not join room')
    } finally {
      setLoading(false)
    }
  }

  const handleLeaveRoom = async () => {
    await call('leavePartyRoom').catch(() => {})
    setActiveRoom(null)
    clearVideo()
    setSelectedFile(null)
  }

  const handleCopyCode = async () => {
    if (!activeRoom?.roomCode) return
    await copyToClipboard(activeRoom.roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    Alert.alert('Room Code Copied', `Room ${activeRoom.roomCode} copied to clipboard!`)
  }

  const showReactionBubble = (emoji: string) => {
    const id = Date.now() + Math.random()
    const x = Math.random() * 70 + 10
    setFloatingReactions((prev) => [...prev.slice(-8), { id, emoji, x }])
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id))
    }, 2600)
  }

  // Timestamped reactions: pop when playback reaches the moment they were
  // sent. Null position, already-past or far-ahead (>2min) pops immediately.
  const showTimestampedReaction = (data: any) => {
    const pos = typeof data.positionSec === 'number' ? data.positionSec : null
    if (pos == null || pos < currentTimeRef.current || pos - currentTimeRef.current > 120) {
      showReactionBubble(data.emoji)
      return
    }
    const local = currentTimeRef.current
    if (Math.abs(local - pos) < 2) {
      showReactionBubble(data.emoji)
      return
    }
    setTimeout(() => showReactionBubble(data.emoji), (pos - local) * 1000)
  }

  const lastReactionRef = useRef<{ emoji: string; at: number }>({ emoji: '', at: 0 })
  const handleReaction = (emoji: string) => {
    showReactionBubble(emoji)
    // The RN bridge occasionally re-invokes the same reaction call ~200ms
    // later (seen as duplicate emojis on the receiving players). Swallow
    // same-emoji repeats inside a short window.
    const now = Date.now()
    if (lastReactionRef.current.emoji === emoji && now - lastReactionRef.current.at < 800) return
    lastReactionRef.current = { emoji, at: now }
    call('sendPartyReaction', { emoji, positionSec: currentTimeRef.current }).catch(() => {})
  }

  // ─── Chat ────────────────────────────────────────────────────────────────

  const handleSendChat = () => {
    const text = chatDraft.trim()
    if (!text) return
    setChatDraft('')
    call('watch.chat', { text }).catch(() => {})
  }

  // ─── Moderation (host) ───────────────────────────────────────────────────

  const handleModerate = (action: 'kick' | 'mute' | 'unmute' | 'promote', targetPeerId: string, targetName: string) => {
    if (action === 'kick') {
      Alert.alert('Remove Peer', `Remove ${targetName} from the party?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            call('watch.moderate', { action, targetPeerId }).catch(() => {})
          },
        },
      ])
      return
    }
    call('watch.moderate', { action, targetPeerId }).catch(() => {})
  }

  // ─── Queue (host) ────────────────────────────────────────────────────────

  const handleAddToQueue = async () => {
    try {
      const files = await pickFiles()
      const first = files[0]
      if (!first?.path) return
      const room = await call('watch.queueAdd', {
        filePath: first.path,
        title: first.name?.replace(/\.[^/.]+$/, ''),
      })
      if (Array.isArray(room?.queue)) setQueueItems(room.queue)
    } catch {}
  }

  const handleRemoveFromQueue = (index: number) => {
    call('watch.queueRemove', { index })
      .then(() => setQueueItems((prev) => prev.filter((_, i) => i !== index)))
      .catch(() => {})
  }

  const handleMediaEnded = () => {
    setIsPlaying(false)
    const room = activeRoomRef.current
    if (room?.isHost && queueItems.length > 0) {
      call('watch.queueNext').catch(() => {})
    }
  }

  // ─── Rewind window (host) ────────────────────────────────────────────────

  const handleSetRewind = (seconds: number) => {
    call('watch.rewindSet', { seconds }).catch(() => {})
    setActiveRoom((prev: any) => (prev ? { ...prev, rewindWindowSec: seconds } : prev))
  }

  // ─── Catch-up (guest) ────────────────────────────────────────────────────

  // Fresh-value refs for the gated seek helper (the party event subscriptions
  // are registered once with [] deps and must read current values).
  const durationRef = useRef(0)
  durationRef.current = duration
  const videoSrcRef = useRef('')
  videoSrcRef.current = videoSrc
  const loopbackModeRef = useRef(false)
  loopbackModeRef.current = loopbackMode
  const streamCompleteRef = useRef(false)
  streamCompleteRef.current = streamComplete
  const hostPositionRef = useRef<number | null>(null)
  hostPositionRef.current = hostPosition
  // Transfer stats from the last resolver scan (progressive gating).
  const matchSizeRef = useRef(0)
  const matchProgressRef = useRef(0)
  const matchCommittedRef = useRef(-1)
  const pendingCatchUpRef = useRef(false)

  // GATED SEEK: the progressive .part is SPARSE (head-tail priority commits
  // the head and tail first, the middle fills in order). The loopback server
  // trusts the byte watermark, so seeking into a not-yet-downloaded hole feeds
  // ExoPlayer zeros → PARSING_CONTAINER_MALFORMED → blank player. A seek is
  // only applied when the target's byte range is inside the committed prefix
  // (or the source is complete); otherwise the engine prioritizes that region
  // (setPlayheadByte) and the seek is retried on later transfer progress.
  const applySeek = useCallback((pos: number) => {
    setCurrentTime(pos)
    setSeekTarget(pos)
  }, [])

  const maybeSeekToHost = useCallback((posSec: number): boolean => {
    if (!posSec || posSec < 0 || !videoSrcRef.current) return false
    if (!loopbackModeRef.current || streamCompleteRef.current) {
      applySeek(posSec)
      return true
    }
    const size = matchSizeRef.current
    const dur = durationRef.current
    if (!(size > 0) || !(dur > 0)) return false
    const targetByte = Math.floor((posSec / dur) * size)
    // The EXACT contiguous committed prefix (bytes fully downloaded,
    // verified, and written — reported by the engine from the transfer core's
    // contiguous length). Head-tail priority makes percent progress a lie;
    // this prefix is the only safe read/seek bound. Fall back to a progress
    // estimate minus a margin when the engine has no live run info.
    const committed =
      matchCommittedRef.current >= 0
        ? matchCommittedRef.current
        : Math.max(0, Math.floor((size * matchProgressRef.current) / 100) - 4 * 1024 * 1024)
    if (targetByte <= committed) {
      applySeek(posSec)
      return true
    }
    // No playhead-priority jump here: prioritizing a distant region creates a
    // downloaded ISLAND beyond the contiguous prefix, which stalls the prefix
    // the player is streaming from. The sequential sweep reaches the target
    // region shortly; the seek retries on later transfer progress ticks.
    console.log(
      '[WatchParty] seek deferred — target byte', targetByte,
      'committed prefix', committed, 'pos:', posSec
    )
    return false
  }, [applySeek])
  const maybeSeekToHostRef = useRef(maybeSeekToHost)
  maybeSeekToHostRef.current = maybeSeekToHost

  const handleJumpToHost = () => {
    if (hostPosition == null) return
    setCurrentTime(hostPosition)
    setSeekTarget(hostPosition)
    broadcastPlayback('seek', hostPosition)
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
                {activeRoom.isPrivate && <Lock size={10} color={theme.warning || '#F59E0B'} />}
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

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setControlsMode('host')}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
                  borderColor: controlsMode === 'host' ? theme.primary : theme.border,
                  backgroundColor: controlsMode === 'host' ? theme.primarySoft : theme.bgElevated,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: controlsMode === 'host' ? theme.primary : theme.muted }}>Host Only</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setControlsMode('open')}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
                  borderColor: controlsMode === 'open' ? theme.primary : theme.border,
                  backgroundColor: controlsMode === 'open' ? theme.primarySoft : theme.bgElevated,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: controlsMode === 'open' ? theme.primary : theme.muted }}>Collaborative</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setIsPrivateRoom((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <View
                style={{
                  width: 16, height: 16, borderRadius: 4, borderWidth: 1.5,
                  borderColor: isPrivateRoom ? theme.primary : theme.border,
                  backgroundColor: isPrivateRoom ? theme.primary : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {isPrivateRoom && <Check size={11} color="#FFFFFF" />}
              </View>
              <Lock size={11} color={theme.muted} />
              <Text style={{ fontSize: 11, color: theme.muted }}>Private room — join by code only</Text>
            </TouchableOpacity>

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

            {lastPartyCode ? (
              <Btn
                label={`Rejoin last party (${lastPartyCode})`}
                variant="outline"
                disabled={loading}
                onPress={() => handleJoinRoom(lastPartyCode)}
              />
            ) : null}
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
                src={loopbackMode ? undefined : videoSrc}
                loopbackSrc={loopbackMode ? videoSrc : undefined}
                loopbackTotal={loopbackMode && loopbackTotal > 0 ? loopbackTotal : undefined}
                loopbackWritten={loopbackMode && loopbackWritten > 0 ? loopbackWritten : undefined}
                streamComplete={loopbackMode && streamComplete ? true : undefined}
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
                    currentTimeRef.current = e.nativeEvent.currentTime
                    setCurrentTime(e.nativeEvent.currentTime)
                    if (e.nativeEvent?.duration > 0) {
                      setDuration(e.nativeEvent.duration)
                    }
                  }
                }}
                onEnd={handleMediaEnded}
                onError={(e: any) => {
                  console.warn('[WatchParty] Video error:', e.nativeEvent?.error)
                  // A dead source must not latch: the staged .part is renamed
                  // into the final path on completion, so drop the resolved
                  // marker and let the resolver remount the right source
                  // instead of staying blank forever.
                  resolvedRef.current = null
                  resolvePartyMediaRef.current?.(true)
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
            {floatingReactions.map((r) => (
              <FloatingEmoji key={r.id} emoji={r.emoji} x={r.x} />
            ))}

            {/* Catch-up button (guest drifting from the host) */}
            {!activeRoom.isHost && hostPosition != null && Math.abs(hostPosition - currentTime) > 5 && (
              <TouchableOpacity
                style={styles.catchupBtn}
                onPress={(e) => {
                  e.stopPropagation()
                  handleJumpToHost()
                }}
              >
                <FastForward size={13} color="#FFFFFF" />
                <Text style={styles.catchupText}>
                  Jump to host ({formatTime(Math.abs(hostPosition - currentTime))} {hostPosition > currentTime ? 'behind' : 'ahead'})
                </Text>
              </TouchableOpacity>
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

          {/* Portrait Party/Chat Card (Only when in non-immersive portrait) */}
          {!isImmersive && (
            <View style={[styles.audienceCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              {/* Tab switcher */}
              <View style={styles.tabRow}>
                <TouchableOpacity
                  style={[styles.tabBtn, sideTab === 'party' && { backgroundColor: theme.primarySoft }]}
                  onPress={() => setSideTab('party')}
                >
                  <Users size={13} color={sideTab === 'party' ? theme.primary : theme.muted} />
                  <Text style={[styles.tabText, { color: sideTab === 'party' ? theme.primary : theme.muted }]}>Party</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, sideTab === 'chat' && { backgroundColor: theme.primarySoft }]}
                  onPress={() => {
                    setSideTab('chat')
                    setUnreadCount(0)
                  }}
                >
                  <MessageCircle size={13} color={sideTab === 'chat' ? theme.primary : theme.muted} />
                  <Text style={[styles.tabText, { color: sideTab === 'chat' ? theme.primary : theme.muted }]}>Chat</Text>
                  {unreadCount > 0 && sideTab !== 'chat' && (
                    <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
                      <Text style={styles.unreadText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {sideTab === 'party' ? (
                <>
                  {/* Reactions */}
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

                  {/* Host controls: rewind limit + queue */}
                  {activeRoom.isHost && (
                    <View style={styles.hostControlsRow}>
                      <View style={styles.rewindGroup}>
                        <Text style={[styles.hostControlLabel, { color: theme.muted }]}>Rewind limit</Text>
                        <View style={styles.rewindBtns}>
                          {[0, 30, 120].map((secs) => (
                            <TouchableOpacity
                              key={secs}
                              style={[
                                styles.rewindBtn,
                                {
                                  borderColor: (activeRoom.rewindWindowSec || 0) === secs ? theme.primary : theme.border,
                                  backgroundColor: (activeRoom.rewindWindowSec || 0) === secs ? theme.primarySoft : theme.bgElevated,
                                },
                              ]}
                              onPress={() => handleSetRewind(secs)}
                            >
                              <Text style={{ fontSize: 10, fontWeight: '700', color: (activeRoom.rewindWindowSec || 0) === secs ? theme.primary : theme.muted }}>
                                {secs === 0 ? 'Off' : `${secs}s`}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                      <TouchableOpacity style={[styles.queueAddBtn, { borderColor: theme.border, backgroundColor: theme.bgElevated }]} onPress={handleAddToQueue}>
                        <Plus size={12} color={theme.primary} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: theme.primary }}>Queue</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Queue list */}
                  {queueItems.length > 0 && (
                    <View style={styles.queueList}>
                      <View style={styles.queueHeader}>
                        <ListVideo size={12} color={theme.muted} />
                        <Text style={[styles.queueHeaderText, { color: theme.muted }]}>Up next</Text>
                      </View>
                      {queueItems.map((q, i) => (
                        <View key={`${q.title}-${i}`} style={[styles.queueRow, { backgroundColor: theme.bgElevated, borderColor: theme.hairline }]}>
                          <Text style={{ fontSize: 11, color: theme.text, flex: 1 }} numberOfLines={1}>
                            {q.title}
                          </Text>
                          {activeRoom.isHost && (
                            <TouchableOpacity onPress={() => handleRemoveFromQueue(i)}>
                              <Trash2 size={12} color={theme.muted} />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Roster with live sync + moderation */}
                  <View style={styles.rosterRow}>
                    <Users size={14} color={theme.primary} />
                    <Text style={[styles.rosterText, { color: theme.text }]}>
                      {activeRoom.isHost ? '👑 Host (You)' : `Host: ${activeRoom.hostName || 'the host'}`} ·{' '}
                      {activeRoom.participantCount || 1} peer(s)
                    </Text>
                  </View>

                  {(activeRoom.participants || []).map((p: any) => {
                    const isMaster = activeRoom.playbackPeerId === p.peerId
                    const isHostPeer = activeRoom.hostPeerId === p.peerId
                    const diff = typeof p.positionSec === 'number' ? currentTime - p.positionSec : null
                    const status = p.buffering
                      ? { label: 'Buffering', color: '#38BDF8' }
                      : diff == null || Math.abs(diff) < 0.8
                        ? { label: 'Synced', color: theme.success }
                        : { label: `${Math.abs(diff) < 60 ? `${Math.abs(diff).toFixed(1)}s` : formatTime(Math.abs(diff))} ${diff > 0 ? 'behind' : 'ahead'}`, color: '#F59E0B' }
                    return (
                      <View key={p.peerId} style={[styles.participantRow, { backgroundColor: theme.bgElevated, borderColor: theme.hairline }]}>
                        <View style={styles.participantInfo}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                            {p.name}
                            {isHostPeer ? '  ·  HOST' : isMaster ? '  ·  👑' : ''}
                            {p.isMuted ? '  🔇' : ''}
                          </Text>
                          <Text style={{ fontSize: 10, fontWeight: '600', color: status.color }}>{status.label}</Text>
                        </View>
                        {activeRoom.isHost && !isHostPeer && (
                          <View style={styles.moderationBtns}>
                            <TouchableOpacity style={styles.modBtn} onPress={() => handleModerate(p.isMuted ? 'unmute' : 'mute', p.peerId, p.name)}>
                              <MicOff size={13} color={theme.muted} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modBtn} onPress={() => handleModerate('promote', p.peerId, p.name)}>
                              <Crown size={13} color="#F59E0B" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modBtn} onPress={() => handleModerate('kick', p.peerId, p.name)}>
                              <UserX size={13} color={theme.danger} />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )
                  })}
                </>
              ) : (
                /* Chat */
                <View style={styles.chatContainer}>
                  <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatContent}>
                    {chatMessages.length === 0 ? (
                      <Text style={[styles.chatEmpty, { color: theme.muted }]}>No messages yet. Say hi to the party!</Text>
                    ) : (
                      chatMessages.map((m) => {
                        const mine = identityIdRef.current && m.sender?.id === identityIdRef.current
                        return (
                          <View key={m.messageId || `${m.timestamp}-${m.sender?.id}`} style={[styles.chatBubbleRow, mine && { alignItems: 'flex-end' }]}>
                            <Text style={[styles.chatSender, { color: theme.primary }]}>{mine ? 'You' : m.sender?.name || 'Peer'}</Text>
                            <View style={[styles.chatBubble, { backgroundColor: mine ? theme.primary : theme.bgElevated }]}>
                              <Text style={{ fontSize: 12, color: mine ? '#FFFFFF' : theme.text }}>{m.text}</Text>
                            </View>
                          </View>
                        )
                      })
                    )}
                  </ScrollView>
                  <View style={[styles.chatInputRow, { borderTopColor: theme.hairline }]}>
                    <TextInput
                      style={[styles.chatInput, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
                      value={chatDraft}
                      onChangeText={setChatDraft}
                      placeholder="Message the party..."
                      placeholderTextColor={theme.muted}
                      maxLength={1000}
                      onSubmitEditing={handleSendChat}
                    />
                    <TouchableOpacity
                      style={[styles.chatSendBtn, { backgroundColor: theme.primary }, !chatDraft.trim() && { opacity: 0.4 }]}
                      onPress={handleSendChat}
                      disabled={!chatDraft.trim()}
                    >
                      <Send size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
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
    maxHeight: '45%',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 8,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '800',
  },
  unreadBadge: {
    position: 'absolute',
    top: -3,
    right: 12,
    minWidth: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  unreadText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  hostControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rewindGroup: {
    gap: 3,
  },
  rewindBtns: {
    flexDirection: 'row',
    gap: 4,
  },
  rewindBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  hostControlLabel: {
    fontSize: 9,
    fontWeight: '700',
  },
  queueAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  queueList: {
    gap: 4,
  },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  queueHeaderText: {
    fontSize: 10,
    fontWeight: '700',
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  participantInfo: {
    flex: 1,
    marginRight: 6,
    gap: 1,
  },
  moderationBtns: {
    flexDirection: 'row',
    gap: 4,
  },
  modBtn: {
    padding: 5,
    borderRadius: 6,
  },
  catchupBtn: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(99,102,241,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    zIndex: 950,
  },
  catchupText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  chatContainer: {
    // Fixed height, NOT flex:1: the card's height is content-driven (capped
    // by maxHeight), and a flex:1 child contributes 0 to an auto-height
    // parent — the whole panel collapsed to nothing when the Chat tab was
    // selected ("no chat space").
    height: 260,
  },
  chatScroll: {
    flex: 1,
    maxHeight: 220,
  },
  chatContent: {
    gap: 8,
    paddingVertical: 4,
  },
  chatEmpty: {
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 20,
  },
  chatBubbleRow: {
    alignItems: 'flex-start',
    gap: 2,
  },
  chatSender: {
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 4,
  },
  chatBubble: {
    maxWidth: '85%',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
  },
  chatSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
