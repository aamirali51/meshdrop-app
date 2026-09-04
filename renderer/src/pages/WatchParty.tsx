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
  Upload,
  Shield,
  Clock,
  Heart,
  Smile,
  Flame,
  Zap,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/hooks/useToast'
import { useDevices } from '@/hooks/useDevices'
import { call, on } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { EVENTS, METHODS } from '@/types/protocol'

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
  timestamp: number
}

const REACTIONS = ['🍿', '🔥', '👏', '❤️', '😂', '🎉']

export function WatchParty() {
  const { toast } = useToast()
  const { identity } = useDevices()

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
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const [copiedCode, setCopiedCode] = useState(false)
  const [floatingReactions, setFloatingReactions] = useState<{ id: number; emoji: string; x: number }[]>([])

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncBroadcastRef = useRef<number>(0)

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
      }),
      on(EVENTS.WATCH_ROOM_JOINED, (room: any) => {
        setActiveRoom(room)
      }),
      on(EVENTS.WATCH_ROOM_LEFT, () => {
        setActiveRoom(null)
        setStreamUrl('')
      }),
      on(EVENTS.WATCH_ROOM_CLOSED, () => {
        setActiveRoom(null)
        setStreamUrl('')
        toast.info('Party Ended', 'The host has closed the Watch Party room.')
      }),
      on(EVENTS.WATCH_STATE_SYNC, (state: any) => {
        if (!state) return
        handleRemotePlaybackState(state)
      }),
      on(EVENTS.WATCH_REACTION, (reaction: any) => {
        if (reaction?.emoji) {
          triggerReactionAnimation(reaction.emoji)
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
    const shareId = `watch-${activeRoom.roomCode.toLowerCase()}`
    let version = 0
    const resolve = () => {
      call(METHODS.STREAM_URL_GET, { transferId: shareId })
        .then((res: any) => {
          if (res?.url) {
            setStreamUrl(version > 0 ? `${res.url}&vw=${version}` : res.url)
          }
        })
        .catch(() => {})
    }
    resolve()
    const unsubs = [
      on(EVENTS.WATCH_MEDIA_READY, (media: any) => {
        if (media?.shareId && media.shareId !== shareId) return
        version += 1
        resolve()
      }),
      on(EVENTS.WATCH_MEDIA_ERROR, (media: any) => {
        if (media?.shareId && media.shareId !== shareId) return
        toast.error('Media Error', 'The party media could not be transferred.')
      }),
    ]
    return () => {
      unsubs.forEach((u) => u?.())
    }
  }, [activeRoom])

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
        controlsMode
      })) as any
      setActiveRoom(room)
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
                className='absolute inset-0 h-full w-full object-contain'
                autoPlay
                playsInline
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
          </div>
        </div>
      )}
    </div>
  )
}
