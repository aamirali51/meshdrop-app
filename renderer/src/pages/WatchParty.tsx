import React, { useState, useEffect, useRef, useCallback } from 'react'
import mpegts from 'mpegts.js'
import Hls from 'hls.js'
import {
  Film,
  Tv,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Radio,
  Users,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  LogOut,
  Shield,
  Clock,
  Mic,
  MicOff,
  UserX,
  Crown,
  Lock,
  ListVideo,
  Captions,
  FastForward,
  Trash2,
  Plus,
  MessageCircle,
  Send,
  Eye,
  Zap,
  Activity,
  Layers,
  Wand2,
  Ticket,
} from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useToast } from '@/hooks/useToast'
import { useDevices } from '@/hooks/useDevices'
import { call, on } from '@/lib/ipc'
import { isElectron, pickFile } from '@/lib/capabilities'
import { SUBTITLE_EXTENSIONS, VIDEO_EXTENSIONS, pickHostFile } from '@/components/HostFilePickerModal'
import { cn } from '@/lib/utils'
import { WatchVoice } from '@/lib/watchVoice'
import { EVENTS, METHODS } from '@/types/protocol'

interface RoomParticipant {
  id: string
  name: string
  positionSec?: number
  buffering?: boolean
  bufferedPercent?: number
  joinedAt?: number
  isMuted?: boolean
}

interface ChatMessage {
  messageId: string
  text: string
  sender: { id: string; name: string }
  timestamp: number
}

const LAST_PARTY_KEY = 'meshdrop:lastWatchParty'

interface DiscoveredRoom {
  roomCode: string
  title: string
  hostName: string
  hostPeerId: string
  timestamp: number
}

const REACTIONS = ['🍿', '🔥', '👏', '❤️', '😂', '🎉']

/**
 * Absolute path to a media file THE ENGINE CAN READ, on whichever machine the
 * engine runs. Electron: the native dialog (same machine by definition). Web /
 * Lite: the host picker, which walks the HOST's own filesystem — nothing is
 * uploaded, so a 4K feature of any size stages as fast as a small one and no
 * import ceiling applies. Resolves null when the user cancels.
 */
async function pickMediaFile(opts: {
  extensions: string[]
  title: string
  description: string
}): Promise<{ path: string; name: string; size: number } | null> {
  if (isElectron) {
    const res = await pickFile()
    if (!res?.filePath) return null
    return {
      path: res.filePath,
      name: res.filename || res.filePath.split(/[\\/]/).pop() || 'Video',
      size: res.fileSize || 0
    }
  }
  const res = await pickHostFile(opts)
  return res ? { path: res.path, name: res.name, size: res.size } : null
}

