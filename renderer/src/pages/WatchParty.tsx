import React, { useState, useEffect, useRef, useCallback } from 'react'
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
  Send,
  MessageSquare,
  ShieldAlert,
  Crown,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/hooks/useToast'
import { useDevices } from '@/hooks/useDevices'
import { useShares } from '@/hooks/useShares'
import { useWatchSync } from '@/hooks/useWatchSync'
import { METHODS, EVENTS } from '@/types/protocol'
import { call, on } from '@/lib/ipc'
import { computeDeviceCapabilities } from '@/lib/deviceCapabilities'
import { cn } from '@/lib/utils'

interface RoomParticipant {
  id: string
  name: string
  positionSec?: number
  buffering?: boolean
  bufferedPercent?: number
  joinedAt?: number
}

interface DiscoveredRoom {
  roomCode: string
  title: string
  hostName: string
  hostPeerId: string
  filename?: string
  fileSize?: number
  timestamp: number
}

interface ChatMessage {
  id: string
  sender: string
  senderId?: string
  text: string
  timestamp: number
  isSelf?: boolean
}

const REACTIONS = ['🍿', '🔥', '👏', '❤️', '😂', '🎉']

export function WatchParty() {
  const { toast } = useToast()
  const { identity } = useDevices()
  const { partyJoinCode, clearPartyJoinCode } = useShares()

  // Room & Player State
  const [activeRoom, setActiveRoom] = useState<any | null>(null)
  const [discoveredRooms, setDiscoveredRooms] = useState<DiscoveredRoom[]>([])
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [roomTitleInput, setRoomTitleInput] = useState('')
  const [controlsMode, setControlsMode] = useState<'host' | 'open'>('host')
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string; size: number } | null>(null)
  const [loading, setLoading] = useState(false)

  // Playback State
  const [streamUrl, setStreamUrl] = useState<string>('')
  const [streamError, setStreamError] = useState<string>('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const [copiedCode, setCopiedCode] = useState(false)
  const [floatingReactions, setFloatingReactions] = useState<{ id: number; emoji: string; x: number }[]>([])
  const [checksumWarning, setChecksumWarning] = useState<string | null>(null)

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatOpen, setChatOpen] = useState(true)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncBroadcastRef = useRef<number>(0)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const appliedSnapshotRef = useRef<string>('')

  const applySync = useWatchSync({
    videoRef,
    isHost: Boolean(activeRoom?.isHost),
    onResync: () => {}
  })

  const sendChatMessage = useCallback(() => {
    const text = chatInput.trim()
    if (!text) return
    call(METHODS.WATCH_PARTY_CHAT, { text }).catch(() => {})
    setChatMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-self`, sender: identity?.name || 'You', senderId: identity?.id, text, timestamp: Date.now(), isSelf: true }
    ])
    setChatInput('')
  }, [chatInput, identity])

  // Fetch initial state & discover rooms
  useEffect(() => {
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
        // Pre-seed chat history from the room snapshot if the engine carried it.
        if (Array.isArray(room?.chatHistory)) {
          setChatMessages(room.chatHistory.map((m: any, i: number) => ({
            id: `${room.roomCode}-${i}-${m.timestamp || 0}`,
            sender: m.sender?.name || 'Peer',
            senderId: m.sender?.id,
            text: m.text,
            timestamp: m.timestamp || Date.now(),
            isSelf: m.sender?.id === identity?.id
          })))
        }
      }),
      on(EVENTS.WATCH_ROOM_JOINED, (room: any) => {
        setActiveRoom(room)
        // New-joiner snapshot: apply the host's position immediately.
        if (room?.lastPlayback && room.lastPlayback.positionSec != null) {
          setCurrentTime(room.lastPlayback.positionSec)
          if (videoRef.current) videoRef.current.currentTime = room.lastPlayback.positionSec
          setIsPlaying(room.lastPlayback.action === 'play')
          appliedSnapshotRef.current = room.roomCode || ''
        }
        if (Array.isArray(room?.chatHistory)) {
          setChatMessages(room.chatHistory.map((m: any, i: number) => ({
            id: `${room.roomCode}-${i}-${m.timestamp || 0}`,
            sender: m.sender?.name || 'Peer',
            senderId: m.sender?.id,
            text: m.text,
            timestamp: m.timestamp || Date.now(),
            isSelf: m.sender?.id === identity?.id
          })))
        }
        if (room?.fileChecksum && room.fileChecksum !== identity?.id) {
          // The engine knows the host's checksum; the local copy may differ —
          // surface a warning instead of silently desyncing.
          setChecksumWarning('This party is playing a file. If the video looks wrong, make sure you have the same file as the host.')
        }
      }),
      on(EVENTS.WATCH_ROOM_LEFT, () => {
        setActiveRoom(null)
        setStreamUrl('')
        setChatMessages([])
        setChecksumWarning(null)
      }),
      on(EVENTS.WATCH_ROOM_CLOSED, (data: any) => {
        setActiveRoom(null)
        setStreamUrl('')
        setChatMessages([])
        setChecksumWarning(null)
        if (data?.handedOff) {
          toast.info('Party Continued', 'The host left, but the party continues with a new host.')
        } else {
          toast.info('Party Ended', 'The host has closed the Watch Party room.')
        }
      }),
      on(EVENTS.WATCH_HOST_CHANGED, (room: any) => {
        setActiveRoom(room)
        setIsPlaying(Boolean(room?.lastPlayback && room.lastPlayback.action === 'play'))
        toast.success('You are the Host', 'The previous host left — you are now hosting the party.')
      }),
      on(EVENTS.WATCH_STATE_SYNC, (state: any) => {
        if (!state) return
        // Apply new-joiner snapshot immediately when roomMeta is present.
        if (state.roomMeta) {
          setActiveRoom((prev: any) => {
            const next = { ...(prev || {}), ...state.roomMeta }
            return next
          })
          if (state.positionSec != null) {
            setCurrentTime(state.positionSec)
            if (videoRef.current) videoRef.current.currentTime = state.positionSec
            setIsPlaying(state.action === 'play')
            appliedSnapshotRef.current = state.roomCode || ''
          }
          return
        }
        applySync(state)
      }),
      on(EVENTS.WATCH_REACTION, (reaction: any) => {
        if (reaction?.emoji) {
          triggerReactionAnimation(reaction.emoji)
        }
      }),
      on(EVENTS.WATCH_CHAT, (msg: any) => {
        if (!msg?.text) return
        setChatMessages((prev) => {
          if (prev.some((m) => m.timestamp === msg.timestamp && m.senderId === msg.sender?.id)) return prev
          return [
            ...prev,
            {
              id: `${msg.sender?.id || 'p'}-${msg.timestamp}`,
              sender: msg.sender?.name || 'Peer',
              senderId: msg.sender?.id,
              text: msg.text,
              timestamp: msg.timestamp || Date.now(),
              isSelf: msg.sender?.id === identity?.id
            }
          ]
        })
      }),
      on(EVENTS.WATCH_PEER_JOINED, (data: any) => {
        toast.success('Peer Joined', `${data.peer?.name || 'A peer'} joined the party.`)
      }),
    ]

    return () => {
      unsubs.forEach((u) => u?.())
    }
  }, [applySync, identity?.id, identity?.name, toast])

  // Auto-join when a party deep link arrives.
  useEffect(() => {
    if (partyJoinCode && !activeRoom) {
      handleJoinRoom(partyJoinCode)
      clearPartyJoinCode()
    }
  }, [partyJoinCode, activeRoom]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll chat to the bottom on new messages.
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatMessages])

  // Resolve WebDAV Stream URL whenever activeRoom changes. The host negotiates
  // per-device: we declare what this browser can play so it can direct-play,
  // remux, or refuse with a reason instead of a black screen.
  useEffect(() => {
    if (!activeRoom) {
      setStreamUrl('')
      setStreamError('')
      return
    }

    const capabilities = computeDeviceCapabilities()
    if (activeRoom.filePath) {
      call(METHODS.STREAM_URL_GET, { filePath: activeRoom.filePath, capabilities })
        .then((res: any) => {
          if (res?.refused) {
            setStreamUrl('')
            setStreamError(res.refused)
          } else if (res?.url) {
            setStreamUrl(res.url)
            setStreamError('')
          }
        })
        .catch(() => {})
    } else if (activeRoom.roomCode) {
      const shareId = `watch-${activeRoom.roomCode.toLowerCase()}`
      call(METHODS.STREAM_URL_GET, { transferId: shareId, capabilities })
        .then((res: any) => {
          if (res?.refused) {
            setStreamUrl('')
            setStreamError(res.refused)
          } else if (res?.url) {
            setStreamUrl(res.url)
            setStreamError('')
          }
        })
        .catch(() => {})
    }
  }, [activeRoom])

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
    call(METHODS.WATCH_PARTY_REACTION, { emoji }).catch(() => {})
  }

  // File Picker
  const handlePickFile = async () => {
    try {
      const res = await window.bridge?.openFileDialog?.()
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
    } catch {}
  }

  // Host Create Room
  const handleCreateRoom = async () => {
    if (!selectedFile) {
      toast.error('File Required', 'Please select a video file to stream.')
      return
    }
    setLoading(true)
    try {
      const room = await call(METHODS.WATCH_PARTY_CREATE, {
        title: roomTitleInput || selectedFile.name,
        filePath: selectedFile.path,
        controlsMode
      })
      setActiveRoom(room)
      toast.success('Room Created', `Watch Party ${(room as any)?.roomCode} is live!`)
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
      const room = await call(METHODS.WATCH_PARTY_JOIN, { roomCode: code })
      setActiveRoom(room)
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
    setChecksumWarning(null)
  }

  const handleCopyCode = () => {
    if (!activeRoom?.roomCode) return
    navigator.clipboard.writeText(activeRoom.roomCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
    toast.success('Copied', `Room code ${activeRoom.roomCode} copied to clipboard!`)
  }

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

            {/* Drag & Drop / File Picker */}
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
                  <p className='text-sm font-medium text-foreground'>Click or drag video file here</p>
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
            {/* HTML5 Video Surface */}
            {streamUrl ? (
              <video
                ref={videoRef}
                src={streamUrl}
                className='w-full h-full object-contain'
                autoPlay
                playsInline
                onError={(e) => {
                  const err = e.currentTarget.error
                  console.warn('[WatchParty] Video decode error:', err?.code, err?.message)
                  if (err?.code === 4) {
                    setStreamError(
                      'This device could not decode the video. The host may need to convert it.'
                    )
                  }
                }}
                onTimeUpdate={() => {
                  if (videoRef.current) setCurrentTime(videoRef.current.currentTime)
                }}
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
              />
            ) : streamError ? (
              <div className='flex flex-col items-center justify-center gap-3 p-8 text-center'>
                <Tv className='h-12 w-12 text-amber-500/80' />
                <p className='text-sm font-semibold text-foreground'>Video not playable on this device</p>
                <p className='text-xs text-muted-foreground max-w-sm'>{streamError}</p>
              </div>
            ) : (
              <div className='flex flex-col items-center justify-center gap-3 p-8 text-center'>
                <Tv className='h-12 w-12 text-primary animate-pulse' />
                <p className='text-sm font-semibold text-foreground'>Connecting to Mesh Stream...</p>
                <p className='text-xs text-muted-foreground'>Prefetching video blocks across peer channels</p>
              </div>
            )}

            {/* Floating Emoji Reactions Overlay */}
            <div className='absolute inset-0 pointer-events-none overflow-hidden'>
              <AnimatePresence>
                {floatingReactions.map((r) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 1, y: 300, scale: 0.8, x: `${r.x}%` }}
                    animate={{ opacity: 0, y: 50, scale: 1.8 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2, ease: 'easeOut' }}
                    className='absolute bottom-10 text-4xl select-none'
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

          {/* Right Audience & Reactions Sidebar */}
          <div className='lg:col-span-4 flex flex-col gap-4 rounded-2xl bg-card border border-border/60 p-5 shadow-sm'>
            {/* Room Info */}
            <div className='flex items-center justify-between border-b border-border/40 pb-3'>
              <div>
                <h3 className='font-bold text-sm text-foreground'>{activeRoom.title}</h3>
                <p className='text-xs text-muted-foreground font-mono mt-0.5'>
                  {activeRoom.isHost ? '👑 Host' : `Hosted by ${activeRoom.hostName}`}
                </p>
              </div>
              <div className='flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20'>
                <span className='h-2 w-2 rounded-full bg-emerald-400 animate-pulse' />
                Live Swarm
              </div>
            </div>

            {/* File checksum warning */}
            {checksumWarning && (
              <div className='flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-xs text-amber-300'>
                <ShieldAlert className='h-4 w-4 shrink-0 mt-0.5' />
                <span>{checksumWarning}</span>
              </div>
            )}

            {/* Host badge when promoted */}
            {activeRoom.isHost && (
              <div className='flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/25 px-3 py-2 text-xs font-semibold text-primary'>
                <Crown className='h-4 w-4' />
                You are hosting this party — controls are yours.
              </div>
            )}

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

            {/* Audience List */}
            <div className='flex flex-col gap-2 flex-1 overflow-y-auto'>
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
                      <span className='text-xs font-medium text-foreground'>{identity?.name || 'You'} (You)</span>
                      <span className='text-[10px] text-muted-foreground'>{activeRoom.isHost ? 'Host' : 'Viewer'}</span>
                    </div>
                  </div>
                  <span className='text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full'>
                    🟢 In Sync
                  </span>
                </div>

                {/* Other participants */}
                {activeRoom.participants?.map((p: RoomParticipant) => (
                  <div key={p.id} className='flex items-center justify-between p-2.5 rounded-lg bg-background/50 border border-border/30'>
                    <div className='flex items-center gap-2'>
                      <div className='h-7 w-7 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold text-xs'>
                        {p.name.slice(0, 1)}
                      </div>
                      <span className='text-xs font-medium text-foreground'>{p.name}</span>
                    </div>
                    <span className='text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full'>
                      {p.buffering ? '🟡 Buffering' : '🟢 In Sync'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat Panel */}
            <div className='flex flex-col gap-2 border-t border-border/40 pt-3'>
              <div className='flex items-center justify-between'>
                <button
                  onClick={() => setChatOpen((v) => !v)}
                  className='flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors'
                >
                  <MessageSquare className='h-3.5 w-3.5' />
                  Party Chat
                  {chatMessages.length > 0 && (
                    <span className='text-primary font-mono'>{chatMessages.length}</span>
                  )}
                </button>
              </div>

              {chatOpen && (
                <>
                  <div
                    ref={chatScrollRef}
                    className='flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1'
                  >
                    {chatMessages.length === 0 && (
                      <p className='text-[11px] text-muted-foreground/70 py-2 text-center'>
                        Say hi to the party 🍿
                      </p>
                    )}
                    {chatMessages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          'flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-xs',
                          m.isSelf ? 'bg-primary/10 border border-primary/20' : 'bg-background/50 border border-border/30'
                        )}
                      >
                        <span className='text-[10px] font-semibold text-muted-foreground'>
                          {m.isSelf ? 'You' : m.sender}
                        </span>
                        <span className='text-foreground/90 break-words'>{m.text}</span>
                      </div>
                    ))}
                  </div>

                  <div className='flex items-center gap-1.5'>
                    <input
                      type='text'
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') sendChatMessage()
                      }}
                      placeholder='Message the party…'
                      className='flex-1 rounded-lg bg-background border border-border/60 px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary'
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={!chatInput.trim()}
                      className='flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 transition-colors'
                    >
                      <Send className='h-3.5 w-3.5' />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
