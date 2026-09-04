import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  File,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCw,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import mpegts from 'mpegts.js'
import Hls from 'hls.js'
import { cn } from '@/lib/utils'

export type PreviewFile = {
  name: string
  path: string
  type: 'file'
  size?: number
  mtimeMs?: number
}

interface FilePreviewModalProps {
  open: boolean
  file: PreviewFile | null
  /** Build the per-share raw URL for a path (http://127.0.0.1:PORT/raw?t=..&siteId=..&path=..). */
  rawUrl: (path: string) => string | null
  onDownload?: (file: PreviewFile) => void
  onOpenExternal?: (file: PreviewFile) => void
  /** Media files in the current folder, used for prev/next navigation. */
  siblings?: PreviewFile[]
  /** Notify the parent that the user navigated to a different sibling (so breadcrumb/selection stays in sync). */
  onNavigate?: (file: PreviewFile) => void
  onClose: () => void
}

const fmtTime = (secs: number) => {
  if (!isFinite(secs) || secs < 0) return '00:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const isPreviewVideo = (n: string) => /\.(mp4|mkv|webm|mov|avi|m4v|ts|mts|flv|wmv|mpg|mpeg|3gp|ogv|m3u8)$/i.test(n)
export const isPreviewImage = (n: string) => /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg|heic|ico)$/i.test(n)
export const isPreviewAudio = (n: string) => /\.(mp3|wav|ogg|flac|aac|m4a|opus|wma)$/i.test(n)

// Which playback engine handles a video container:
//   - mpegts: TS/MPEG-TS/FLV via mpegts.js (MSE) — native Chromium can't play these
//   - hls: m3u8 via hls.js
//   - native: MP4/WebM/MOV/OGV — Chromium decodes h264/aac/vp8/vp9/av1 in these
//   - unsupported: MKV/AVI/WMV/MPG/3GP etc — container or codec Chromium can't
//     decode; show a clear message + download/open instead of a vague error
export type VideoEngine = 'mpegts' | 'hls' | 'native' | 'unsupported'

// Sync classifier for the fast path. MKV/AVI/etc are NOT blanket-unsupported:
// Chromium's <video> can natively demux many H.264/AAC MKVs (the failures are
// tail-cues on seek, which the core's head/tail prefetch now guarantees, and
// exotic codecs). The async sniff (below) upgrades mkv-h264/aac to 'native'.
export function videoEngineFor(name: string): VideoEngine {
  const n = name.toLowerCase()
  if (/\.(ts|m2ts|mts|flv)$/.test(n)) return 'mpegts'
  if (/\.m3u8$/.test(n)) return 'hls'
  if (/\.(mp4|m4v|webm|mov|ogv|mkv|avi|wmv|mpg|mpeg|3gp)$/.test(n)) return 'native'
  return 'unsupported'
}

// Sniff a raw media URL's head to decide whether a container Chromium can't
// blanket-handle (mkv/avi...) is actually H.264/AAC inside — in which case the
// native <video> element will demux it. Reads the server's
// X-MeshDrop-Container header (webdav.js) when present; falls back to a tiny
// range GET when the header is absent (e.g. the sites gateway). Resolves to a
// VideoEngine.
export async function sniffVideoEngine(url: string): Promise<VideoEngine> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-262143' } })
    if (!res.ok && res.status !== 206) return 'native'
    const header = res.headers.get('x-meshdrop-container') || ''
    if (header) {
      const [container, codecs] = header.split(':')
      if (container === 'mkv') {
        const hasH264 = !codecs || codecs.split(',').includes('h264')
        const hasAac = !codecs || codecs.split(',').includes('aac')
        return hasH264 && hasAac ? 'native' : 'unsupported'
      }
      // mp4/webm/mov from the header are all natively demuxable.
      return 'native'
    }
    // No header (sites gateway): sniff the returned bytes directly.
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    // EBML magic 0x1A45DFA3 => Matroska/WebM; check for h264/aac codec IDs in
    // the first 256 KiB (cheap heuristic — a real parse lives in core).
    if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
      const headStr = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 262144)))
      const hasH264 = headStr.includes('V_MPEG4/ISO/AVC')
      const hasAac = headStr.includes('A_AAC')
      return hasH264 && hasAac ? 'native' : 'unsupported'
    }
    return 'native'
  } catch {
    return 'native'
  }
}