export function WatchParty() {
  const { toast } = useToast()
  const { identity, devices } = useDevices()
  const shouldReduceMotion = useReducedMotion()

  // Match a participant's peer id (noise public key) to its device record so
  // the roster can show how the peer is actually reached.
  const relayedPeerIds = new Set(
    (devices || []).filter((d) => d.relayed && d.publicKey).map((d) => d.publicKey as string)
  )

  // Room & Player State
  const [activeRoom, setActiveRoom] = useState<any | null>(null)
  const [discoveredRooms, setDiscoveredRooms] = useState<DiscoveredRoom[]>([])
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [roomTitleInput, setRoomTitleInput] = useState('')
  const [controlsMode, setControlsMode] = useState<'host' | 'open'>('host')
  const [isPrivateRoom, setIsPrivateRoom] = useState(false)
  const [lastPartyCode, setLastPartyCode] = useState<string>('')
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string; size: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [railTab, setRailTab] = useState<'roster' | 'chat' | 'queue' | 'subtitles'>('roster')

  // Chat — wired to WATCH_PARTY_CHAT + chat_history + live party:chat events
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  // Playback State
  const [streamUrl, setStreamUrl] = useState<string>('')
  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false)
  isPlayingRef.current = isPlaying
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const [copiedCode, setCopiedCode] = useState(false)
  const [floatingReactions, setFloatingReactions] = useState<{ id: number; emoji: string; x: number }[]>([])

  // error + autoplay + buffering
  const [playerError, setPlayerError] = useState<{ code: number; message: string; source: string } | null>(null)
  const [showTapToPlay, setShowTapToPlay] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const bufferingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryVersionRef = useRef(0)

  // guest transfer progress for placeholder — watermark gating stays intact
  const [guestProgress, setGuestProgress] = useState<{ pct: number; mb: string } | null>(null)

  // Subtitles — Blob URL sidecar preserved exactly
  const [subtitleTrack, setSubtitleTrack] = useState<{ name: string; url: string } | null>(null)
  const [showSubtitles, setShowSubtitles] = useState(true)

  // Voice (push-to-talk) — mic permission flow preserved
  const [voiceCapturing, setVoiceCapturing] = useState(false)
  const [talking, setTalking] = useState(false)
  const [voiceDucked, setVoiceDucked] = useState(false)

  // Catch-up (guest): latest authoritative master position
  const [hostPosition, setHostPosition] = useState<number | null>(null)

  // Queue (from room info)
  const [queueItems, setQueueItems] = useState<{ title: string; filename: string; fileSize: number }[]>([])

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const mpegtsPlayerRef = useRef<any>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncBroadcastRef = useRef<number>(0)
  const activeRoomRef = useRef<any | null>(null)
  activeRoomRef.current = activeRoom
  const currentTimeRef = useRef(0)
  const voiceRef = useRef<WatchVoice | null>(null)
  const scheduledReactionsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Chat fetch + live subscriptions
  const refreshChatHistory = useCallback(() => {
    call(METHODS.WATCH_PARTY_CHAT_HISTORY as any, null)
      .then((msgs: any) => {
        if (Array.isArray(msgs)) setChatMessages(msgs as ChatMessage[])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSendChat = async () => {
    const text = chatInput.trim()
    if (!text || !activeRoom) return
    const tempId = `tmp-${Date.now()}`
    // Optimistic echo so sender sees it even before engine round-trip
    setChatInput('')
    try {
      const res = (await call(METHODS.WATCH_PARTY_CHAT as any, { text })) as any
      // Engine emits party:chat -> WATCH_CHAT_MESSAGE; if handler returns true we already have echo
      if (res === false) {
        // not in room — surface error
        toast.error('Chat Failed', 'Not in a party.')
      }
    } catch (err: any) {
      toast.error('Chat Failed', err?.message || 'Could not send message.')
      setChatInput(text)
    }
    void tempId
  }

  // Fetch initial state & discover rooms
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_PARTY_KEY)
      if (saved) setLastPartyCode(JSON.parse(saved)?.roomCode || '')
    } catch {}

    call(METHODS.WATCH_PARTY_GET_ROOM).then((room: any) => {
      if (room) {
        setActiveRoom(room)
        // pull chat history once room is known
        call(METHODS.WATCH_PARTY_CHAT_HISTORY as any, null).then((msgs: any) => {
          if (Array.isArray(msgs)) setChatMessages(msgs as ChatMessage[])
        }).catch(() => {})
      }
    }).catch(() => {})

    call(METHODS.WATCH_PARTY_LIST_ROOMS).then((rooms: any) => {
      if (Array.isArray(rooms)) setDiscoveredRooms(rooms)
    }).catch(() => {})

    const unsubs = [
      on(EVENTS.WATCH_ROOMS_DISCOVERED, (rooms: any) => {
        if (Array.isArray(rooms)) setDiscoveredRooms(rooms)
      }),
      on(EVENTS.WATCH_ROOM_CREATED, (room: any) => {
        setActiveRoom(room)
        setStreamUrl('')
        setIsPlaying(false)
        setChatMessages([])
        refreshChatHistory()
      }),
      on(EVENTS.WATCH_ROOM_JOINED, (room: any) => {
        setActiveRoom(room)
        setStreamUrl('')
        setIsPlaying(false)
        setChatMessages([])
        refreshChatHistory()
      }),
      on(EVENTS.WATCH_ROOM_UPDATED, (room: any) => {
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
            room.subtitleName !== cur.subtitleName ||
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
      on(EVENTS.WATCH_ROOM_LEFT, () => {
        setActiveRoom(null)
        setStreamUrl('')
        setIsPlaying(false)
        setLoading(false)
        setQueueItems([])
        setSubtitleTrack(null)
        setHostPosition(null)
        setChatMessages([])
        localStorage.removeItem(LAST_PARTY_KEY)
        setLastPartyCode('')
      }),
      on(EVENTS.WATCH_ROOM_CLOSED, (evt: any) => {
        setActiveRoom(null)
        setStreamUrl('')
        setIsPlaying(false)
        setLoading(false)
        setQueueItems([])
        setSubtitleTrack(null)
        setHostPosition(null)
        setChatMessages([])
        if (evt?.reason === 'kicked') {
          toast.error('Removed', evt?.error || 'You were removed from the party by the host.')
        } else if (evt?.reason === 'join-timeout') {
          toast.error('Room Not Found', evt?.error || 'No host responded to your join request.')
        } else if (evt?.reason === 'host-left') {
          toast.info('Party Ended', 'The host has closed the Watch Party room.')
        } else {
          toast.info('Party Ended', evt?.error || 'The host has closed the Watch Party room.')
        }
      }),
      on(EVENTS.WATCH_STATE_SYNC, (state: any) => {
        if (!state) return
        handleRemotePlaybackState(state)
        const room = activeRoomRef.current
        const masterId = room?.playbackPeerId || room?.hostPeerId
        if (room && !room.isHost && state.sender?.id && state.sender.id === masterId && typeof state.positionSec === 'number') {
          setHostPosition(state.positionSec)
        }
      }),
      on(EVENTS.WATCH_REACTION, (reaction: any) => {
        if (reaction?.emoji) {
          handleTimestampedReaction(reaction)
        }
      }),
      on(EVENTS.WATCH_VOICE_CHUNK, (chunk: any) => {
        if (!chunk?.audioB64) return
        voiceRef.current?.playChunk(chunk.audioB64)
      }),
      on(EVENTS.WATCH_MODERATED, (mod: any) => {
        if (!mod?.action) return
        const meId = identity?.id
        if (mod.action === 'mute' && mod.targetPeerId === meId) {
          toast.info('Muted', 'The host muted your microphone.')
        } else if (mod.action === 'unmute' && mod.targetPeerId === meId) {
          toast.success('Unmuted', 'The host unmuted your microphone.')
        } else if (mod.action === 'promote' && mod.targetPeerId === meId) {
          toast.success('Playback Control Granted', 'You can now drive play/pause/seek for everyone.')
        } else if (mod.action === 'promote') {
          toast.info('Playback Control Moved', `${mod.by?.name || 'The host'} promoted another peer to control playback.`)
        }
      }),
      on(EVENTS.WATCH_PEER_JOINED, (data: any) => {
        toast.success('Peer Joined', `${data.peer?.name || 'A peer'} joined the party.`)
      }),
      // Chat: history (late-join replay) + live
      on(EVENTS.WATCH_CHAT_MESSAGE as any, (msg: any) => {
        if (!msg || !msg.text) return
        setChatMessages((prev) => {
          if (msg.messageId && prev.some((m) => m.messageId === msg.messageId)) return prev
          return [...prev, msg as ChatMessage].slice(-120)
        })
      }),
      on(EVENTS.WATCH_CHAT_HISTORY as any, (data: any) => {
        const msgs = (data && (data.messages || data)) as any
        if (Array.isArray(msgs)) setChatMessages(msgs as ChatMessage[])
      }),
      // Also accept raw party:chat from non-room path if ever forwarded under that name
      on('watch.chat_message' as any, (msg: any) => {
        if (!msg || !msg.text) return
        setChatMessages((prev) => {
          if (msg.messageId && prev.some((m) => m.messageId === msg.messageId)) return prev
          return [...prev, msg as ChatMessage].slice(-120)
        })
      }),
    ]

    return () => {
      unsubs.forEach((u) => u?.())
    }
  }, [refreshChatHistory])

  // Resolve WebDAV Stream URL whenever activeRoom changes — watermark gating intact
  useEffect(() => {
    if (!activeRoom) {
      setStreamUrl('')
      return
    }

    if (activeRoom.filePath) {
      call(METHODS.STREAM_URL_GET, { filePath: activeRoom.filePath })
        .then((res: any) => {
          if (res?.url) setStreamUrl(res.url)
        })
        .catch(() => {})
      return
    }

    if (!activeRoom.roomCode) return

    const epoch = activeRoom.mediaEpoch || 1
    const shareId = `watch-${activeRoom.roomCode.toLowerCase()}${epoch > 1 ? `-e${epoch}` : ''}`
    let version = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    const resolve = () => {
      call(METHODS.STREAM_URL_GET, { transferId: shareId })
        .then((res: any) => {
          if (stopped) return
          if (res?.url) {
            setStreamUrl(version > 0 ? `${res.url}&vw=${version}` : res.url)
          } else if (!retryTimer) {
            retryTimer = setTimeout(() => {
              retryTimer = null
              resolve()
            }, 3000)
          }
        })
        .catch(() => {
          if (!stopped && !retryTimer) {
            retryTimer = setTimeout(() => {
              retryTimer = null
              resolve()
            }, 3000)
          }
        })
    }
    resolve()
    const unsubs = [
      on(EVENTS.WATCH_MEDIA_READY, (media: any) => {
        if (media?.shareId && media.shareId !== shareId) return
        version += 1
        if (retryTimer) {
          clearTimeout(retryTimer)
          retryTimer = null
        }
        resolve()
      }),
      on(EVENTS.WATCH_MEDIA_ERROR, (media: any) => {
        if (media?.shareId && media.shareId !== shareId) return
        setLoading(false)
        toast.error('Media Error', media?.error || 'The party media could not be transferred.')
      }),
    ]
    return () => {
      stopped = true
      if (retryTimer) clearTimeout(retryTimer)
      unsubs.forEach((u) => u?.())
    }
  }, [activeRoom])

  // guest progress for connecting placeholder — extent polling safety net
  useEffect(() => {
    if (!activeRoom || activeRoom.filePath || !activeRoom.roomCode) { setGuestProgress(null); return }
    const epoch = activeRoom.mediaEpoch || 1
    const sid = `watch-${activeRoom.roomCode.toLowerCase()}${epoch > 1 ? `-e${epoch}` : ''}`
    const fileSize = Number(activeRoom.fileSize) || 0
    const unsub = on(EVENTS.TRANSFER_PROGRESS as any, (ev: any) => {
      const d = ev as any
      if (!d || d.id !== sid) return
      const pct = typeof d.progress === 'number' ? d.progress : 0
      const bytes = fileSize > 0 ? Math.round((fileSize * pct) / 100) : 0
      const mb = (bytes / (1024 * 1024)).toFixed(1)
      setGuestProgress({ pct, mb })
      if (d.playable) setPlayerError(null)
    })
    call(METHODS.TRANSFERS_LIST, null).then((list: any) => {
      const hit = Array.isArray(list) ? list.find((x: any) => x.id === sid) : null
      if (hit && typeof hit.progress === 'number') {
        const pct = hit.progress
        const bytes = fileSize > 0 ? Math.round((fileSize * pct) / 100) : 0
        setGuestProgress({ pct, mb: (bytes / (1024 * 1024)).toFixed(1) })
      }
    }).catch((err: Error) => toast.error('Progress Refresh Failed', err?.message || 'Could not refresh the playback progress.'))
    return () => { try { (unsub as any)?.() } catch {} }
  }, [activeRoom])

  // Universal playback engine: mpegts.js (MSE) for TS/MPEG-TS/FLV, hls.js for m3u8, native otherwise
  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamUrl) return
    setPlayerError(null); setShowTapToPlay(false); setIsBuffering(false)

    const activeRoom = activeRoomRef.current
    const fname = (activeRoom?.filename || activeRoom?.filePath || activeRoom?.title || '').toLowerCase()
    const lowerUrl = streamUrl.toLowerCase()
    const isTs = fname.endsWith('.ts') || fname.endsWith('.m2ts') || fname.endsWith('.mts') || lowerUrl.includes('.ts')
    const isFlv = fname.endsWith('.flv') || lowerUrl.includes('.flv')
    const isHls = fname.endsWith('.m3u8') || lowerUrl.includes('.m3u8')

    let mpegtsPlayer: any = null
    let hlsPlayer: Hls | null = null

    if ((isTs || isFlv) && mpegts.isSupported()) {
      try {
        mpegtsPlayer = mpegts.createPlayer(
          { type: isFlv ? 'flv' : 'mse', isLive: false, url: streamUrl, cors: true },
          {
            enableWorker: true,
            lazyLoad: true,
            lazyLoadMaxDuration: 180,
            lazyLoadRecoverDuration: 30,
            deferLoadAfterSourceOpen: false,
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 120,
            autoCleanupMinBackwardDuration: 60,
            seekType: 'range',
            fixAudioTimestampGap: true
          }
        )
        mpegtsPlayerRef.current = mpegtsPlayer
        mpegtsPlayer.attachMediaElement(video)
        mpegtsPlayer.load()
        mpegtsPlayer.on(mpegts.Events.MEDIA_INFO, (info: any) => {
          if (info?.duration && isFinite(info.duration) && info.duration > 0) {
            setDuration(info.duration / 1000)
          }
        })
        mpegtsPlayer.on(mpegts.Events.ERROR, (errType: string, errDetail: string, errInfo: any) => {
          console.warn('[WatchParty] mpegts player event:', errType, errDetail, errInfo)
          setPlayerError({ code: 3, message: `${errType}: ${errDetail || ''}`.trim(), source: 'mpegts' })
        })
      } catch (err) {
        console.warn('[WatchParty] mpegts init failed, falling back to native:', err)
        video.src = streamUrl
      }
    } else if (isHls && Hls.isSupported()) {
      try {
        hlsPlayer = new Hls({ enableWorker: true })
        hlsPlayer.loadSource(streamUrl)
        hlsPlayer.attachMedia(video)
        hlsPlayer.on(Hls.Events.ERROR as any, (_ev: any, data: any) => {
          if (!data || !data.fatal) return
          console.warn('[WatchParty] hls fatal:', data.type, data.details)
          const code = data.type === 'networkError' ? 2 : 3
          setPlayerError({ code, message: String(data.details || data.type || 'HLS error'), source: 'hls' })
        })
      } catch (err) {
        console.warn('[WatchParty] hls init failed, falling back to native:', err)
        video.src = streamUrl
      }
    } else {
      video.src = streamUrl
    }

    return () => {
      mpegtsPlayerRef.current = null
      if (mpegtsPlayer) {
        try {
          mpegtsPlayer.pause()
          mpegtsPlayer.unload()
          mpegtsPlayer.detachMediaElement()
          mpegtsPlayer.destroy()
        } catch {}
      }
      if (hlsPlayer) {
        try {
          hlsPlayer.destroy()
        } catch {}
      }
    }
  }, [streamUrl])

  // clamp a time position to the transfer contiguous covered extent — seek clamp preserved
  const clampSeekToCovered = useCallback(async (targetSec: number, dur: number) => {
    try {
      const room = activeRoomRef.current
      if (!room || room.isHost || !room.roomCode) return targetSec
      if (!(dur > 0) || !(targetSec >= 0)) return targetSec
      const epoch = room.mediaEpoch || 1
      const sid = `watch-${room.roomCode.toLowerCase()}${epoch > 1 ? `-e${epoch}` : ''}`
      const ext: any = await call(METHODS.TRANSFERS_EXTENT as any, { transferId: sid }).catch(() => null)
      if (!ext || !ext.fileSize || !(ext.coveredBytes > 0)) return targetSec
      if (ext.complete) return targetSec
      const fileSize = ext.fileSize
      const covered = ext.coveredBytes
      const marginSec = 2
      const maxSec = Math.max(0, (covered / fileSize) * dur - marginSec)
      if (targetSec > maxSec) {
        const byteOff = Math.max(0, Math.floor((targetSec / Math.max(1, dur)) * fileSize))
        call(METHODS.SET_PLAYHEAD_BYTE, { transferId: sid, byteOffset: byteOff }).catch((err: Error) =>
          toast.error('Playback Sync Failed', err?.message || 'Could not sync the playback position.')
        )
        return maxSec
      }
    } catch {}
    return targetSec
  }, [])

  // Remote Sync Handler — heartbeat consumer intact
  const handleRemotePlaybackState = useCallback((state: any) => {
    const video = videoRef.current
    if (!video) return

    if (state.action === 'play') {
      const doPlay = async () => {
        if (typeof state.positionSec === 'number' && Math.abs(video.currentTime - state.positionSec) > 1.5) {
          const dur = video.duration || duration || 0
          const clamped = dur > 0 ? await clampSeekToCovered(state.positionSec, dur) : state.positionSec
          video.currentTime = clamped
        }
        video.play().catch((err: any) => {
          const name = err && (err.name || '')
          if (name === 'NotAllowedError') setShowTapToPlay(true)
          else if (err) setPlayerError({ code: 0, message: err.message || String(err), source: 'play' })
        })
      }
      void doPlay()
      setIsPlaying(true)
    } else if (state.action === 'pause') {
      if (typeof state.positionSec === 'number' && Math.abs(video.currentTime - state.positionSec) > 1.5) {
        video.currentTime = state.positionSec
      }
      video.pause()
      setIsPlaying(false)
    } else if (state.action === 'seek') {
      if (typeof state.positionSec === 'number') {
        const dur = video.duration || duration || 0
        clampSeekToCovered(state.positionSec, dur).then((clamped) => {
          video.currentTime = clamped
          setCurrentTime(clamped)
        })
      }
    }
  }, [clampSeekToCovered, duration])

  const broadcastSync = (action: 'play' | 'pause' | 'seek', posSec: number) => {
    const now = Date.now()
    if (now - lastSyncBroadcastRef.current < 200 && action !== 'seek') return
    lastSyncBroadcastRef.current = now
    call(METHODS.WATCH_STATE_BROADCAST, {
      roomCode: activeRoom?.roomCode,
      action,
      positionSec: posSec
    }).catch(() => {})
  }

  // Continuous-position heartbeat: 5s re-broadcast while playing — preserved exactly
  useEffect(() => {
    const room = activeRoomRef.current
    if (!activeRoom || !isPlaying) return
    if (!(activeRoom.isHost || activeRoom.controlsMode === 'open')) return
    void room
    const beat = setInterval(() => {
      const v = videoRef.current
      if (v && !v.paused && !v.ended) {
        broadcastSync('play', v.currentTime)
      }
    }, 5000)
    return () => clearInterval(beat)
  }, [activeRoom, isPlaying])

  const triggerReactionAnimation = (emoji: string) => {
    const id = Date.now() + Math.random()
    const x = Math.random() * 80 + 10
    setFloatingReactions((prev) => [...prev, { id, emoji, x }])
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id))
    }, 2500)
  }

  const handleSendReaction = (emoji: string) => {
    triggerReactionAnimation(emoji)
    call(METHODS.WATCH_PARTY_REACTION, { emoji, positionSec: currentTimeRef.current }).catch(() => {})
  }

  // File Picker
  const handlePickFile = async () => {
    try {
      const res = await pickMediaFile({
        extensions: VIDEO_EXTENSIONS,
        title: 'Choose a video to host',
        description: 'Pick a video on this computer — the host reads it directly, so 4K files of any size work'
      })
      if (!res) return
      setSelectedFile({ path: res.path, name: res.name, size: res.size })
      if (!roomTitleInput) {
        setRoomTitleInput(res.name.replace(/\.[^/.]+$/, '') || 'Watch Party')
      }
    } catch (err: any) {
      toast.error('File Selection Failed', err?.message || 'Could not open the video file chooser.')
    }
  }

  // Host Create Room
  const handleCreateRoom = async () => {
    if (!selectedFile) {
      toast.error('File Required', 'Please select a video file to stream.')
      return
    }
    setLoading(true)
    try {
      const room = (await call(METHODS.WATCH_PARTY_CREATE, {
        title: roomTitleInput || selectedFile.name,
        filePath: selectedFile.path,
        controlsMode,
        isPrivate: isPrivateRoom
      })) as any
      setActiveRoom(room)
      localStorage.setItem(LAST_PARTY_KEY, JSON.stringify({ roomCode: room.roomCode }))
      setLastPartyCode(room.roomCode || '')
      toast.success('Room Created', `Watch Party ${room.roomCode} is live!`)
    } catch (err: any) {
      toast.error('Creation Failed', err?.message || 'Could not create room')
    } finally {
      setLoading(false)
    }
  }

  // Join Room
  const handleJoinRoom = async (codeToJoin?: string) => {
    const code = (codeToJoin || roomCodeInput).trim().toUpperCase()
    if (!code) {
      toast.error('Code Required', 'Enter a valid Watch Party room code.')
      return
    }
    setLoading(true)
    try {
      const room = (await call(METHODS.WATCH_PARTY_JOIN, { roomCode: code })) as any
      setActiveRoom(room)
      localStorage.setItem(LAST_PARTY_KEY, JSON.stringify({ roomCode: code }))
      setLastPartyCode(code)
      toast.success('Joined Room', `Connected to party ${code}`)
    } catch (err: any) {
      toast.error('Join Failed', err?.message || 'Could not join room')
    } finally {
      setLoading(false)
    }
  }

  // Leave Room
  const handleLeaveRoom = async () => {
    await call(METHODS.WATCH_PARTY_LEAVE).catch(() => {})
    setActiveRoom(null)
    setStreamUrl('')
    setSelectedFile(null)
    setChatMessages([])
  }

  const handleCopyCode = () => {
    if (!activeRoom?.roomCode) return
    navigator.clipboard.writeText(activeRoom.roomCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
    toast.success('Copied', `Room code ${activeRoom.roomCode} copied to clipboard!`)
  }

  // ─── Moderation (host) ───────────────────────────────────────────────────
  const handleModerate = async (action: 'kick' | 'mute' | 'unmute' | 'promote', targetPeerId: string, targetName: string) => {
    try {
      const res = (await call(METHODS.WATCH_PARTY_MODERATE, { action, targetPeerId })) as any
      if (!res?.success) {
        toast.error('Action Failed', res?.error || 'Moderation action failed.')
        return
      }
      if (action === 'kick') toast.success('Removed', `${targetName} was removed from the party.`)
      if (action === 'mute') toast.success('Muted', `${targetName} was muted.`)
      if (action === 'unmute') toast.success('Unmuted', `${targetName} can talk again.`)
      if (action === 'promote') toast.success('Playback Control Granted', `${targetName} now controls playback.`)
    } catch (err: any) {
      toast.error('Action Failed', err?.message || 'Moderation action failed.')
    }
  }

  // ─── Queue (host) ────────────────────────────────────────────────────────
  const handleAddToQueue = async () => {
    try {
      const res = await pickMediaFile({
        extensions: VIDEO_EXTENSIONS,
        title: 'Add a video to the queue',
        description: 'Pick a video on this computer — the host reads it directly, no size limit'
      })
      if (!res) return
      const room = (await call(METHODS.WATCH_PARTY_QUEUE_ADD, {
        filePath: res.path,
        title: res.name.replace(/\.[^/.]+$/, '')
      })) as any
      if (Array.isArray(room?.queue)) setQueueItems(room.queue)
      toast.success('Queued', `${res.name} added to the party queue.`)
    } catch (err: any) {
      toast.error('Queue Failed', err?.message || 'Could not add the file to the queue.')
    }
  }

  const handleRemoveFromQueue = async (index: number) => {
    try {
      await call(METHODS.WATCH_PARTY_QUEUE_REMOVE, { index })
      setQueueItems((prev) => prev.filter((_, i) => i !== index))
    } catch {}
  }

  const handleMediaEnded = () => {
    setIsPlaying(false)
    if (activeRoom?.isHost && queueItems.length > 0) {
      call(METHODS.WATCH_PARTY_QUEUE_NEXT).catch(() => {})
    }
  }

  // ─── Subtitles — Blob URL lifecycle preserved ─────────────────────────────
  const refreshSubtitleTrack = useCallback(() => {
    call(METHODS.WATCH_PARTY_SUBTITLE_GET)
      .then((sub: any) => {
        setSubtitleTrack((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url)
          if (sub?.vtt) {
            const url = URL.createObjectURL(new Blob([sub.vtt], { type: 'text/vtt' }))
            return { name: sub.filename || 'Subtitles', url }
          }
          return null
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!activeRoom?.roomCode) return
    refreshSubtitleTrack()
  }, [activeRoom?.roomCode, activeRoom?.mediaEpoch, activeRoom?.subtitleName, refreshSubtitleTrack])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = showSubtitles ? 'showing' : 'hidden'
    }
  }, [showSubtitles, subtitleTrack])

  const handlePickSubtitle = async () => {
    try {
      const res = await pickMediaFile({
        extensions: SUBTITLE_EXTENSIONS,
        title: 'Attach a subtitle file',
        description: 'Pick a subtitle file on this computer (.srt, .vtt, .ass, .ssa, .sub)'
      })
      if (!res) return
      await call(METHODS.WATCH_PARTY_SUBTITLE_SET, { subtitlePath: res.path })
      refreshSubtitleTrack()
      toast.success('Subtitles On', 'The subtitle track is now shared with the party.')
    } catch (err: any) {
      toast.error('Subtitles Failed', err?.message || 'Could not attach the subtitle file.')
    }
  }

  // ─── Rewind window (host) ────────────────────────────────────────────────
  const handleSetRewind = (seconds: number) => {
    call(METHODS.WATCH_PARTY_REWIND_SET, { seconds }).catch(() => {})
    setActiveRoom((prev: any) => (prev ? { ...prev, rewindWindowSec: seconds } : prev))
  }

  // ─── Push-to-talk voice ──────────────────────────────────────────────────
  const ensureVoice = async () => {
    if (voiceRef.current) return voiceRef.current
    const v = new WatchVoice()
    v.onVoiceActivity = (active) => setTalking(active)
    try {
      await v.startCapture((audioB64, durationMs, seq) => {
        call(METHODS.WATCH_PARTY_VOICE, { audioB64, durationMs, seq }).catch(() => {})
      })
      voiceRef.current = v
      setVoiceCapturing(true)
      return v
    } catch (err: any) {
      v.destroy()
      toast.error('Microphone Unavailable', err?.message || 'Could not access the microphone.')
      return null
    }
  }

  const handlePTTStart = async () => {
    const room = activeRoomRef.current
    if (!room || room.isLocalMuted) return
    const v = await ensureVoice()
    if (!v) return
    v.setSending(true)
  }

  const handlePTTEnd = () => {
    voiceRef.current?.setSending(false)
  }

  useEffect(() => {
    return () => {
      voiceRef.current?.destroy()
      voiceRef.current = null
    }
  }, [activeRoom?.roomCode])

  // Voice ducking: lower the movie while someone is talking — preserved
  useEffect(() => {
    const video = videoRef.current
    if (video) video.volume = voiceDucked ? 0.25 : 1
  }, [voiceDucked])

  useEffect(() => {
    if (talking) {
      setVoiceDucked(true)
      return
    }
    const t = setTimeout(() => setVoiceDucked(false), 600)
    return () => clearTimeout(t)
  }, [talking])

  // ─── Catch-up (guest) ────────────────────────────────────────────────────
  const handleJumpToHost = () => {
    const video = videoRef.current
    if (!video || hostPosition == null) return
    video.currentTime = hostPosition
    setCurrentTime(hostPosition)
    broadcastSync('seek', hostPosition)
  }

  // ─── Timestamped reactions ───────────────────────────────────────────────
  const handleTimestampedReaction = (reaction: any) => {
    const pos = typeof reaction.positionSec === 'number' ? reaction.positionSec : null
    if (pos == null) {
      triggerReactionAnimation(reaction.emoji)
      return
    }
    const local = currentTimeRef.current
    if (Math.abs(local - pos) < 2 || pos < local) {
      triggerReactionAnimation(reaction.emoji)
      return
    }
    const delaySec = pos - local
    if (!isPlayingRef.current || delaySec > 3) {
      triggerReactionAnimation(reaction.emoji)
      return
    }
    const t = setTimeout(() => triggerReactionAnimation(reaction.emoji), delaySec * 1000)
    scheduledReactionsRef.current.push(t)
  }

  useEffect(() => {
    const list = scheduledReactionsRef.current
    return () => {
      list.forEach((t) => clearTimeout(t))
      list.length = 0
    }
  }, [])

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || isNaN(secs) || secs < 0) return '00:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // Auto-hide controls
  const handleMouseMove = () => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3500)
    }
  }

  const launchDisabled = !selectedFile

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col gap-5 pb-2">
      {/* ═══ Header — lobby is light, theater header is dark-rail ═══ */}
      <div className={cn(
        'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3',
        activeRoom
          ? 'border-white/10 bg-[#0B0E14] text-white'
          : 'border-border/50 bg-card shadow-sm'
      )}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-sm',
            activeRoom ? 'bg-white/[0.08] border-white/10 text-white' : 'bg-primary/10 border-primary/20 text-primary'
          )}>
            <Tv className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className={cn('flex items-center gap-2 text-[15px] font-black tracking-tight', activeRoom ? 'text-white' : 'text-foreground')}>
              <span>Watch Party</span>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide border',
                activeRoom ? 'bg-white/10 border-white/15 text-white/90' : 'bg-primary/10 border-primary/20 text-primary')}>
                Live Theater
              </span>
            </h1>
            <p className={cn('text-xs leading-none mt-1', activeRoom ? 'text-white/55' : 'text-muted-foreground')}>
              {activeRoom ? `${activeRoom.title} · ${activeRoom.isHost ? 'You are hosting' : `Hosted by ${activeRoom.hostName || 'host'}`} — synced playback` : 'Watch together in sync — host a room or join with a code.'}
            </p>
          </div>
        </div>

        {activeRoom ? (
          <div className="flex items-center gap-2 shrink-0">
            {/* Sync indicator */}
            <span className={cn(
              'hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold',
              isPlaying ? 'border-emerald-500/25 bg-emerald-500/15 text-emerald-300' : 'border-white/10 bg-white/5 text-white/60'
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-white/40')} />
              {isPlaying ? 'In Sync' : 'Paused'}
            </span>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-mono font-bold text-white hover:bg-white/[0.12] transition-colors"
            >
              <Radio className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
              {activeRoom.isPrivate && <Lock className="h-3 w-3 text-amber-300" />}
              <span>{activeRoom.roomCode}</span>
              {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-white/50" />}
            </button>
            <button
              onClick={handleLeaveRoom}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        ) : (
          <div className="hidden lg:flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-2.5 py-1 font-medium">
              <Wand2 className="h-3.5 w-3.5 text-primary" /> Invite codes · Sync · Voice
            </span>
          </div>
        )}
      </div>

      {/* ═══════════════════ LOBBY ═══════════════════ */}
      {!activeRoom ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Host a Party — inviting, warm */}
          <div className="lg:col-span-7 relative overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-sm">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-12 h-56 w-56 rounded-full bg-[rgb(var(--meshdrop-cyan)/0.08)] blur-3xl pointer-events-none" />
            <div className="relative p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-black tracking-tight text-foreground">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary"><Sparkles className="h-4 w-4" /></span>
                    Host a Watch Party
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground max-w-[52ch]">
                    Pick a video from this computer to stage as a live swarm stream. Guests join with your room code and every play, pause, and seek stays in sync.
                  </p>
                </div>
              </div>

              {/* Video picker — dashed, F08 rule */}
              <button
                type="button"
                onClick={handlePickFile}
                className={cn(
                  'group flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selectedFile
                    ? 'border-primary/40 bg-primary/[0.06] hover:bg-primary/[0.09]'
                    : 'border-border/60 bg-muted/20 hover:border-primary/30 hover:bg-primary/[0.04]'
                )}
              >
                <div className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-2xl border text-primary transition-all',
                  selectedFile ? 'bg-primary/15 border-primary/25' : 'bg-primary/10 border-primary/15 group-hover:scale-105'
                )}>
                  <Film className="h-6 w-6" />
                </div>
                {selectedFile ? (
                  <div className="w-full">
                    <p className="truncate text-sm font-bold text-foreground" title={selectedFile.name}>{selectedFile.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · Ready to stream</p>
                    <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">Change video <ArrowRight className="h-3 w-3" /></p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-bold text-foreground">Choose a video to host</p>
                    <p className="mt-1 text-xs text-muted-foreground">MP4, MKV, WebM, TS, MOV — staged to the swarm via .p2p-staging</p>
                    <p className="mt-2 text-[11px] font-medium text-muted-foreground/70">Click to browse</p>
                  </div>
                )}
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Room title</span>
                  <input
                    type="text"
                    value={roomTitleInput}
                    onChange={(e) => setRoomTitleInput(e.target.value)}
                    placeholder="e.g. Friday Movie Night"
                    className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Who can control playback</span>
                  <select
                    value={controlsMode}
                    onChange={(e: any) => setControlsMode(e.target.value)}
                    className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="host">Host only — you drive play / pause / seek</option>
                    <option value="open">Everyone — any peer can control</option>
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none w-fit rounded-lg px-1 py-1 -ml-1 hover:bg-muted/40 transition-colors">
                <input type="checkbox" checked={isPrivateRoom} onChange={(e) => setIsPrivateRoom(e.target.checked)} className="h-4 w-4 rounded accent-[hsl(var(--primary))]" />
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Lock className="h-3 w-3" /> Private room — hidden from discovery, join by code only
                </span>
              </label>

              <div className="space-y-2">
                <button
                  disabled={launchDisabled || loading}
                  aria-disabled={launchDisabled || loading}
                  onClick={handleCreateRoom}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-black shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    launchDisabled
                      ? 'bg-muted text-muted-foreground border border-border/60 cursor-not-allowed'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_8px_24px_-12px_rgba(99,102,241,0.6)] active:scale-[0.99]'
                  )}
                >
                  <Tv className="h-4 w-4" /> {loading ? 'Starting party…' : 'Launch Watch Party'}
                </button>
                {launchDisabled && (
                  <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <Shield className="h-3.5 w-3.5" /> Pick a video first
                  </p>
                )}
              </div>

              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                <Layers className="h-3.5 w-3.5" /> The video is staged under a deterministic shareId and offered to joiners once the head watermark is playable.
              </p>
            </div>
          </div>

          {/* Join + Discovered */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div className="rounded-[20px] border border-border/60 bg-card shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm font-black tracking-tight text-foreground">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500"><Ticket className="h-4 w-4" /></span>
                Join with room code
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">Paste the PARTY- code your host shared. Codes look like PARTY-XXXX-XXXX.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleJoinRoom() }}
                  placeholder="PARTY-XXXX-XXXX"
                  className="flex-1 rounded-xl border border-border/60 bg-background px-3 py-2.5 font-mono text-sm font-bold tracking-widest text-foreground placeholder:font-sans placeholder:font-medium placeholder:tracking-normal placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <button
                  disabled={!roomCodeInput.trim() || loading}
                  onClick={() => handleJoinRoom()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  Join <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              {lastPartyCode && (
                <button
                  disabled={loading}
                  onClick={() => handleJoinRoom(lastPartyCode)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                >
                  <Clock className="h-3.5 w-3.5" /> Rejoin {lastPartyCode}
                </button>
              )}
            </div>

            <div className="rounded-[20px] border border-border/60 bg-card shadow-sm p-6 flex flex-col flex-1 min-h-[280px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-black tracking-tight text-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400"><Users className="h-4 w-4" /></span>
                  Discovered parties
                </div>
                <span className="rounded-full border border-border/40 bg-muted/40 px-2.5 py-1 font-mono text-[11px] font-bold text-muted-foreground">{discoveredRooms.length} live</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Rooms announced by paired peers on the swarm (private rooms never appear here).</p>
              {discoveredRooms.length > 0 ? (
                <div className="mt-4 flex flex-col gap-2">
                  {discoveredRooms.map((room) => (
                    <div key={room.roomCode} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/20 px-3 py-3 hover:border-primary/20 hover:bg-primary/[0.04] transition-colors">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground" title={room.title}>{room.title}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground" title={`${room.hostName} · ${room.roomCode}`}>{room.hostName} · {room.roomCode}</p>
                      </div>
                      <button
                        onClick={() => handleJoinRoom(room.roomCode)}
                        className="shrink-0 rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 border border-border/30 text-muted-foreground/50"><Film className="h-6 w-6" /></div>
                  <p className="max-w-[28ch] text-xs leading-relaxed text-muted-foreground">No parties discovered yet. Host one on the left or paste a code above.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ═══════════════════ THEATER — near-black immersive ═══════════════════ */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-[520px]">
          {/* Video — the stage */}
          <div
            className="lg:col-span-8 relative flex flex-col overflow-hidden rounded-[20px] border border-white/10 bg-black shadow-2xl min-h-[460px]"
            onMouseMove={handleMouseMove}
          >
            {/* Top meta bar over video */}
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-4 py-3 pointer-events-none">
              <div className="flex items-center gap-2 pointer-events-auto">
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 backdrop-blur px-2.5 py-1 text-[11px] font-bold text-white">
                  <Eye className="h-3 w-3" /> {activeRoom.isHost ? 'You are hosting' : `Hosted by ${activeRoom.hostName || 'host'}`}
                  {activeRoom.isPrivate && <Lock className="h-3 w-3 text-amber-300" />}
                </span>
                <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold backdrop-blur',
                  isPlaying ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/10 text-white/70')}>
                  <Activity className={cn('h-3 w-3', isPlaying && 'animate-pulse')} /> {isPlaying ? 'Live' : 'Paused'} · {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 pointer-events-auto">
                <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2 py-1 text-[11px] font-medium text-white/70 backdrop-blur">
                  <Zap className="h-3 w-3 text-amber-300" /> {activeRoom.controlsMode === 'open' ? 'Everyone can control' : 'Host controls'}
                </span>
              </div>
            </div>

            {/* Video surface */}
            <div className="relative flex flex-1 items-center justify-center bg-black">
              {streamUrl ? (
                <>
                  <video
                    ref={videoRef}
                    className="h-full max-h-[560px] w-full object-contain"
                    autoPlay
                    playsInline
                    crossOrigin="anonymous"
                    onError={(e) => {
                      const me: any = (e.currentTarget as HTMLVideoElement).error
                      const code = me ? me.code : 0
                      const msg = me ? (me.message || `MediaError code ${code}`) : 'MediaError'
                      console.warn('[WatchParty] native video error', code, msg, 'on', streamUrl)
                      setPlayerError({ code: code || 3, message: msg, source: 'native' })
                    }}
                    onWaiting={() => {
                      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current)
                      bufferingTimerRef.current = setTimeout(() => setIsBuffering(true), 1200)
                    }}
                    onStalled={() => {
                      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current)
                      bufferingTimerRef.current = setTimeout(() => setIsBuffering(true), 1200)
                    }}
                    onPlaying={() => { if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current); setIsBuffering(false); setShowTapToPlay(false); setPlayerError(null) }}
                    onCanPlay={() => { if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current); setIsBuffering(false) }}
                    onTimeUpdate={() => {
                      if (videoRef.current) {
                        currentTimeRef.current = videoRef.current.currentTime
                        setCurrentTime(videoRef.current.currentTime)
                      }
                    }}
                    onEnded={handleMediaEnded}
                    onDurationChange={() => { if (videoRef.current) setDuration(videoRef.current.duration) }}
                    onPlay={() => {
                      setIsPlaying(true)
                      if (activeRoom.isHost || activeRoom.controlsMode === 'open') broadcastSync('play', videoRef.current?.currentTime || 0)
                    }}
                    onPause={() => {
                      setIsPlaying(false)
                      if (activeRoom.isHost || activeRoom.controlsMode === 'open') broadcastSync('pause', videoRef.current?.currentTime || 0)
                    }}
                  >
                    {subtitleTrack && (
                      <track key={subtitleTrack.url} kind="subtitles" label={subtitleTrack.name} srcLang="en" src={subtitleTrack.url} default />
                    )}
                  </video>

                  {/* Tap for sound — autoplay fallback affordance */}
                  {showTapToPlay && !playerError && (
                    <button
                      onClick={() => {
                        const v = videoRef.current
                        if (!v) return
                        setShowTapToPlay(false)
                        // keep existing logic: try unmuted play; if still blocked, error surfaces
                        v.muted = false
                        setIsMuted(false)
                        v.play().catch((err: any) => setPlayerError({ code: 0, message: err.message || String(err), source: 'play' }))
                      }}
                      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/75 backdrop-blur-sm p-6 text-center"
                    >
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-xl">
                        <Volume2 className="h-7 w-7" />
                      </div>
                      <p className="text-sm font-black text-white">Tap for sound</p>
                      <p className="max-w-[32ch] text-xs leading-relaxed text-white/70">Autoplay was blocked — tap to unmute and continue in sync.</p>
                      <span className="rounded-full bg-white px-4 py-2 text-xs font-bold text-black">Enable sound</span>
                    </button>
                  )}

                  {/* Error overlay — Retry re-resolves stream URL */}
                  {playerError && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
                      <p className="text-sm font-black text-white">{playerError.code === 2 ? 'Connection interrupted' : playerError.code === 3 || playerError.code === 4 ? 'Format not supported on this device' : 'Playback failed'}</p>
                      <p className="max-w-[36ch] text-xs leading-relaxed text-white/65">{playerError.message || (playerError.code === 2 ? 'Retrying…' : 'Try a different file or use Retry.')}</p>
                      <button
                        onClick={() => {
                          setPlayerError(null); setShowTapToPlay(false); retryVersionRef.current += 1
                          const room = activeRoomRef.current
                          if (!room || !room.roomCode) return
                          const epoch = room.mediaEpoch || 1
                          const sid = `watch-${room.roomCode.toLowerCase()}${epoch > 1 ? `-e${epoch}` : ''}`
                          call(METHODS.STREAM_URL_GET as any, { transferId: sid }).then((res: any) => {
                            if (res?.url) setStreamUrl(`${res.url}&vw=${retryVersionRef.current}`)
                          }).catch(() => {})
                        }}
                        className="rounded-xl bg-white px-5 py-2.5 text-xs font-black text-black hover:bg-white/90 transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {isBuffering && !playerError && !showTapToPlay && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/25 pointer-events-none">
                      <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                      <span className="text-xs font-medium text-white/80">Buffering…</span>
                    </div>
                  )}
                </>
              ) : (
                /* Preparing → Ready — watermark gating stays intact, now elegant */
                <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                  <div className="relative">
                    <div className="h-14 w-14 animate-spin rounded-full border-2 border-white/10 border-t-white/90" />
                    <Film className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-white/80" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-black text-white">Preparing your stream…</p>
                    <p className="text-xs text-white/60">
                      {guestProgress && guestProgress.pct > 0
                        ? `${guestProgress.pct}% · ${guestProgress.mb} MB staged — starts as soon as the head watermark is playable`
                        : 'Staging video blocks across the mesh — this becomes Ready automatically'}
                    </p>
                  </div>
                  {guestProgress && guestProgress.pct > 0 && (
                    <div className="w-full max-w-[320px] space-y-1.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <motion.div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, guestProgress.pct)}%` }} layout />
                      </div>
                      <p className="font-mono text-[11px] text-white/50">{guestProgress.pct}%</p>
                    </div>
                  )}
                </div>
              )}

              {/* Catch-up pill (guest) */}
              {!activeRoom.isHost && hostPosition != null && Math.abs(hostPosition - currentTime) > 5 && (
                <button
                  onClick={handleJumpToHost}
                  className="absolute left-1/2 top-14 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/15 bg-white px-3.5 py-1.5 text-xs font-black text-black shadow-lg hover:bg-white/90 transition-colors"
                >
                  <FastForward className="h-3.5 w-3.5" /> Jump to host ({formatTime(Math.abs(hostPosition - currentTime))} {hostPosition > currentTime ? 'behind' : 'ahead'})
                </button>
              )}

              {/* Floating reactions — burst animation on the video */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <AnimatePresence>
                  {floatingReactions.map((r) => (
                    <motion.div
                      key={r.id}
                      style={{ left: `${r.x}%` }}
                      initial={shouldReduceMotion ? { opacity: 1, y: 20 } : { opacity: 1, y: 40, scale: 0.8 }}
                      animate={shouldReduceMotion ? { opacity: 0, y: -80 } : { opacity: 0, y: -240, scale: 1.8 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: shouldReduceMotion ? 0.9 : 2, ease: 'easeOut' }}
                      className="absolute bottom-6 text-4xl select-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]"
                    >
                      {r.emoji}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Theater controls — custom-styled, near-black */}
              <AnimatePresence>
                {showControls && streamUrl && (
                  <motion.div
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 bg-gradient-to-t from-black via-black/70 to-transparent px-4 pb-4 pt-10"
                  >
                    {/* Scrubber */}
                    <div
                      role="slider"
                      aria-label="Seek"
                      aria-valuemin={0}
                      aria-valuemax={Math.round(duration) || 100}
                      aria-valuenow={Math.round(currentTime)}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const pos = (e.clientX - rect.left) / rect.width
                        const targetSec = pos * duration
                        if (videoRef.current) {
                          videoRef.current.currentTime = targetSec
                          setCurrentTime(targetSec)
                          if (activeRoom.isHost || activeRoom.controlsMode === 'open') broadcastSync('seek', targetSec)
                        }
                      }}
                      className="group relative h-2 w-full cursor-pointer rounded-full bg-white/15 py-2 -my-2 flex items-center"
                    >
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-white transition-all" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
                      </div>
                      <div className="absolute left-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow-md pointer-events-none hidden group-hover:block" style={{ left: `calc(${duration > 0 ? (currentTime / duration) * 100 : 0}% - 6px)` }} />
                    </div>

                    <div className="flex items-center justify-between gap-2 text-white">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => { const v = videoRef.current; if (!v) return; if (isPlaying) v.pause(); else v.play().catch((err: any) => { const n = err && (err.name || ''); if (n === 'NotAllowedError') setShowTapToPlay(true) }) }}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-md hover:bg-white/90 active:scale-95 transition-all"
                          aria-label={isPlaying ? 'Pause' : 'Play'}
                        >
                          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                        </button>
                        <button onClick={() => { const v = videoRef.current; if (!v) return; const next = Math.max(0, v.currentTime - 10); v.currentTime = next; setCurrentTime(next); broadcastSync('seek', next) }} className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/15 transition-colors" aria-label="Back 10s"><RotateCcw className="h-4 w-4" /></button>
                        <button onClick={() => { const v = videoRef.current; if (!v) return; const next = Math.min(duration, v.currentTime + 10); v.currentTime = next; setCurrentTime(next); broadcastSync('seek', next) }} className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/15 transition-colors" aria-label="Forward 10s"><RotateCw className="h-4 w-4" /></button>
                        <span className="ml-1 font-mono text-xs tabular-nums text-white/90">{formatTime(currentTime)} <span className="text-white/40">/</span> {formatTime(duration)}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {subtitleTrack && (
                          <button
                            onClick={() => setShowSubtitles((s) => !s)}
                            title={showSubtitles ? 'Hide subtitles' : 'Show subtitles'}
                            className={cn('flex h-8 w-8 items-center justify-center rounded-full border transition-colors', showSubtitles ? 'bg-white text-black border-white' : 'bg-white/10 border-white/10 text-white hover:bg-white/15')}
                            aria-label="Subtitles"
                          >
                            <Captions className="h-4 w-4" />
                          </button>
                        )}
                        {/* PTT — pressed state + permission flow preserved */}
                        <button
                          onPointerDown={handlePTTStart}
                          onPointerUp={handlePTTEnd}
                          onPointerLeave={handlePTTEnd}
                          onPointerCancel={handlePTTEnd}
                          title={activeRoom.isLocalMuted ? 'Muted by host — host must unmute you' : talking ? 'Talking… release to stop' : voiceCapturing ? 'Hold to talk' : 'Hold to talk — microphone permission will be requested'}
                          disabled={activeRoom.isLocalMuted}
                          className={cn(
                            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black transition-all active:scale-95 select-none',
                            activeRoom.isLocalMuted
                              ? 'border-white/10 bg-white/5 text-white/40 cursor-not-allowed'
                              : talking || voiceDucked
                                ? 'border-emerald-400/30 bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                                : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
                          )}
                        >
                          {activeRoom.isLocalMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className={cn('h-3.5 w-3.5', talking && 'animate-pulse')} />}
                          <span className="hidden sm:inline">{activeRoom.isLocalMuted ? 'Muted' : talking ? 'Live' : 'Hold to talk'}</span>
                          <span className="sm:hidden">{activeRoom.isLocalMuted ? 'Muted' : talking ? 'Live' : 'Talk'}</span>
                        </button>
                        <button
                          onClick={() => { const v = videoRef.current; if (!v) return; const nextMuted = !isMuted; v.muted = nextMuted; setIsMuted(nextMuted) }}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/15 text-white transition-colors"
                          aria-label={isMuted ? 'Unmute' : 'Mute'}
                        >
                          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => {
                            const el = videoRef.current?.parentElement?.parentElement as any
                            if (!document.fullscreenElement) el?.requestFullscreen?.()
                            else document.exitFullscreen()
                          }}
                          className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/15 text-white transition-colors"
                          aria-label="Fullscreen"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right rail — tabs: Roster / Chat / Queue / Subtitles */}
          <div className="lg:col-span-4 flex flex-col overflow-hidden rounded-[20px] border border-white/10 bg-[#0B0E14] shadow-xl min-h-[460px]">
            {/* Rail tabs */}
            <div className="flex items-center gap-1 border-b border-white/10 bg-white/[0.03] p-2">
              {([
                ['roster', Users, 'Roster'],
                ['chat', MessageCircle, 'Chat'],
                ['queue', ListVideo, 'Queue'],
                ['subtitles', Captions, 'Subs'],
              ] as const).map(([id, Icon, label]) => (
                <button
                  key={id}
                  onClick={() => setRailTab(id)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition-colors',
                    railTab === id ? 'bg-white text-black shadow-sm' : 'text-white/60 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> <span className="hidden xl:inline">{label}</span>
                  {id === 'chat' && chatMessages.length > 0 && (
                    <span className={cn('rounded-full px-1.5 py-0.5 font-mono text-[10px] font-black leading-none', railTab === id ? 'bg-black text-white' : 'bg-white/15 text-white')}>{chatMessages.length}</span>
                  )}
                  {id === 'queue' && queueItems.length > 0 && (
                    <span className={cn('rounded-full px-1.5 py-0.5 font-mono text-[10px] font-black leading-none', railTab === id ? 'bg-black text-white' : 'bg-white/15 text-white')}>{queueItems.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Quick reactions — always visible */}
            <div className="border-b border-white/10 bg-white/[0.02] px-3 py-2.5">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">React</p>
              <div className="flex items-center justify-between gap-1">
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleSendReaction(emoji)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-lg hover:bg-white hover:scale-105 active:scale-95 transition-all"
                    aria-label={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Rail body */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {railTab === 'roster' && (
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black tracking-wide text-white flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-white/60" /> Audience</h3>
                    <span className="rounded-full bg-white/10 border border-white/10 px-2 py-0.5 font-mono text-[11px] font-bold text-white/70">{activeRoom.participantCount || 1} peer(s)</span>
                  </div>
                  {/* Self */}
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black font-black text-xs">{identity?.name?.slice(0, 1) || 'Y'}</div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-white flex items-center gap-1">{identity?.name || 'You'} <span className="text-white/40 font-normal">(you)</span> {activeRoom.playbackPeerId && identity?.id === activeRoom.playbackPeerId && <Crown className="h-3 w-3 text-amber-300" />}</p>
                        <p className="text-[11px] text-white/50 truncate">{activeRoom.isHost ? 'Host · controls playback' : activeRoom.playbackPeerId === identity?.id ? 'Controls playback' : 'Viewer'}</p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">In Sync</span>
                  </div>
                  {/* Participants */}
                  <div className="space-y-2">
                    {activeRoom.participants?.length ? activeRoom.participants.map((p: RoomParticipant) => {
                      const isMaster = activeRoom.playbackPeerId === p.id
                      const isHostPeer = activeRoom.hostPeerId === p.id
                      const diff = typeof p.positionSec === 'number' ? currentTime - p.positionSec : null
                      const status = p.buffering
                        ? { label: 'Buffering', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/20' }
                        : diff == null || Math.abs(diff) < 0.8
                          ? { label: 'Synced', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' }
                          : { label: `${Math.abs(diff) < 60 ? `${Math.abs(diff).toFixed(1)}s` : formatTime(Math.abs(diff))} ${diff! > 0 ? 'behind' : 'ahead'}`, cls: 'bg-amber-500/15 text-amber-300 border-amber-500/20' }
                      return (
                        <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/10 text-white font-bold text-xs">{p.name.slice(0, 1)}</div>
                              <div className="min-w-0">
                                <p className="flex items-center gap-1 truncate text-xs font-bold text-white">{p.name}
                                  {isHostPeer && <span className="rounded bg-white px-1 py-0.5 text-[9px] font-black leading-none text-black">HOST</span>}
                                  {isMaster && !isHostPeer && <Crown className="h-3 w-3 text-amber-300" />}
                                  {p.isMuted && <MicOff className="h-3 w-3 text-white/40" />}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none', status.cls)}>{status.label}</span>
                                  {relayedPeerIds.has(p.id) && <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-white/40">relayed</span>}
                                </div>
                              </div>
                            </div>
                            {activeRoom.isHost && !isHostPeer && (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <button onClick={() => handleModerate(p.isMuted ? 'unmute' : 'mute', p.id, p.name)} title={p.isMuted ? 'Unmute' : 'Mute'} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-white/60 hover:bg-white hover:text-black transition-colors">{p.isMuted ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}</button>
                                <button onClick={() => handleModerate('promote', p.id, p.name)} disabled={isMaster} title="Give playback control" className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-white/60 hover:bg-white hover:text-black disabled:opacity-30 transition-colors"><Crown className="h-3.5 w-3.5" /></button>
                                <button onClick={() => handleModerate('kick', p.id, p.name)} title="Remove" className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-white/60 hover:bg-red-500 hover:text-white transition-colors"><UserX className="h-3.5 w-3.5" /></button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    }) : <p className="py-6 text-center text-xs text-white/40">No other peers yet — share your room code.</p>}
                  </div>
                </div>
              )}

              {railTab === 'chat' && (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {chatMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                        <MessageCircle className="h-8 w-8 text-white/20" />
                        <p className="text-xs font-bold text-white/60">No messages yet</p>
                        <p className="max-w-[24ch] text-xs text-white/35">Say hi to the party — chat is kept for late joiners too.</p>
                      </div>
                    ) : (
                      chatMessages.map((m) => {
                        const isMe = m.sender?.id === identity?.id
                        return (
                          <div key={m.messageId} className={cn('flex flex-col gap-1 rounded-2xl px-3 py-2 max-w-[85%]', isMe ? 'self-end bg-white text-black ml-auto' : 'bg-white/10 border border-white/10 text-white')}>
                            <span className={cn('text-[11px] font-black', isMe ? 'text-black/60' : 'text-white/60')}>{isMe ? 'You' : m.sender?.name || 'Peer'} <span className="font-normal">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
                            <span className="text-sm leading-relaxed break-words">{m.text}</span>
                          </div>
                        )
                      })
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="border-t border-white/10 bg-white/[0.03] p-2 flex gap-2">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat() } }}
                      placeholder="Message the party…"
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 focus:bg-white/10"
                    />
                    <button
                      onClick={handleSendChat}
                      disabled={!chatInput.trim()}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-black hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Send"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {railTab === 'queue' && (
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black tracking-wide text-white flex items-center gap-1.5"><ListVideo className="h-3.5 w-3.5 text-white/60" /> Up Next</h3>
                    {activeRoom.isHost && (
                      <button onClick={handleAddToQueue} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-black text-black hover:bg-white/90 transition-colors"><Plus className="h-3 w-3" /> Add</button>
                    )}
                  </div>
                  {queueItems.length > 0 ? (
                    <div className="space-y-2">
                      {queueItems.map((q, i) => (
                        <div key={`${q.title}-${i}`} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5">
                          <span className="min-w-0 truncate text-sm font-medium text-white" title={q.title}>{q.title}</span>
                          {activeRoom.isHost && (
                            <button onClick={() => handleRemoveFromQueue(i)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/50 hover:bg-red-500 hover:text-white transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <ListVideo className="h-8 w-8 text-white/20" />
                      <p className="text-xs font-bold text-white/60">Nothing queued</p>
                      <p className="max-w-[24ch] text-xs text-white/35">The host can add the next video — it stages as a new epoch when it plays.</p>
                    </div>
                  )}
                  {/* Host rewind control lives here too so queue visitors see it */}
                  {activeRoom.isHost && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">Guest rewind limit</p>
                      <select
                        value={activeRoom.rewindWindowSec || 0}
                        onChange={(e) => handleSetRewind(Number(e.target.value))}
                        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm font-medium text-white focus:outline-none focus:border-white/20"
                      >
                        <option value={0} className="bg-[#0B0E14]">Unlimited</option>
                        <option value={30} className="bg-[#0B0E14]">30 seconds</option>
                        <option value={120} className="bg-[#0B0E14]">2 minutes</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {railTab === 'subtitles' && (
                <div className="flex flex-1 flex-col gap-3 p-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black tracking-wide text-white flex items-center gap-1.5"><Captions className="h-3.5 w-3.5 text-white/60" /> Subtitles</h3>
                      {subtitleTrack && (
                        <button
                          onClick={() => setShowSubtitles((s) => !s)}
                          className={cn('rounded-full px-2.5 py-1 text-xs font-bold border transition-colors', showSubtitles ? 'bg-white text-black border-white' : 'bg-white/10 text-white/60 border-white/10 hover:bg-white/15')}
                        >
                          {showSubtitles ? 'Showing' : 'Hidden'}
                        </button>
                      )}
                    </div>
                    {subtitleTrack ? (
                      <p className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs font-medium text-white/80 truncate" title={subtitleTrack.name}>{subtitleTrack.name}</p>
                    ) : (
                      <p className="text-xs text-white/40">No sidecar attached — the host can attach an .srt or .vtt and it rides with the media offer.</p>
                    )}
                    {activeRoom.isHost ? (
                      <button onClick={handlePickSubtitle} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-black hover:bg-white/90 transition-colors">
                        <Captions className="h-4 w-4" /> {subtitleTrack ? 'Replace subtitles' : 'Attach .srt / .vtt'}
                      </button>
                    ) : (
                      <p className="text-xs text-white/30">Only the host can change the subtitle track.</p>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={showSubtitles} onChange={(e) => setShowSubtitles(e.target.checked)} className="h-4 w-4 rounded accent-white" />
                      <span className="text-xs font-medium text-white/70">Show subtitles on video</span>
                    </label>
                  </div>
                  <p className="px-1 text-[11px] leading-relaxed text-white/30">Sidecar is Blob-URL backed — revoking the previous object URL on each refresh. No protocol changes.</p>
                </div>
              )}
            </div>

            {/* Rail footer — subtle heartbeat note */}
            <div className="border-t border-white/10 bg-white/[0.02] px-3 py-2 flex items-center justify-between text-[11px] text-white/30">
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80 animate-pulse" /> 5s heartbeat</span>
              <span className="font-mono">{activeRoom.roomCode}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
