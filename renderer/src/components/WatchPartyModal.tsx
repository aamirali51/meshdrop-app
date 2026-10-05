import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Radio,
  Film,
  RotateCcw,
  Check,
  Copy,
  Layers,
  Captions,
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
  const [playerError, setPlayerError] = useState<{ code:number; message:string; source:string }|null>(null)
  const [showTapToPlay, setShowTapToPlay] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const bufferingTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  const retryVerRef = useRef(0)

  // Fetch local loopback Range stream URL — watermark gating preserved
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

  // Attach video stream — same universal multi-engine as WatchParty page
  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamUrl) return
    setPlayerError(null); setShowTapToPlay(false); setIsBuffering(false)

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
          setPlayerError({ code: 3, message: `${errType}: ${errDetail||''}`.trim(), source: 'mpegts' })
        })
      } catch (err) {
        console.warn('[WatchParty] mpegts initialization error, falling back to direct video:', err)
        video.src = streamUrl
      }
    } else if (isHls && Hls.isSupported()) {
      hlsPlayer = new Hls({ enableWorker: true })
      hlsPlayer.loadSource(streamUrl)
      hlsPlayer.attachMedia(video)
      hlsPlayer.on(Hls.Events.ERROR as any, (_e:any, data:any)=>{ if(!data||!data.fatal) return; console.warn('[WatchParty] hls fatal', data.type, data.details); const code=data.type==='networkError'?2:3; setPlayerError({code, message:String(data.details||data.type||'HLS error'), source:'hls'}) })
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
        if (vid.paused) vid.play().catch((err:any)=>{ const n=err&&(err.name||''); if(n==='NotAllowedError') setShowTapToPlay(true); else if(err) setPlayerError({code:0,message:err.message||String(err),source:'play'}) })
        setIsPlaying(true)
      } else if (state.action === 'pause') {
        if (!vid.paused) vid.pause()
        setIsPlaying(false)
      }

      if (typeof state.positionSec === 'number') {
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
          const n = (err as any)?.name
          if (n === 'NotAllowedError') setShowTapToPlay(true)
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
      title={roomTitle || 'Watch Party'}
      description="Dark theater — direct P2P stream with synced playback. Same engines, new costume."
      className="max-w-4xl !bg-[#0B0E14] !border-white/10"
      headerTone="dark"
    >
      <div className="flex flex-col gap-3 py-1">
        {/* Top bar — dark */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-bold text-white">
              <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
              <span>{isHost ? 'Host' : 'Guest'} · {isPlaying ? 'In Sync' : 'Paused'}</span>
            </div>
            {roomCode && (
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 font-mono font-bold text-white hover:text-white/80 transition-colors"
              >
                <span>{roomCode}</span>
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-white/40" />}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-white/60">
              <Layers className="h-3 w-3" /> Range streaming
            </span>
            {!isHost && hostPos != null && !syncWithHost && videoRef.current && Math.abs(hostPos - currentTime) > 3 && (
              <button
                onClick={() => {
                  const vid = videoRef.current
                  if (!vid || hostPos == null) return
                  vid.currentTime = hostPos
                  setCurrentTime(hostPos)
                }}
                className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-black hover:bg-white/90 transition-colors"
              >
                Jump to host ({formatTime(Math.abs(hostPos - currentTime))} {hostPos > currentTime ? 'behind' : 'ahead'})
              </button>
            )}
            {!isHost && (
              <button
                onClick={() => setSyncWithHost((v) => !v)}
                className={`rounded-full px-3 py-1 text-xs font-bold border transition-colors ${syncWithHost ? 'bg-white text-black border-white' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}
              >
                {syncWithHost ? 'In Sync' : 'Manual'}
              </button>
            )}
          </div>
        </div>

        {/* Video — near-black theater */}
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl flex items-center justify-center group select-none"
        >
          {streamUrl ? (
            <video
              ref={videoRef}
              preload="auto"
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={(e) => {
                const me:any=(e.currentTarget as HTMLVideoElement).error; const code=me?me.code:0; const msg=me?(me.message||`MediaError code ${code}`):'MediaError'; console.warn('[WatchParty] Video decode error',code,msg); setPlayerError({code:code||3,message:msg,source:'native'})
              }}
              onWaiting={()=>{ if(bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current); bufferingTimerRef.current=setTimeout(()=>setIsBuffering(true),1200)}}
              onStalled={()=>{ if(bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current); bufferingTimerRef.current=setTimeout(()=>setIsBuffering(true),1200)}}
              onPlaying={()=>{ if(bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current); setIsBuffering(false); setShowTapToPlay(false); setPlayerError(null)}}
              onCanPlay={()=>{ if(bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current); setIsBuffering(false)}}
              onClick={togglePlay}
              className="h-full w-full object-contain cursor-pointer"
              playsInline
            />
          ) : (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <div className="relative">
                <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-white/90" />
                <Film className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-white/70" />
              </div>
              <p className="text-sm font-black text-white">Preparing stream…</p>
              <p className="text-xs text-white/50">Staging blocks — starts when the head watermark is playable</p>
            </div>
          )}

          {/* Tap for sound — autoplay fallback affordance */}
          {showTapToPlay && !playerError && (
            <button onClick={()=>{ const v=videoRef.current; if(!v) return; setShowTapToPlay(false); v.muted=false; setIsMuted(false); v.play().catch((err:any)=>setPlayerError({code:0,message:err.message||String(err),source:'play'})) }} className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/75 backdrop-blur-sm p-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-xl"><Play className="h-7 w-7 fill-current ml-1" /></div>
              <span className="text-sm font-black text-white">Tap for sound</span>
              <span className="text-xs text-white/60">Autoplay was blocked — tap to unmute and stay in sync</span>
            </button>
          )}
          {playerError && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
              <p className="text-sm font-black text-white">{playerError.code===2?'Connection interrupted':playerError.code===3||playerError.code===4?'Format not supported':'Playback failed'}</p>
              <p className="text-xs text-white/60 max-w-[32ch]">{playerError.message}</p>
              <button onClick={()=>{ setPlayerError(null); setShowTapToPlay(false); retryVerRef.current++; const m=METHODS.STREAM_URL_GET||'stream.getUrl'; call(m,{transferId,filePath}).then((res:any)=>{ if(res?.url) setStreamUrl(`${res.url}&vw=${retryVerRef.current}`)}).catch(()=>{}) }} className="rounded-xl bg-white px-5 py-2.5 text-xs font-black text-black hover:bg-white/90">Retry</button>
            </div>
          )}
          {isBuffering && !playerError && !showTapToPlay && (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-black/25 pointer-events-none">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <span className="text-xs font-medium text-white/80">Buffering…</span>
            </div>
          )}

          {/* Center play when paused */}
          {!isPlaying && streamUrl && !showTapToPlay && !playerError && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/30"
              aria-label="Play"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-2xl hover:scale-105 active:scale-95 transition-transform">
                <Play className="h-7 w-7 fill-current ml-1" />
              </div>
            </button>
          )}

          {/* Controls — dark theater style */}
          <div
            className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-4 transition-opacity duration-300 ${
              showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="relative mb-3 flex items-center">
              {duration > 0 && (
                <div
                  style={{ width: `${(bufferedEnd / duration) * 100}%` }}
                  className="absolute h-1.5 rounded-full bg-white/15 pointer-events-none"
                />
              )}
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="relative z-10 w-full h-1.5 accent-white cursor-pointer rounded-full bg-white/10"
                aria-label="Seek"
              />
            </div>

            <div className="flex items-center justify-between gap-2 text-white">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-md hover:bg-white/90 active:scale-95 transition-all"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={toggleMute}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/15 transition-colors"
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="hidden sm:block w-20 h-1 accent-white bg-white/15 rounded cursor-pointer"
                    aria-label="Volume"
                  />
                </div>

                <span className="hidden sm:inline font-mono text-xs tabular-nums text-white/80">
                  {formatTime(currentTime)} <span className="text-white/30">/</span> {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = 0
                      broadcastSync('seek', 0)
                    }
                  }}
                  className="h-8 gap-1 rounded-full bg-white/10 px-3 text-xs font-bold text-white hover:bg-white hover:text-black border border-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restart
                </Button>

                <button
                  onClick={toggleFullscreen}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/15 transition-colors"
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <span className="text-xs">⤓</span> : <span className="text-xs">⤢</span>}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Captions className="h-3.5 w-3.5" /> Theater — direct P2P · staged shareId · watermark gating
          </span>
          <Button variant="outline" onClick={onClose} size="sm" className="rounded-full font-bold border-white/10 bg-white text-black hover:bg-white/90">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
