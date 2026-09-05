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
  Maximize,
  Minimize,
  Radio,
  Users,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  LogOut,
  Upload,
  Shield,
  Clock,
  Heart,
  Smile,
  Flame,
  Zap,
  MessageCircle,
  Mic,
  MicOff,
  UserX,
  Crown,
  Lock,
  ListVideo,
  Captions,
  FastForward,
  Send,
  Trash2,
  Plus,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/hooks/useToast'
import { useDevices } from '@/hooks/useDevices'
import { call, on } from '@/lib/ipc'
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

export function WatchParty() {
  const { toast } = useToast()
  const { identity, devices } = useDevices()

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

  // Chat / roster panel
  const [sidebarTab, setSidebarTab] = useState<'party' | 'chat'>('party')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

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

  // Subtitles
  const [subtitleTrack, setSubtitleTrack] = useState<{ name: string; url: string } | null>(null)
  const [showSubtitles, setShowSubtitles] = useState(true)

  // Voice (push-to-talk)
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
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const sidebarTabRef = useRef(sidebarTab)
  sidebarTabRef.current = sidebarTab
  const scheduledReactionsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Fetch initial state & discover rooms
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_PARTY_KEY)
      if (saved) setLastPartyCode(JSON.parse(saved)?.roomCode || '')
    } catch {}

    call(METHODS.WATCH_PARTY_GET_ROOM).then((room: any) => {
      if (room) setActiveRoom(room)
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
      }),
      on(EVENTS.WATCH_ROOM_JOINED, (room: any) => {
        setActiveRoom(room)
        setStreamUrl('')
        setIsPlaying(false)
      }),
      on(EVENTS.WATCH_ROOM_UPDATED, (room: any) => {
        // Fresh snapshot after a guest's media offer arrives (host identity,
        // real media title / controlsMode) — but also on throttled roster ticks.
        // Only replace state on material changes so the [activeRoom] effect
        // (stream URL re-resolution) does not churn every few hundred ms.
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
        setChatMessages([])
        setQueueItems([])
        setSubtitleTrack(null)
        setHostPosition(null)
        localStorage.removeItem(LAST_PARTY_KEY)
        setLastPartyCode('')
      }),
      on(EVENTS.WATCH_ROOM_CLOSED, (evt: any) => {
        setActiveRoom(null)
        setStreamUrl('')
        setIsPlaying(false)
        setLoading(false)
        setChatMessages([])
        setQueueItems([])
        setSubtitleTrack(null)
        setHostPosition(null)
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
      on(EVENTS.WATCH_CHAT_MESSAGE, (msg: any) => {
        if (!msg?.text) return
        setChatMessages((prev) => [...prev.slice(-199), msg])
        if (sidebarTabRef.current !== 'chat') setUnreadCount((c) => c + 1)
      }),
      on(EVENTS.WATCH_CHAT_HISTORY, (payload: any) => {
        if (Array.isArray(payload?.messages)) setChatMessages(payload.messages.slice(-200))
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
    ]

    return () => {
      unsubs.forEach((u) => u?.())
    }
  }, [])

  // Resolve WebDAV Stream URL whenever activeRoom changes
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

    // Guest: media for the room's deterministic id may still be transferring.
    // The engine only reports a URL once the source is actually resolvable,
    // and a version bump forces the player to reload when media arrives.
    // Epoch > 1 (queue advance) derives a fresh shareId per media item.
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
            // Not resolvable yet (transfer still staging / no .part). Poll at
            // a low rate as a safety net in case a media-ready event is missed.
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

  // Universal playback engine: mpegts.js (MSE) for TS/MPEG-TS/FLV, hls.js for
  // m3u8, and the native <video> element otherwise. Chromium cannot demux
  // MPEG-TS/FLV natively — feeding the raw stream URL to <video> throws
  // "element has no supported sources" (the exact failure when hosting a .ts).
  //
  // Deps are streamUrl ONLY: activeRoom gets a new object on every
  // materially-changed room:updated (a guest joining/leaving, roster ticks),
  // and rebuilding the player on those tore playback down and reset the host
  // video to 0:00 on every join. The media filename reads via ref — it only
  // changes when the media (and therefore streamUrl) changes.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamUrl) return

    // Derive the container from the room's media filename/path when present.
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

  // Remote Sync Handler
  const handleRemotePlaybackState = useCallback((state: any) => {
    const video = videoRef.current
    if (!video) return

    if (state.action === 'play') {
      if (typeof state.positionSec === 'number' && Math.abs(video.currentTime - state.positionSec) > 1.5) {
        video.currentTime = state.positionSec
      }
      video.play().catch(() => {})
      setIsPlaying(true)
    } else if (state.action === 'pause') {
      if (typeof state.positionSec === 'number' && Math.abs(video.currentTime - state.positionSec) > 1.5) {
        video.currentTime = state.positionSec
      }
      video.pause()
      setIsPlaying(false)
    } else if (state.action === 'seek') {
      if (typeof state.positionSec === 'number') {
        video.currentTime = state.positionSec
        setCurrentTime(state.positionSec)
      }
    }
  }, [])

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

  // Continuous-position heartbeat: sync otherwise fires ONLY on user actions
  // (play/pause/seek), so a guest that joins mid-playback never learns the
  // host position (its player starts at 0 and drifts). A light 5s re-broadcast
  // while playing keeps room.hostPositionSec fresh for join snapshots and
  // lets guests auto-correct drift.
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
    console.log('[WatchParty] triggerReactionAnimation:', emoji)
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
      const res = await window.bridge.openFileDialog()
      if (res && res.filePath) {
        setSelectedFile({
          path: res.filePath,
          name: res.filename || res.filePath.split(/[\\/]/).pop() || 'Video',
          size: res.fileSize || 0
        })
        if (!roomTitleInput) {
          setRoomTitleInput(res.filename?.replace(/\.[^/.]+$/, '') || 'Watch Party')
        }
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
  }

  const handleCopyCode = () => {
    if (!activeRoom?.roomCode) return
    navigator.clipboard.writeText(activeRoom.roomCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
    toast.success('Copied', `Room code ${activeRoom.roomCode} copied to clipboard!`)
  }

  // ─── Chat ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (sidebarTab === 'chat') {
      setUnreadCount(0)
      chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight })
    }
  }, [sidebarTab, chatMessages])

  const handleSendChat = () => {
    const text = chatDraft.trim()
    if (!text) return
    setChatDraft('')
    call(METHODS.WATCH_PARTY_CHAT, { text }).catch(() => {})
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
      const res = await window.bridge.openFileDialog()
      if (!res?.filePath) return
      const room = (await call(METHODS.WATCH_PARTY_QUEUE_ADD, {
        filePath: res.filePath,
        title: res.filename?.replace(/\.[^/.]+$/, '')
      })) as any
      if (Array.isArray(room?.queue)) setQueueItems(room.queue)
      toast.success('Queued', `${res.filename || 'File'} added to the party queue.`)
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

  // ─── Subtitles ───────────────────────────────────────────────────────────

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

  // Fetch the sidecar when the room joins or the media epoch changes.
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
      const res = await window.bridge.openFileDialog()
      if (!res?.filePath) return
      await call(METHODS.WATCH_PARTY_SUBTITLE_SET, { subtitlePath: res.filePath })
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

  // Release the mic when leaving the page or the room.
  useEffect(() => {
    return () => {
      voiceRef.current?.destroy()
      voiceRef.current = null
    }
  }, [activeRoom?.roomCode])

  // Voice ducking: lower the movie while someone is talking.
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
    console.log(
      '[WatchParty] reaction received:', reaction?.emoji,
      'pos:', pos, 'local:', currentTimeRef.current, 'playing:', isPlayingRef.current
    )
    if (pos == null) {
      triggerReactionAnimation(reaction.emoji)
      return
    }
    const local = currentTimeRef.current
    if (Math.abs(local - pos) < 2 || pos < local) {
      triggerReactionAnimation(reaction.emoji)
      return
    }
    // The "pop when playback reaches the moment" schedule is wall-clock and
    // assumes continuous 1x playback: a PAUSED player never reaches it, and a
    // distant moment pops long after the user stopped looking. Only defer for
    // a near miss; anything else pops now.
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

  return (
    <div className='flex h-full flex-col gap-6'>
      {/* Top Header */}
      <div className='flex items-center justify-between border-b border-border/40 pb-4'>
        <div className='flex items-center gap-3'>
          <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/25 text-primary shadow-sm'>
            <Tv className='h-5 w-5' />
          </div>
          <div>
            <h1 className='text-xl font-bold tracking-tight text-foreground flex items-center gap-2'>
              Mesh Party
              <span className='rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20'>
                Live Theater
              </span>
            </h1>
            <p className='text-xs text-muted-foreground'>
              Watch synchronized videos with peer devices across local LAN and encrypted mesh channels.
            </p>
          </div>
        </div>

        {activeRoom && (
          <div className='flex items-center gap-2'>
            <button
              onClick={handleCopyCode}
              className='flex items-center gap-2 rounded-lg bg-card/80 border border-border/60 px-3 py-1.5 text-xs font-mono font-medium text-foreground hover:bg-card transition-colors'
            >
              <Radio className='h-3.5 w-3.5 text-primary animate-pulse' />
              {activeRoom.isPrivate && <Lock className='h-3 w-3 text-amber-400' />}
              {activeRoom.roomCode}
              {copiedCode ? <Check className='h-3.5 w-3.5 text-emerald-400' /> : <Copy className='h-3.5 w-3.5 text-muted-foreground' />}
            </button>

            <button
              onClick={handleLeaveRoom}
              className='flex items-center gap-1.5 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors'
            >
              <LogOut className='h-3.5 w-3.5' />
              Leave
            </button>
          </div>
        )}
      </div>

      {/* Main Content: Lobby or Theater */}
      {!activeRoom ? (
        <div className='grid grid-cols-1 lg:grid-cols-12 gap-6'>
          {/* Host a Party Card */}
          <div className='lg:col-span-7 flex flex-col gap-4 rounded-2xl bg-card border border-border/60 p-6 shadow-sm'>
            <div className='flex items-center gap-2 text-foreground font-semibold text-base'>
              <Sparkles className='h-5 w-5 text-primary' />
              Host a Watch Party
            </div>
            <p className='text-xs text-muted-foreground leading-relaxed'>
              Select a video from your computer to stream progressively to connected mesh peers with synchronized playback.
            </p>

            {/* File Picker */}
            <div
              onClick={handlePickFile}
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all',
                selectedFile
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border/60 hover:border-primary/40 hover:bg-card/60'
              )}
            >
              <div className='flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary'>
                <Film className='h-6 w-6' />
              </div>
              {selectedFile ? (
                <div className='text-center'>
                  <p className='text-sm font-semibold text-foreground'>{selectedFile.name}</p>
                  <p className='text-xs text-muted-foreground mt-0.5'>{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · Ready to Stream</p>
                </div>
              ) : (
                <div className='text-center'>
                  <p className='text-sm font-medium text-foreground'>Click to select a video file</p>
                  <p className='text-xs text-muted-foreground mt-0.5'>Supports MP4, MKV, WebM, TS, MOV</p>
                </div>
              )}
            </div>

            {/* Options */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2'>
              <div>
                <label className='text-xs font-semibold text-muted-foreground mb-1.5 block'>Party Room Title</label>
                <input
                  type='text'
                  value={roomTitleInput}
                  onChange={(e) => setRoomTitleInput(e.target.value)}
                  placeholder='e.g. Friday Movie Night'
                  className='w-full rounded-lg bg-background border border-border/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary'
                />
              </div>

              <div>
                <label className='text-xs font-semibold text-muted-foreground mb-1.5 block'>Playback Control Mode</label>
                <select
                  value={controlsMode}
                  onChange={(e: any) => setControlsMode(e.target.value)}
                  className='w-full rounded-lg bg-background border border-border/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary'
                >
                  <option value='host'>Host Only (You control play/pause/seek)</option>
                  <option value='open'>Collaborative (Any peer can control)</option>
                </select>
              </div>
            </div>

            <label className='flex items-center gap-2 mt-1 cursor-pointer select-none w-fit'>
              <input
                type='checkbox'
                checked={isPrivateRoom}
                onChange={(e) => setIsPrivateRoom(e.target.checked)}
                className='h-4 w-4 accent-[hsl(var(--primary))]'
              />
              <span className='text-xs text-muted-foreground flex items-center gap-1'>
                <Lock className='h-3 w-3' />
                Private room — join by code only, hidden from discovery
              </span>
            </label>

            <button
              disabled={!selectedFile || loading}
              onClick={handleCreateRoom}
              className='mt-3 flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50 transition-all text-sm'
            >
              <Tv className='h-4 w-4' />
              {loading ? 'Starting Party...' : 'Launch Watch Party'}
            </button>
          </div>

          {/* Join Party & Discovered Rooms */}
          <div className='lg:col-span-5 flex flex-col gap-6'>
            {/* Join with Code Card */}
            <div className='flex flex-col gap-3.5 rounded-2xl bg-card border border-border/60 p-6 shadow-sm'>
              <div className='flex items-center gap-2 text-foreground font-semibold text-base'>
                <Radio className='h-5 w-5 text-indigo-400' />
                Join with Room Code
              </div>
              <p className='text-xs text-muted-foreground'>
                Enter a 6 to 8 character room code shared by your mesh host.
              </p>

              <div className='flex gap-2 mt-1'>
                <input
                  type='text'
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  placeholder='PARTY-XXXX'
                  className='flex-1 font-mono uppercase rounded-lg bg-background border border-border/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary'
                />
                <button
                  disabled={!roomCodeInput.trim() || loading}
                  onClick={() => handleJoinRoom()}
                  className='flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all'
                >
                  Join
                  <ArrowRight className='h-4 w-4' />
                </button>
              </div>

              {lastPartyCode && (
                <button
                  disabled={loading}
                  onClick={() => handleJoinRoom(lastPartyCode)}
                  className='flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50 transition-all'
                >
                  <Clock className='h-3.5 w-3.5' />
                  Rejoin last party ({lastPartyCode})
                </button>
              )}
            </div>

            {/* Discovered Swarm Rooms */}
            <div className='flex flex-col gap-3 rounded-2xl bg-card border border-border/60 p-6 shadow-sm flex-1'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2 text-foreground font-semibold text-sm'>
                  <Users className='h-4 w-4 text-emerald-400' />
                  Discovered Swarm Parties
                </div>
                <span className='text-xs text-muted-foreground'>{discoveredRooms.length} online</span>
              </div>

              {discoveredRooms.length > 0 ? (
                <div className='flex flex-col gap-2 mt-1'>
                  {discoveredRooms.map((room) => (
                    <div
                      key={room.roomCode}
                      className='flex items-center justify-between p-3 rounded-xl bg-background/60 border border-border/40 hover:border-primary/40 transition-colors'
                    >
                      <div className='flex flex-col gap-0.5'>
                        <span className='text-sm font-semibold text-foreground'>{room.title}</span>
                        <span className='text-xs text-muted-foreground font-mono'>
                          Host: {room.hostName} · {room.roomCode}
                        </span>
                      </div>
                      <button
                        onClick={() => handleJoinRoom(room.roomCode)}
                        className='flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-all'
                      >
                        Join Party
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='flex flex-col items-center justify-center p-6 text-center text-muted-foreground gap-2 flex-1'>
                  <Film className='h-8 w-8 text-muted-foreground/40' />
                  <p className='text-xs'>No active parties discovered on paired peers yet. Start one on the left!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Theater Mode */
        <div className='grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-[500px]'>
          {/* Main Video Viewport */}
          <div
            className='lg:col-span-8 relative flex flex-col justify-center items-center rounded-2xl bg-black border border-border/60 overflow-hidden shadow-2xl group min-h-[420px]'
            onMouseMove={handleMouseMove}
          >
            {/* HTML5 Video Surface — src/engine attached by the universal
                engine effect above (mpegts.js for TS/FLV, hls.js, or native) */}
            {streamUrl ? (
              <video
                ref={videoRef}
                className='w-full h-full object-contain'
                autoPlay
                playsInline
                crossOrigin='anonymous'
                onError={() => {
                  // Native <video> failed to load the source (e.g. a container
                  // Chromium cannot demux and no MSE engine is available).
                  console.warn('[WatchParty] native video error on', streamUrl)
                }}
                onTimeUpdate={() => {
                  if (videoRef.current) {
                    currentTimeRef.current = videoRef.current.currentTime
                    setCurrentTime(videoRef.current.currentTime)
                  }
                }}
                onEnded={handleMediaEnded}
                onDurationChange={() => {
                  if (videoRef.current) setDuration(videoRef.current.duration)
                }}
                onPlay={() => {
                  setIsPlaying(true)
                  if (activeRoom.isHost || activeRoom.controlsMode === 'open') {
                    broadcastSync('play', videoRef.current?.currentTime || 0)
                  }
                }}
                onPause={() => {
                  setIsPlaying(false)
                  if (activeRoom.isHost || activeRoom.controlsMode === 'open') {
                    broadcastSync('pause', videoRef.current?.currentTime || 0)
                  }
                }}
              >
                {subtitleTrack && (
                  <track
                    key={subtitleTrack.url}
                    kind='subtitles'
                    label={subtitleTrack.name}
                    srcLang='en'
                    src={subtitleTrack.url}
                    default
                  />
                )}
              </video>
            ) : (
              <div className='flex flex-col items-center justify-center gap-3 p-8 text-center'>
                <Tv className='h-12 w-12 text-primary animate-pulse' />
                <p className='text-sm font-semibold text-foreground'>Connecting to Mesh Stream...</p>
                <p className='text-xs text-muted-foreground'>Prefetching video blocks across peer channels</p>
              </div>
            )}

            {/* Catch-up button (guest drifting behind/ahead of the host) */}
            {!activeRoom.isHost && hostPosition != null && Math.abs(hostPosition - currentTime) > 5 && (
              <button
                onClick={handleJumpToHost}
                className='absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-primary/90 border border-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg hover:bg-primary transition-colors z-10'
              >
                <FastForward className='h-3.5 w-3.5' />
                Jump to host ({formatTime(Math.abs(hostPosition - currentTime))} {hostPosition > currentTime ? 'behind' : 'ahead'})
              </button>
            )}

            {/* Floating Emoji Reactions Overlay */}
            <div className='absolute inset-0 pointer-events-none overflow-hidden'>
              <AnimatePresence>
                {floatingReactions.map((r) => (
                  <motion.div
                    key={r.id}
                    style={{ left: `${r.x}%` }}
                    initial={{ opacity: 1, y: 40, scale: 0.8 }}
                    animate={{ opacity: 0, y: -240, scale: 1.8 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2, ease: 'easeOut' }}
                    className='absolute bottom-2 text-4xl select-none'
                  >
                    {r.emoji}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Custom Controls Bar Overlay */}
            <AnimatePresence>
              {showControls && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className='absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-2.5'
                >
                  {/* Scrubber Progress Bar */}
                  <div
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      const pos = (e.clientX - rect.left) / rect.width
                      const targetSec = pos * duration
                      if (videoRef.current) {
                        videoRef.current.currentTime = targetSec
                        setCurrentTime(targetSec)
                        if (activeRoom.isHost || activeRoom.controlsMode === 'open') {
                          broadcastSync('seek', targetSec)
                        }
                      }
                    }}
                    className='h-2 w-full bg-white/20 hover:h-3 rounded-full cursor-pointer transition-all relative overflow-hidden'
                  >
                    <div
                      className='h-full bg-primary rounded-full transition-all'
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>

                  {/* Buttons Row */}
                  <div className='flex items-center justify-between text-white'>
                    <div className='flex items-center gap-3'>
                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            if (isPlaying) videoRef.current.pause()
                            else videoRef.current.play()
                          }
                        }}
                        className='flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:scale-105 transition-transform'
                      >
                        {isPlaying ? <Pause className='h-4 w-4' /> : <Play className='h-4 w-4 ml-0.5' />}
                      </button>

                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            const next = Math.max(0, videoRef.current.currentTime - 10)
                            videoRef.current.currentTime = next
                            setCurrentTime(next)
                            broadcastSync('seek', next)
                          }
                        }}
                        className='p-1.5 hover:text-primary transition-colors'
                      >
                        <RotateCcw className='h-4 w-4' />
                      </button>

                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            const next = Math.min(duration, videoRef.current.currentTime + 10)
                            videoRef.current.currentTime = next
                            setCurrentTime(next)
                            broadcastSync('seek', next)
                          }
                        }}
                        className='p-1.5 hover:text-primary transition-colors'
                      >
                        <RotateCw className='h-4 w-4' />
                      </button>

                      <span className='text-xs font-mono text-white/80'>
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                    </div>

                    <div className='flex items-center gap-3'>
                      {subtitleTrack && (
                        <button
                          onClick={() => setShowSubtitles((s) => !s)}
                          title={showSubtitles ? 'Hide subtitles' : 'Show subtitles'}
                          className={cn('p-1.5 rounded-md transition-colors', showSubtitles ? 'text-primary bg-primary/20' : 'hover:text-primary')}
                        >
                          <Captions className='h-4 w-4' />
                        </button>
                      )}

                      <button
                        onPointerDown={handlePTTStart}
                        onPointerUp={handlePTTEnd}
                        onPointerLeave={handlePTTEnd}
                        title={activeRoom.isLocalMuted ? 'Muted by host' : talking ? 'Talking...' : 'Hold to talk'}
                        disabled={activeRoom.isLocalMuted}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-colors disabled:opacity-40',
                          talking ? 'bg-primary text-primary-foreground' : 'bg-white/10 hover:bg-white/20'
                        )}
                      >
                        {activeRoom.isLocalMuted ? <MicOff className='h-4 w-4' /> : <Mic className={cn('h-4 w-4', talking && 'animate-pulse')} />}
                        <span className='text-[10px] font-semibold hidden xl:inline'>
                          {activeRoom.isLocalMuted ? 'Muted' : talking ? 'Live' : 'Talk'}
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.muted = !isMuted
                            setIsMuted(!isMuted)
                          }
                        }}
                        className='p-1.5 hover:text-primary transition-colors'
                      >
                        {isMuted ? <VolumeX className='h-4 w-4' /> : <Volume2 className='h-4 w-4' />}
                      </button>

                      <button
                        onClick={() => {
                          if (!document.fullscreenElement) {
                            videoRef.current?.parentElement?.requestFullscreen()
                          } else {
                            document.exitFullscreen()
                          }
                        }}
                        className='p-1.5 hover:text-primary transition-colors'
                      >
                        <Maximize className='h-4 w-4' />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Sidebar: Party / Chat tabs */}
          <div className='lg:col-span-4 flex flex-col rounded-2xl bg-card border border-border/60 p-5 shadow-sm min-h-[420px]'>
            {/* Tabs */}
            <div className='flex items-center gap-1 p-1 rounded-xl bg-background/60 border border-border/40 mb-3'>
              <button
                onClick={() => setSidebarTab('party')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors',
                  sidebarTab === 'party' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Users className='h-3.5 w-3.5' />
                Party
              </button>
              <button
                onClick={() => setSidebarTab('chat')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors relative',
                  sidebarTab === 'chat' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <MessageCircle className='h-3.5 w-3.5' />
                Chat
                {unreadCount > 0 && sidebarTab !== 'chat' && (
                  <span className='absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground px-1'>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </div>

            {sidebarTab === 'party' ? (
              <div className='flex flex-col gap-4 flex-1 overflow-y-auto'>
                {/* Room Info */}
                <div className='flex items-center justify-between border-b border-border/40 pb-3'>
                  <div>
                    <h3 className='font-bold text-sm text-foreground flex items-center gap-1.5'>
                      {activeRoom.title}
                      {activeRoom.isPrivate && <Lock className='h-3 w-3 text-amber-400' />}
                    </h3>
                    <p className='text-xs text-muted-foreground font-mono mt-0.5'>
                      {activeRoom.isHost ? '👑 Host' : `Hosted by ${activeRoom.hostName || 'the host'}`}
                    </p>
                  </div>
                  <div className='flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20'>
                    <span className='h-2 w-2 rounded-full bg-emerald-400 animate-pulse' />
                    Live Swarm
                  </div>
                </div>

                {/* Host controls: rewind window + subtitles */}
                {activeRoom.isHost && (
                  <div className='grid grid-cols-2 gap-2'>
                    <div>
                      <label className='text-[10px] font-semibold text-muted-foreground mb-1 block'>Guest rewind limit</label>
                      <select
                        value={activeRoom.rewindWindowSec || 0}
                        onChange={(e) => handleSetRewind(Number(e.target.value))}
                        className='w-full rounded-lg bg-background border border-border/60 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary'
                      >
                        <option value={0}>Unlimited</option>
                        <option value={30}>30 seconds</option>
                        <option value={120}>2 minutes</option>
                      </select>
                    </div>
                    <div>
                      <label className='text-[10px] font-semibold text-muted-foreground mb-1 block'>
                        Subtitles {activeRoom.subtitleName ? `· ${activeRoom.subtitleName}` : ''}
                      </label>
                      <button
                        onClick={handlePickSubtitle}
                        className='w-full flex items-center justify-center gap-1.5 rounded-lg bg-background border border-border/60 px-2 py-1.5 text-xs font-semibold text-foreground hover:border-primary/50 transition-colors'
                      >
                        <Captions className='h-3.5 w-3.5' />
                        {activeRoom.subtitleName ? 'Replace' : 'Attach .srt/.vtt'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Queue */}
                <div className='flex flex-col gap-2'>
                  <div className='flex items-center justify-between'>
                    <label className='text-xs font-semibold text-muted-foreground flex items-center gap-1.5'>
                      <ListVideo className='h-3.5 w-3.5' />
                      Up Next
                    </label>
                    {activeRoom.isHost && (
                      <button
                        onClick={handleAddToQueue}
                        className='flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors'
                      >
                        <Plus className='h-3 w-3' />
                        Add to queue
                      </button>
                    )}
                  </div>
                  {queueItems.length > 0 ? (
                    <div className='flex flex-col gap-1.5'>
                      {queueItems.map((q, i) => (
                        <div key={`${q.title}-${i}`} className='flex items-center justify-between p-2 rounded-lg bg-background/50 border border-border/30'>
                          <span className='text-xs text-foreground truncate flex-1'>{q.title}</span>
                          {activeRoom.isHost && (
                            <button onClick={() => handleRemoveFromQueue(i)} className='p-1 text-muted-foreground hover:text-destructive transition-colors'>
                              <Trash2 className='h-3 w-3' />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className='text-[10px] text-muted-foreground'>Nothing queued — the party replays whatever the host adds.</p>
                  )}
                </div>

                {/* Reactions Bar */}
                <div className='flex flex-col gap-2'>
                  <label className='text-xs font-semibold text-muted-foreground'>Quick Reactions</label>
                  <div className='flex items-center justify-between gap-1 p-2 rounded-xl bg-background/60 border border-border/40'>
                    {REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleSendReaction(emoji)}
                        className='text-xl hover:scale-125 active:scale-95 transition-transform p-1'
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Audience Roster with live sync status */}
                <div className='flex flex-col gap-2 flex-1'>
                  <label className='text-xs font-semibold text-muted-foreground flex items-center justify-between'>
                    <span>Audience Roster</span>
                    <span className='text-primary font-mono'>{activeRoom.participantCount || 1} peer(s)</span>
                  </label>

                  <div className='flex flex-col gap-2'>
                    {/* Self */}
                    <div className='flex items-center justify-between p-2.5 rounded-lg bg-background/50 border border-border/30'>
                      <div className='flex items-center gap-2'>
                        <div className='h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs'>
                          {identity?.name?.slice(0, 1) || 'Y'}
                        </div>
                        <div className='flex flex-col'>
                          <span className='text-xs font-medium text-foreground flex items-center gap-1'>
                            {identity?.name || 'You'} (You)
                            {activeRoom.playbackPeerId && identity?.id === activeRoom.playbackPeerId && <Crown className='h-3 w-3 text-amber-400' />}
                          </span>
                          <span className='text-[10px] text-muted-foreground'>
                            {activeRoom.isHost ? 'Host' : activeRoom.playbackPeerId === identity?.id ? 'Controls playback' : 'Viewer'}
                          </span>
                        </div>
                      </div>
                      <span className='text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full'>
                        🟢 In Sync
                      </span>
                    </div>

                    {/* Other participants */}
                    {activeRoom.participants?.map((p: RoomParticipant) => {
                      const isMaster = activeRoom.playbackPeerId === p.id
                      const isHostPeer = activeRoom.hostPeerId === p.id
                      const diff = typeof p.positionSec === 'number' ? currentTime - p.positionSec : null
                      const status = p.buffering
                        ? { label: '🟡 Buffering', cls: 'text-sky-400 bg-sky-500/10' }
                        : diff == null || Math.abs(diff) < 0.8
                          ? { label: '🟢 Synced', cls: 'text-emerald-400 bg-emerald-500/10' }
                          : {
                              label: `🟠 ${Math.abs(diff) < 60 ? `${Math.abs(diff).toFixed(1)}s` : formatTime(Math.abs(diff))} ${diff > 0 ? 'behind' : 'ahead'}`,
                              cls: 'text-amber-400 bg-amber-500/10'
                            }
                      return (
                        <div key={p.id} className='p-2.5 rounded-lg bg-background/50 border border-border/30'>
                          <div className='flex items-center justify-between'>
                            <div className='flex items-center gap-2'>
                              <div className='h-7 w-7 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold text-xs'>
                                {p.name.slice(0, 1)}
                              </div>
                              <div className='flex flex-col'>
                                <span className='text-xs font-medium text-foreground flex items-center gap-1'>
                                  {p.name}
                                  {isHostPeer && <span className='text-[9px] font-bold text-primary bg-primary/15 px-1 rounded'>HOST</span>}
                                  {isMaster && !isHostPeer && <Crown className='h-3 w-3 text-amber-400' />}
                                  {p.isMuted && <MicOff className='h-3 w-3 text-muted-foreground' />}
                                </span>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit mt-0.5', status.cls)}>
                        {status.label}
                      </span>
                      {relayedPeerIds.has(p.id) && (
                        <span className='text-[9px] font-bold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-full mt-0.5 w-fit'>
                          relayed
                        </span>
                      )}
                              </div>
                            </div>
                            {activeRoom.isHost && !isHostPeer && (
                              <div className='flex items-center gap-1'>
                                <button
                                  onClick={() => handleModerate(p.isMuted ? 'unmute' : 'mute', p.id, p.name)}
                                  title={p.isMuted ? 'Unmute voice' : 'Mute voice'}
                                  className='p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors'
                                >
                                  {p.isMuted ? <Mic className='h-3.5 w-3.5' /> : <MicOff className='h-3.5 w-3.5' />}
                                </button>
                                <button
                                  onClick={() => handleModerate('promote', p.id, p.name)}
                                  title='Give playback control'
                                  disabled={isMaster}
                                  className='p-1.5 rounded-md text-muted-foreground hover:text-amber-400 hover:bg-background disabled:opacity-30 transition-colors'
                                >
                                  <Crown className='h-3.5 w-3.5' />
                                </button>
                                <button
                                  onClick={() => handleModerate('kick', p.id, p.name)}
                                  title='Remove from party'
                                  className='p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-background transition-colors'
                                >
                                  <UserX className='h-3.5 w-3.5' />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* Chat Tab */
              <div className='flex flex-col flex-1 min-h-0'>
                <div ref={chatScrollRef} className='flex-1 overflow-y-auto flex flex-col gap-2 pr-1'>
                  {chatMessages.length === 0 ? (
                    <div className='flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground'>
                      <MessageCircle className='h-8 w-8 text-muted-foreground/40' />
                      <p className='text-xs'>No messages yet. Say hi to the party!</p>
                    </div>
                  ) : (
                    chatMessages.map((m) => {
                      const mine = identity?.id && m.sender?.id === identity.id
                      return (
                        <div key={m.messageId || `${m.timestamp}-${m.sender?.id}`} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                          <div className='flex items-center gap-1.5'>
                            {!mine && <span className='text-[10px] font-semibold text-primary'>{m.sender?.name || 'Peer'}</span>}
                            <span className='text-[9px] text-muted-foreground'>
                              {new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div
                            className={cn(
                              'max-w-[85%] rounded-xl px-3 py-1.5 text-xs leading-relaxed break-words',
                              mine ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-background/70 border border-border/40 text-foreground rounded-tl-sm'
                            )}
                          >
                            {m.text}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                <div className='flex items-center gap-2 mt-3 pt-3 border-t border-border/40'>
                  <input
                    type='text'
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendChat()
                      }
                    }}
                    placeholder='Message the party...'
                    maxLength={1000}
                    className='flex-1 rounded-lg bg-background border border-border/60 px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary'
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={!chatDraft.trim()}
                    className='flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors'
                  >
                    <Send className='h-3.5 w-3.5' />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
