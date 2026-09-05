import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Radio,
  Users,
  Film,
  Sparkles,
  RotateCcw,
  Check,
  Copy,
  Layers
} from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'
import { METHODS, EVENTS } from '@/types/protocol'
import { call, on } from '@/lib/ipc'
import type { WatchState } from '@/types'
import mpegts from 'mpegts.js'
import Hls from 'hls.js'

interface WatchPartyModalProps {
  open: boolean
  onClose: () => void
  roomCode?: string
  roomTitle?: string
  transferId?: string
  filePath?: string
  isHost?: boolean
}

export function WatchPartyModal({
  open,
  onClose,
  roomCode,
  roomTitle,
  transferId,
  filePath,
  isHost = false
}: WatchPartyModalProps) {
  const { toast } = useToast()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<any>(null)

  const [streamUrl, setStreamUrl] = useState<string>('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [syncWithHost, setSyncWithHost] = useState(true)
  const [hostPos, setHostPos] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null)

  // Fetch local loopback Range stream URL
  useEffect(() => {
    if (!open) {
      setStreamUrl('')
      setIsPlaying(false)
      return
    }

    let active = true
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    const method = METHODS.STREAM_URL_GET || 'stream.getUrl'
    const tryResolve = () => {
      call(method, { transferId, filePath })
        .then((res: any) => {
          if (!active) return
          if (res?.url) {
            setStreamUrl(res.url)
            return
          }
          // Not playable yet (progressive transfer still verifying the moov /
          // prefix watermark). Retry a bounded number of times — the engine
          // only hands out a URL once the source is genuinely playable.
          if (attempts < 60) {
            attempts++
            retryTimer = setTimeout(tryResolve, 3000)
          }
        })
        .catch((err) => {
          console.warn('[WatchParty] Failed to get stream url:', err)
          if (!active) return
          if (attempts < 5) {
            attempts++
            retryTimer = setTimeout(tryResolve, 3000)
          } else {
            toast.error('Stream Error', 'Could not initialize local stream server.')
          }
        })
    }
    tryResolve()

    return () => {
      active = false
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [open, transferId, filePath, toast])

  // Attach video stream (Universal multi-engine: mpegts.js for TS/FLV, Hls.js for m3u8, native HTML5 for MP4/WebM/MKV)
  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamUrl) return

    const lowerTitle = (roomTitle || '').toLowerCase()
    const lowerPath = (filePath || '').toLowerCase()
    const lowerUrl = streamUrl.toLowerCase()

    const isTs =
      lowerTitle.endsWith('.ts') ||
      lowerTitle.endsWith('.m2ts') ||
      lowerTitle.endsWith('.mts') ||
      lowerPath.endsWith('.ts') ||
      lowerPath.endsWith('.m2ts') ||
      lowerPath.endsWith('.mts') ||
      lowerUrl.includes('.ts')

    const isFlv = lowerTitle.endsWith('.flv') || lowerPath.endsWith('.flv') || lowerUrl.includes('.flv')
    const isHls = lowerTitle.endsWith('.m3u8') || lowerPath.endsWith('.m3u8') || lowerUrl.includes('.m3u8')

    let mpegtsPlayer: any = null
    let hlsPlayer: Hls | null = null

    if ((isTs || isFlv) && mpegts.isSupported()) {
      try {
        mpegtsPlayer = mpegts.createPlayer(
          {
            type: isFlv ? 'flv' : 'mse',
            isLive: false,
            url: streamUrl,
            cors: true
          },
          {
            enableWorker: true,
            lazyLoad: true,
            lazyLoadMaxDuration: 180, // buffer up to 3 mins ahead progressively
            lazyLoadRecoverDuration: 30,
            deferLoadAfterSourceOpen: false,
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 120, // keep 2 mins behind current playhead
            autoCleanupMinBackwardDuration: 60,
            seekType: 'range',
            fixAudioTimestampGap: true
          }
        )
        playerRef.current = mpegtsPlayer
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
        console.warn('[WatchParty] mpegts initialization error, falling back to direct video:', err)
        video.src = streamUrl
      }
    } else if (isHls && Hls.isSupported()) {
      hlsPlayer = new Hls({ enableWorker: true })
      hlsPlayer.loadSource(streamUrl)
      hlsPlayer.attachMedia(video)
    } else {
      video.src = streamUrl
    }

    return () => {
      playerRef.current = null
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
  }, [streamUrl, roomTitle, filePath])

  const seekDebounceTimer = useRef<NodeJS.Timeout | null>(null)
  const lastTimeUpdate = useRef<number>(0)

  // Broadcast state changes when Host interacts
  const broadcastSync = useCallback(
    (action: 'play' | 'pause' | 'seek', positionSec: number) => {
      if (!isHost && !syncWithHost) return
      const method = METHODS.WATCH_STATE_BROADCAST || 'watch.stateBroadcast'
      call(method, {
        roomCode,
        action,
        positionSec
      }).catch(() => {})
    },
    [isHost, syncWithHost, roomCode]
  )

  // Listen for incoming Watch state sync signals from Host (viewers only).
  // A room-based party surfaces state on watch.state_sync (forwarded from the
  // engine's party:state:sync); the legacy claim/player path surfaces it on
  // watch.stateChanged. Accept both so a viewer follows the host in either flow.
  useEffect(() => {
    if (!open || isHost) return
    const applyState = (data: unknown) => {
      const state = data as WatchState | null
      if (!state) return
      if (typeof state.positionSec === 'number') setHostPos(state.positionSec)
      if (!syncWithHost) return

      const vid = videoRef.current
      if (!vid) return

      if (state.action === 'play') {
        if (vid.paused) vid.play().catch(() => {})
        setIsPlaying(true)
      } else if (state.action === 'pause') {
        if (!vid.paused) vid.pause()
        setIsPlaying(false)
      }

      if (typeof state.positionSec === 'number') {
        // Sync timestamp if drift is greater than 1.5 seconds
        const drift = Math.abs(vid.currentTime - state.positionSec)
        if (drift > 1.5) {
          vid.currentTime = state.positionSec
          setCurrentTime(state.positionSec)
        }
      }
    }
    const unsubChanged = on(EVENTS.WATCH_STATE_CHANGED || 'watch.stateChanged', applyState)
    const unsubSync = on(EVENTS.WATCH_STATE_SYNC || 'watch.state_sync', applyState)

    return () => {
      unsubChanged?.()
      unsubSync?.()
    }
  }, [open, isHost, syncWithHost])

  // Throttled video time update handler to prevent high-frequency React re-renders
  const handleTimeUpdate = () => {
    const vid = videoRef.current
    if (!vid) return
    const now = Date.now()
    if (now - lastTimeUpdate.current > 200 || vid.paused) {
      lastTimeUpdate.current = now
      if (typeof vid.currentTime === 'number' && isFinite(vid.currentTime)) {
        setCurrentTime(vid.currentTime)
      }
      if (vid.duration && !isNaN(vid.duration) && isFinite(vid.duration) && vid.duration !== duration) {
        setDuration(vid.duration)
      }
      if (vid.buffered.length > 0) {
        try {
          const end = vid.buffered.end(vid.buffered.length - 1)
          if (isFinite(end)) setBufferedEnd(end)
        } catch {}
      }
    }
  }

  const togglePlay = () => {
    const vid = videoRef.current
    if (!vid) return

    if (vid.paused) {
      vid.volume = volume
      vid.muted = isMuted
      vid
        .play()
        .then(() => {
          setIsPlaying(true)
          broadcastSync('play', vid.currentTime)
        })
        .catch((err) => {
          console.warn('[WatchParty] play() error:', err)
        })
    } else {
      vid.pause()
      setIsPlaying(false)
      broadcastSync('pause', vid.currentTime)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vid = videoRef.current
    if (!vid) return
    const target = parseFloat(e.target.value)
    if (isNaN(target) || !isFinite(target)) return

    if (playerRef.current && typeof playerRef.current.currentTime === 'number') {
      try {
        playerRef.current.currentTime = target
      } catch {
        vid.currentTime = target
      }
    } else {
      vid.currentTime = target
    }
    setCurrentTime(target)

    if (seekDebounceTimer.current) clearTimeout(seekDebounceTimer.current)
    seekDebounceTimer.current = setTimeout(() => {
      broadcastSync('seek', target)
    }, 150)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    if (videoRef.current) {
      videoRef.current.volume = val
      videoRef.current.muted = val === 0
      setIsMuted(val === 0)
    }
  }

  const toggleMute = () => {
    if (!videoRef.current) return
    if (isMuted) {
      videoRef.current.muted = false
      setIsMuted(false)
      videoRef.current.volume = volume > 0 ? volume : 0.5
    } else {
      videoRef.current.muted = true
      setIsMuted(true)
    }
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  const handleMouseMove = () => {
    setShowControls(true)
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
    hideControlsTimer.current = setTimeout(() => {
      if (isPlaying) setShowControls(false)
    }, 2500)
  }

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || !isFinite(secs) || secs < 0) return '00:00'
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = Math.floor(secs % 60)
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const handleCopyCode = async () => {
    if (!roomCode) return
    try {
      await navigator.clipboard.writeText(roomCode)
      setCopied(true)
      toast.success('Room Code Copied', `${roomCode} copied to clipboard.`)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={roomTitle || 'Watch Party (P2P Streaming)'}
      description='Synchronized, lossless P2P video stream powered by MeshDrop uDX & Hypercore'
      className='max-w-4xl'
    >
      <div className='flex flex-col gap-3 py-1'>
        {/* Top Info Bar */}
        <div className='flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-xs'>
          <div className='flex items-center gap-2'>
            <div className='flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-bold text-primary'>
              <Radio className='h-3 w-3 animate-pulse' />
              <span>{isHost ? 'Host Broadcaster' : 'Synced Viewer'}</span>
            </div>
            {roomCode && (
              <button
                onClick={handleCopyCode}
                className='flex items-center gap-1 font-mono font-bold text-foreground hover:text-primary transition-colors'
              >
                <span>{roomCode}</span>
                {copied ? <Check className='h-3 w-3 text-status-online' /> : <Copy className='h-3 w-3 text-muted-foreground' />}
              </button>
            )}
          </div>

          <div className='flex items-center gap-2'>
            <div className='flex items-center gap-1 text-[11px] text-muted-foreground'>
              <Layers className='h-3.5 w-3.5 text-accent' />
              <span>P2P Range Streaming</span>
            </div>
            {!isHost && hostPos != null && !syncWithHost && videoRef.current && Math.abs(hostPos - currentTime) > 3 && (
              <button
                onClick={() => {
                  const vid = videoRef.current
                  if (!vid || hostPos == null) return
                  vid.currentTime = hostPos
                  setCurrentTime(hostPos)
                }}
                className='rounded px-2 py-0.5 text-[10px] font-bold border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all'
              >
                Jump to host ({formatTime(Math.abs(hostPos - currentTime))} {hostPos > currentTime ? 'behind' : 'ahead'})
              </button>
            )}
            {!isHost && (
              <button
                onClick={() => setSyncWithHost((v) => !v)}
                className={`rounded px-2 py-0.5 text-[10px] font-bold transition-all ${
                  syncWithHost
                    ? 'border border-status-online/30 bg-status-online/10 text-status-online'
                    : 'border border-border/50 bg-muted/20 text-muted-foreground'
                }`}
              >
                {syncWithHost ? 'In Sync with Host' : 'Manual Playback'}
              </button>
            )}
          </div>
        </div>

        {/* Video Player Container */}
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          className='relative aspect-video w-full overflow-hidden rounded-2xl border border-border/70 bg-black shadow-2xl flex items-center justify-center group select-none'
        >
          {streamUrl ? (
            <video
              ref={videoRef}
              preload='auto'
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={(e) => {
                const err = e.currentTarget.error
                console.warn('[WatchParty] Video decode error:', err?.code, err?.message)
              }}
              onClick={togglePlay}
              className='h-full w-full object-contain cursor-pointer'
              playsInline
            />
          ) : (
            <div className='flex flex-col items-center gap-2 text-muted-foreground'>
              <Film className='h-10 w-10 animate-pulse text-primary/60' />
              <span className='text-sm font-medium'>Connecting to local P2P stream...</span>
            </div>
          )}

          {/* Big Center Play Icon when paused */}
          {!isPlaying && streamUrl && (
            <button
              onClick={togglePlay}
              className='absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity'
            >
              <div className='flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-primary text-primary-foreground shadow-2xl transition-transform hover:scale-110 active:scale-95'>
                <Play className='h-7 w-7 fill-current ml-1' />
              </div>
            </button>
          )}

          {/* Player Overlay Controls */}
          <div
            className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 transition-opacity duration-300 ${
              showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Scrub & Buffer Bar */}
            <div className='relative mb-2 flex items-center group/scrub'>
              {/* Loaded Buffer Bar */}
              {duration > 0 && (
                <div
                  style={{ width: `${(bufferedEnd / duration) * 100}%` }}
                  className='absolute h-1.5 rounded-full bg-white/30 pointer-events-none transition-all'
                />
              )}
              {/* Progress Slider */}
              <input
                type='range'
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className='relative z-10 w-full h-1.5 accent-primary cursor-pointer rounded-full bg-white/20 transition-all hover:h-2'
              />
            </div>

            {/* Bottom Controls Bar */}
            <div className='flex items-center justify-between gap-2 text-white'>
              <div className='flex items-center gap-3'>
                <button
                  onClick={togglePlay}
                  className='flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/20 transition-colors'
                >
                  {isPlaying ? <Pause className='h-4 w-4 fill-current' /> : <Play className='h-4 w-4 fill-current ml-0.5' />}
                </button>

                <div className='flex items-center gap-1.5'>
                  <button
                    onClick={toggleMute}
                    className='flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/20 transition-colors'
                  >
                    {isMuted || volume === 0 ? <VolumeX className='h-4 w-4' /> : <Volume2 className='h-4 w-4' />}
                  </button>
                  <input
                    type='range'
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className='w-16 h-1 accent-white bg-white/30 rounded cursor-pointer'
                  />
                </div>

                <span className='font-mono text-xs text-white/80 select-none'>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className='flex items-center gap-2'>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = 0
                      broadcastSync('seek', 0)
                    }
                  }}
                  className='h-7 px-2 text-xs text-white/80 hover:bg-white/20 hover:text-white'
                >
                  <RotateCcw className='h-3 w-3 mr-1' />
                  Restart
                </Button>

                <button
                  onClick={toggleFullscreen}
                  className='flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-white'
                >
                  {isFullscreen ? <Minimize2 className='h-4 w-4' /> : <Maximize2 className='h-4 w-4' />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className='flex items-center justify-between pt-1'>
          <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
            <Sparkles className='h-3.5 w-3.5 text-primary' />
            <span>Progressive buffer active · Instant seek supported</span>
          </div>

          <Button variant='outline' onClick={onClose} size='sm' className='font-semibold'>
            Close Player
          </Button>
        </div>
      </div>
    </Modal>
  )
}