export function FilePreviewModal({ open, file, rawUrl, onDownload, onOpenExternal, siblings = [], onNavigate, onClose }: FilePreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mpegtsRef = useRef<any>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)

  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rotate, setRotate] = useState(0)
  const [videoEngine, setVideoEngine] = useState<VideoEngine>('native')

  const isVideo = !!file && isPreviewVideo(file.name)
  const isImage = !!file && isPreviewImage(file.name)
  const isAudio = !!file && isPreviewAudio(file.name)
  const mediaFiles = siblings.filter((f) => isPreviewVideo(f.name) || isPreviewImage(f.name) || isPreviewAudio(f.name))
  const idx = file ? mediaFiles.findIndex((f) => f.path === file.path) : -1
  const mediaRef = (isVideo ? videoRef : audioRef) as React.RefObject<HTMLMediaElement>

  const destroyEngines = () => {
    if (mpegtsRef.current) {
      try { mpegtsRef.current.pause(); mpegtsRef.current.unload(); mpegtsRef.current.detachMediaElement(); mpegtsRef.current.destroy() } catch {}
      mpegtsRef.current = null
    }
    if (hlsRef.current) {
      try { hlsRef.current.destroy() } catch {}
      hlsRef.current = null
    }
  }

  // When the file changes, resolve its URL and (re)load the correct engine.
  useEffect(() => {
    if (!open || !file) return
    let cancelled = false
    ;(async () => {
      destroyEngines()
      const src = rawUrl(file.path)
      setMediaUrl(src)
      setCurrent(0); setDuration(0); setBuffered(0); setError(null); setLoading(!!src); setPlaying(false); setRotate(0)

      if (!isVideo) {
        // Audio / other: plain media element src.
        const el = mediaRef.current
        if (el && src) { el.src = src; el.load() }
        return
      }

      const engine = videoEngineFor(file.name)
      setVideoEngine(engine)
      if (engine === 'unsupported') {
        setLoading(false)
        return
      }
      const video = videoRef.current
      if (!video || !src) return

      // P4: for MKV (and similar), verify the codecs before mounting native —
      // an MKV with HEVC/VP9/other is not Chromium-demuxable and would show a
      // vague black screen instead of the "unsupported" card. Only when the
      // sniff says h264+aac do we keep native.
      if (/\.(mkv|m4v|webm|mov|avi|mpg|mpeg|3gp)$/i.test(file.name)) {
        const sniffed = await sniffVideoEngine(src)
        if (cancelled) return
        if (sniffed === 'unsupported') {
          setVideoEngine('unsupported')
          setLoading(false)
          return
        }
        // native (or header says mp4/webm/mov): proceed to the <video> below.
      }

      if (engine === 'mpegts' && mpegts.isSupported()) {
        try {
          mpegtsRef.current = mpegts.createPlayer(
            { type: /\.flv$/i.test(file.name) ? 'flv' : 'mse', isLive: false, url: src, cors: true },
            { enableWorker: true, lazyLoad: true, lazyLoadMaxDuration: 180, lazyLoadRecoverDuration: 30, seekType: 'range', fixAudioTimestampGap: true, autoCleanupSourceBuffer: true }
          )
          mpegtsRef.current.attachMediaElement(video)
          mpegtsRef.current.load()
          mpegtsRef.current.on(mpegts.Events.ERROR, (_t: string, d: string) => {
            console.warn('[Preview] mpegts error:', _t, d)
            setError('Could not play this video — the stream or format is not supported')
            setLoading(false)
          })
          return
        } catch (err) {
          console.warn('[Preview] mpegts init failed, falling back to native:', err)
        }
      } else if (engine === 'hls' && Hls.isSupported()) {
        try {
          hlsRef.current = new Hls({ enableWorker: true })
          hlsRef.current.loadSource(src)
          hlsRef.current.attachMedia(video)
          hlsRef.current.on(Hls.Events.ERROR, (_e, data) => {
            if (data?.fatal) { setError('Could not play this HLS stream'); setLoading(false) }
          })
          return
        } catch (err) {
          console.warn('[Preview] hls init failed, falling back to native:', err)
        }
      }

      // Native fallback (mp4/m4v/webm/mov/ogv/mkv-h264 and any engine that
      // failed to init).
      setVideoEngine('native')
      video.src = src
      video.load()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file?.path, rawUrl])

  // Cleanup engines on unmount / close.
  useEffect(() => () => destroyEngines(), [])

  const step = useCallback((dir: 1 | -1) => {
    if (mediaFiles.length === 0 || !file) return
    const next = mediaFiles[(idx + dir + mediaFiles.length) % mediaFiles.length]
    if (next) onNavigate?.(next)
  }, [mediaFiles, idx, file, onNavigate])

  const handleLoadedMeta = () => {
    setLoading(false)
    const el = mediaRef.current
    if (el && isFinite(el.duration)) setDuration(el.duration)
  }
  const handleTime = () => {
    const el = mediaRef.current
    if (!el) return
    if (isFinite(el.currentTime)) setCurrent(el.currentTime)
    if (isFinite(el.duration)) setDuration(el.duration)
    try { if (el.buffered.length > 0 && isFinite(el.buffered.end(el.buffered.length - 1))) setBuffered(el.buffered.end(el.buffered.length - 1)) } catch {}
  }
  const togglePlay = () => {
    const el = mediaRef.current
    if (!el) return
    if (el.paused) el.play().then(() => setPlaying(true)).catch(() => setError('Playback failed — the host may be offline'))
    else { el.pause(); setPlaying(false) }
  }
  const seekTo = (secs: number) => {
    const el = mediaRef.current
    if (!el || !isFinite(secs)) return
    el.currentTime = secs
    setCurrent(secs)
  }
  const toggleMute = () => {
    const el = mediaRef.current
    if (!el) return
    el.muted = !el.muted
    setMuted(el.muted)
  }
  const setVol = (v: number) => {
    const el = mediaRef.current
    setVolume(v)
    if (el) { el.volume = v; el.muted = v === 0; setMuted(v === 0) }
  }
  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) containerRef.current.requestFullscreen().then(() => setFullscreen(true)).catch(() => {})
    else document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {})
  }
  const wakeControls = () => {
    setShowControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { if (playing) setShowControls(false) }, 2600)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); togglePlay() }
      else if (e.key === 'ArrowRight' && !isImage) seekTo(current + 10)
      else if (e.key === 'ArrowLeft' && !isImage) seekTo(current - 10)
      else if (e.key === 'ArrowRight' && isImage) step(1)
      else if (e.key === 'ArrowLeft' && isImage) step(-1)
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current, isImage, playing])

  if (!open || !file) return null
  const src = mediaUrl || ''
  const showPrevNext = mediaFiles.length > 1

  return (
    <div
      ref={containerRef}
      className='fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-xl animate-fade-in'
      onMouseMove={wakeControls}
      onDoubleClick={isVideo ? togglePlay : undefined}
    >
      {/* Top bar */}
      <div className={cn('flex items-center gap-2 px-4 py-3 transition-opacity', showControls || isImage ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        <span className='min-w-0 flex-1 truncate text-sm font-bold text-white/90' title={file.name}>{file.name}</span>
        <span className='shrink-0 text-[11px] text-white/40'>{file.size ? `${(file.size / 1048576).toFixed(1)} MB` : ''}</span>
        {isImage && <button onClick={() => setRotate((r) => r + 90)} className='rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white' title='Rotate'><RotateCw className='h-4 w-4' /></button>}
        {onDownload && (
          <button onClick={() => onDownload(file)} className='rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white' title='Download'>
            <Download className='h-4 w-4' />
          </button>
        )}
        {onOpenExternal && (
          <button onClick={() => onOpenExternal(file)} className='rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white' title='Open in browser'>
            <ExternalLink className='h-4 w-4' />
          </button>
        )}
        <button onClick={onClose} className='rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white' title='Close (Esc)'>
          <X className='h-5 w-5' />
        </button>
      </div>

      {/* Center: media or image */}
      <div className='relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-2'>
        {isImage ? (
          <img
            key={file.path + rotate}
            src={src}
            alt={file.name}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError('Could not load this image — the host may be offline') }}
            className='max-h-full max-w-full select-none rounded-lg object-contain shadow-2xl transition-transform duration-200'
            style={{ transform: `rotate(${rotate}deg)` }}
            draggable={false}
          />
        ) : isVideo || isAudio ? (
          isVideo && videoEngine === 'unsupported' ? (
            <div className='flex max-w-md flex-col items-center gap-3 rounded-2xl bg-white/5 p-10 text-center'>
              <div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white/70'><File className='h-8 w-8' /></div>
              <p className='text-sm font-bold text-white'>Can't play this format in-app</p>
              <p className='text-xs leading-relaxed text-white/50'>
                <span className='font-mono'>{file.name}</span> uses a container Chromium can't decode natively. Download it to play locally, or open it in your system browser/player.
              </p>
              <div className='mt-2 flex flex-wrap justify-center gap-2'>
                {onDownload && (
                  <button onClick={() => onDownload(file)} className='flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white'>
                    <Download className='h-4 w-4' /> Download
                  </button>
                )}
                {onOpenExternal && (
                  <button onClick={() => onOpenExternal(file)} className='flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20'>
                    <ExternalLink className='h-4 w-4' /> Open externally
                  </button>
                )}
              </div>
            </div>
          ) : isVideo ? (
            <video
              ref={videoRef}
              playsInline
              onClick={togglePlay}
              onLoadedMetadata={handleLoadedMeta}
              onTimeUpdate={handleTime}
              onPlaying={() => { setPlaying(true); setLoading(false) }}
              onPause={() => setPlaying(false)}
              onWaiting={() => setLoading(true)}
              onCanPlay={() => setLoading(false)}
              onError={() => {
                // mpegts/hls engines report their own errors; native <video>
                // failures mean codec/stream trouble.
                setLoading(false)
                if (!mpegtsRef.current && !hlsRef.current) {
                  setError('Could not play this video — the host may be offline or the format unsupported')
                }
              }}
              className='max-h-full max-w-full rounded-lg shadow-2xl outline-none'
            />
          ) : (
            <div className='flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl bg-white/5 p-10'>
              <button onClick={togglePlay} className='flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20' title='Play/Pause (Space)'>
                {playing ? <Pause className='h-8 w-8' /> : <Play className='ml-1 h-8 w-8' />}
              </button>
              <p className='max-w-full truncate text-xs text-white/60'>{file.name}</p>
              <audio ref={audioRef} src={src} onLoadedMetadata={handleLoadedMeta} onTimeUpdate={handleTime} onPlaying={() => { setPlaying(true); setLoading(false) }} onPause={() => setPlaying(false)} onCanPlay={() => setLoading(false)} onError={() => { setLoading(false); setError('Could not play this audio') }} className='hidden' />
            </div>
          )
        ) : (
          <div className='flex flex-col items-center gap-3 text-white/60'>
            <File className='h-16 w-16' />
            <p className='text-sm'>No preview for this file type</p>
            {onDownload && (
              <button onClick={() => onDownload(file)} className='mt-2 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white'>
                <Download className='h-4 w-4' /> Download
              </button>
            )}
          </div>
        )}

        {loading && (isVideo || isAudio || isImage) && !error && (
          <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
            <Loader2 className='h-8 w-8 animate-spin text-white/60' />
          </div>
        )}
        {error && (
          <div className='absolute inset-0 flex items-center justify-center bg-black/60'>
            <div className='max-w-sm rounded-2xl bg-white/5 px-6 py-5 text-center'>
              <p className='text-sm font-bold text-white'>{error}</p>
              <button onClick={onClose} className='mt-3 rounded-lg bg-white/10 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/20'>Close</button>
            </div>
          </div>
        )}

        {isImage && showPrevNext && (
          <>
            <button onClick={() => step(-1)} className='absolute left-3 rounded-full bg-black/40 p-2 text-white/80 backdrop-blur transition-colors hover:bg-black/70 hover:text-white' title='Previous (←)'>
              <ChevronLeft className='h-6 w-6' />
            </button>
            <button onClick={() => step(1)} className='absolute right-3 rounded-full bg-black/40 p-2 text-white/80 backdrop-blur transition-colors hover:bg-black/70 hover:text-white' title='Next (→)'>
              <ChevronRight className='h-6 w-6' />
            </button>
          </>
        )}
      </div>

      {/* Bottom control bar (video/audio) */}
      {(isVideo || isAudio) && (
        <div className={cn('px-4 pb-4 pt-1 transition-opacity', showControls ? 'opacity-100' : 'pointer-events-none opacity-0')}>
          <div className='group relative flex h-5 items-center'>
            <div className='relative h-1 w-full overflow-hidden rounded-full bg-white/15'>
              <div className='absolute left-0 top-0 h-full bg-white/25' style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
              <div className='absolute left-0 top-0 h-full bg-primary' style={{ width: `${duration ? (current / duration) * 100 : 0}%` }} />
            </div>
            <input
              type='range'
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              onChange={(e) => seekTo(parseFloat(e.target.value))}
              className='absolute inset-0 h-5 w-full cursor-pointer appearance-none bg-transparent opacity-0'
              aria-label='Seek'
            />
          </div>
          <div className='mt-1 flex items-center gap-3'>
            <button onClick={togglePlay} className='rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20' title='Play/Pause (Space)'>
              {playing ? <Pause className='h-4 w-4' /> : <Play className='ml-0.5 h-4 w-4' />}
            </button>
            <span className='font-mono text-[11px] tabular-nums text-white/70'>{fmtTime(current)} / {fmtTime(duration)}</span>
            <div className='flex flex-1 items-center justify-end gap-2'>
              <button onClick={toggleMute} className='rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white' title='Mute'>
                {muted ? <VolumeX className='h-4 w-4' /> : <Volume2 className='h-4 w-4' />}
              </button>
              <input
                type='range'
                min={0} max={1} step={0.05} value={muted ? 0 : volume}
                onChange={(e) => setVol(parseFloat(e.target.value))}
                className='h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/20 accent-primary'
                aria-label='Volume'
              />
              <button onClick={toggleFullscreen} className='rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white' title='Fullscreen'>
                {fullscreen ? <Minimize className='h-4 w-4' /> : <Maximize className='h-4 w-4' />}
              </button>
            </div>
          </div>
        </div>
      )}

      {isImage && showPrevNext && (
        <div className='pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 font-mono text-[11px] text-white/70 backdrop-blur'>
          {Math.max(idx + 1, 0)} / {mediaFiles.length}
        </div>
      )}
    </div>
  )
}
