import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Dimensions,
} from 'react-native'
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react-native'
import { NativeVideoView } from './NativeVideoView'
import { useTheme, fonts } from '../theme'

const { width: winWidth, height: winHeight } = Dimensions.get('window')

const RATES = [1, 1.25, 1.5, 2]

export interface MediaPlayerHandle {
  applyExternal: (action: 'play' | 'pause' | 'seek', positionSec?: number) => void
  getCurrentTime: () => number
}

interface MediaPlayerProps {
  src?: string
  loopbackSrc?: string
  /** True final size (bytes) when the file is being progressively downloaded;
   *  makes the native loopback server grow-aware. */
  loopbackTotal?: number
  /** Bytes durably written so far (advanced by the JS after each chunk). */
  loopbackWritten?: number
  /** Set true once the full progressive file is on disk. */
  streamComplete?: boolean
  title?: string
  subtitle?: string
  onClose?: () => void
  headerRight?: React.ReactNode
  footer?: React.ReactNode
  onSeek?: (seconds: number) => void
  onPlayChange?: (playing: boolean, seconds: number) => void
  onEnd?: () => void
  onError?: (message: string) => void
  onDuration?: (seconds: number) => void
  onFullscreenChange?: (fullscreen: boolean) => void
}

function fmt(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '00:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** A drag-to-seek bar that reports a 0..1 fraction on release. */
function DragBar({
  value,
  accent,
  track,
  onScrub,
  onScrubEnd,
  height = 4,
  thumbSize = 14,
}: {
  value: number
  accent: string
  track: string
  onScrub: (fraction: number) => void
  onScrubEnd: (fraction: number) => void
  height?: number
  thumbSize?: number
}) {
  const [width, setWidth] = useState(0)
  const fraction = Math.max(0, Math.min(1, value))

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const f = clamp((evt.nativeEvent.locationX) / width)
        onScrub(f)
      },
      onPanResponderMove: (evt) => {
        const f = clamp(evt.nativeEvent.locationX / width)
        onScrub(f)
      },
      onPanResponderRelease: (evt) => {
        const f = clamp(evt.nativeEvent.locationX / width)
        onScrubEnd(f)
      },
      onPanResponderTerminate: (evt) => {
        const f = clamp(evt.nativeEvent.locationX / width)
        onScrubEnd(f)
      },
    })
  ).current

  function clamp(x: number) {
    if (width <= 0) return 0
    return Math.max(0, Math.min(1, x / width))
  }

  return (
    <View
      style={[styles.dragBarHit, { height: thumbSize + 8 }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      {...responder.panHandlers}
    >
      <View style={[styles.dragBarTrack, { backgroundColor: track, height }]}>
        <View
          style={[
            styles.dragBarFill,
            { backgroundColor: accent, height, width: `${fraction * 100}%` },
          ]}
        />
        <View
          style={[
            styles.dragBarThumb,
            {
              backgroundColor: '#FFFFFF',
              borderColor: accent,
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              left: `${fraction * 100}%`,
              marginLeft: -thumbSize / 2,
            },
          ]}
        />
      </View>
    </View>
  )
}

export const MediaPlayer = forwardRef<MediaPlayerHandle, MediaPlayerProps>(function MediaPlayer(
  {
    src,
    loopbackSrc,
    loopbackTotal,
    loopbackWritten,
    streamComplete,
    title,
    subtitle,
    onClose,
    headerRight,
    footer,
    onSeek,
    onPlayChange,
    onEnd,
    onError,
    onDuration,
    onFullscreenChange,
  },
  ref
) {
  const { theme } = useTheme()
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [rate, setRate] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubPreview, setScrubPreview] = useState(0)
  const [seekTarget, setSeekTarget] = useState(0)

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPlayingRef = useRef(isPlaying)
  const currentTimeRef = useRef(currentTime)
  isPlayingRef.current = isPlaying
  currentTimeRef.current = currentTime

  const setDurationSafe = useCallback(
    (sec: number) => {
      if (sec > 0 && Math.abs(sec - duration) > 0.5) {
        setDuration(sec)
        onDuration?.(sec)
      }
    },
    [duration, onDuration]
  )

  const resetControlsTimer = useCallback(() => {
    setShowControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowControls(false), 4000)
  }, [])

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  const togglePlay = useCallback(() => {
    resetControlsTimer()
    const next = !isPlayingRef.current
    setIsPlaying(next)
    onPlayChange?.(next, currentTimeRef.current)
  }, [onPlayChange, resetControlsTimer])

  const doSeek = useCallback(
    (sec: number) => {
      const clamped = Math.max(0, Math.min(duration || sec, sec))
      setCurrentTime(clamped)
      setSeekTarget(clamped)
      onSeek?.(clamped)
    },
    [duration, onSeek]
  )

  const seekDelta = useCallback(
    (delta: number) => {
      resetControlsTimer()
      doSeek(currentTimeRef.current + delta)
    },
    [doSeek, resetControlsTimer]
  )

  const toggleMute = useCallback(() => {
    resetControlsTimer()
    setMuted((m) => !m)
  }, [resetControlsTimer])

  const cycleRate = useCallback(() => {
    resetControlsTimer()
    setRate((r) => {
      const idx = RATES.indexOf(r)
      return RATES[(idx + 1) % RATES.length]
    })
  }, [resetControlsTimer])

  const toggleFullscreen = useCallback(() => {
    resetControlsTimer()
    setFullscreen((f) => {
      onFullscreenChange?.(!f)
      return !f
    })
  }, [onFullscreenChange, resetControlsTimer])

  useImperativeHandle(
    ref,
    () => ({
      applyExternal(action, positionSec) {
        if (action === 'play') {
          setIsPlaying(true)
          if (typeof positionSec === 'number') doSeek(positionSec)
        } else if (action === 'pause') {
          setIsPlaying(false)
          if (typeof positionSec === 'number') doSeek(positionSec)
        } else if (action === 'seek') {
          if (typeof positionSec === 'number') doSeek(positionSec)
        }
      },
      getCurrentTime: () => currentTimeRef.current,
    }),
    [doSeek]
  )

  const progressFraction = duration > 0 ? currentTime / duration : 0
  const displayTime = isScrubbing ? scrubPreview : currentTime

  const hasSource = Boolean(src || loopbackSrc)

  return (
    <View style={styles.root}>
      {/* Video viewport */}
      <View style={styles.viewport} onStartShouldSetResponder={() => false}>
        {hasSource ? (
          <NativeVideoView
            style={StyleSheet.absoluteFillObject}
            src={src}
            loopbackSrc={loopbackSrc || undefined}
            loopbackTotal={loopbackTotal && loopbackTotal > 0 ? loopbackTotal : undefined}
            loopbackWritten={loopbackWritten && loopbackWritten > 0 ? loopbackWritten : undefined}
            streamComplete={streamComplete || undefined}
            paused={!isPlaying}
            muted={muted}
            volume={volume}
            rate={rate}
            seek={seekTarget}
            onReady={(e: any) => {
              const d = e?.nativeEvent?.duration
              if (d > 0) setDurationSafe(d)
            }}
            onProgress={(e: any) => {
              const t = e?.nativeEvent?.currentTime
              if (typeof t === 'number' && !isScrubbing) {
                setCurrentTime(t)
                currentTimeRef.current = t
              }
              const d = e?.nativeEvent?.duration
              if (d > 0) setDurationSafe(d)
            }}
            onEnd={() => {
              setIsPlaying(false)
              onEnd?.()
            }}
            onError={(e: any) => {
              onError?.(String(e?.nativeEvent?.error || 'Playback failed'))
            }}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{title || 'Loading media…'}</Text>
          </View>
        )}

        {/* Tap layer to toggle controls */}
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFillObject}
          onPress={resetControlsTimer}
        />

        {/* Controls overlay */}
        {showControls && hasSource && (
          <View style={styles.controls} pointerEvents="box-none">
            {/* Center play/pause + seek */}
            <View style={styles.centerRow} pointerEvents="box-none">
              <TouchableOpacity style={styles.seekBtn} onPress={() => seekDelta(-10)}>
                <RotateCcw size={22} color="#F8FAFC" />
                <Text style={styles.seekText}>10s</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.bigPlay} onPress={togglePlay}>
                {isPlaying ? (
                  <Pause size={30} color="#0B0F17" />
                ) : (
                  <Play size={30} color="#0B0F17" style={{ marginLeft: 3 }} />
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.seekBtn} onPress={() => seekDelta(10)}>
                <RotateCw size={22} color="#F8FAFC" />
                <Text style={styles.seekText}>10s</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom bar */}
            <View style={styles.bottomBar}>
              {/* Scrubber */}
              <DragBar
                value={isScrubbing ? scrubPreview / (duration || 1) : progressFraction}
                accent={theme.accent}
                track="rgba(255,255,255,0.22)"
                onScrub={(f) => {
                  setIsScrubbing(true)
                  setScrubPreview(f * (duration || 0))
                }}
                onScrubEnd={(f) => {
                  const sec = f * (duration || 0)
                  setScrubPreview(sec)
                  setIsScrubbing(false)
                  doSeek(sec)
                }}
              />

              {/* Time + actions */}
              <View style={styles.actionRow}>
                <Text style={styles.timeText}>
                  {fmt(displayTime)} / {fmt(duration)}
                </Text>

                <View style={styles.actions}>
                  {/* Volume slider */}
                  <TouchableOpacity style={styles.iconBtn} onPress={toggleMute}>
                    {muted || volume === 0 ? (
                      <VolumeX size={18} color="#F8FAFC" />
                    ) : volume < 0.5 ? (
                      <Volume1 size={18} color="#F8FAFC" />
                    ) : (
                      <Volume2 size={18} color="#F8FAFC" />
                    )}
                  </TouchableOpacity>
                  <View style={styles.volumeWrap}>
                    <DragBar
                      value={muted ? 0 : volume}
                      accent={theme.accent}
                      track="rgba(255,255,255,0.22)"
                      height={3}
                      thumbSize={10}
                      onScrub={(f) => {
                        setVolume(f)
                        setMuted(false)
                      }}
                      onScrubEnd={(f) => {
                        setVolume(f)
                        setMuted(false)
                      }}
                    />
                  </View>

                  {/* Speed */}
                  <TouchableOpacity style={styles.rateBtn} onPress={cycleRate}>
                    <Text style={styles.rateText}>{rate}x</Text>
                  </TouchableOpacity>

                  {/* Fullscreen */}
                  <TouchableOpacity style={styles.iconBtn} onPress={toggleFullscreen}>
                    {fullscreen ? (
                      <Minimize2 size={18} color="#F8FAFC" />
                    ) : (
                      <Maximize2 size={18} color="#F8FAFC" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Footer (hidden in fullscreen) */}
      {footer && !fullscreen ? footer : null}
    </View>
  )
})

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#06090E',
  },
  viewport: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B0F17',
  },
  empty: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  controls: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  centerRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 28,
  },
  seekBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    padding: 8,
  },
  seekText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  bigPlay: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  bottomBar: {
    gap: 10,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  dragBarHit: {
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  dragBarTrack: {
    borderRadius: 2,
    position: 'relative',
    alignSelf: 'stretch',
  },
  dragBarFill: {
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  dragBarThumb: {
    position: 'absolute',
    top: -5,
    borderWidth: 2,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
    color: '#CBD5E1',
    fontFamily: fonts?.mono || 'monospace',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 4,
  },
  volumeWrap: {
    width: 72,
  },
  rateBtn: {
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  rateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F8FAFC',
    fontFamily: fonts?.mono || 'monospace',
  },
})
