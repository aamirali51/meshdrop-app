import { requireNativeComponent, type ViewProps } from 'react-native'

export interface NativeVideoViewProps extends ViewProps {
  src?: string
  /** Path to serve over the loopback byte-range server (MKV or progressive). */
  loopbackSrc?: string
  /**
   * True final size in bytes of the file being progressively downloaded. When
   * > 0 the native loopback server runs in "grow-aware" mode: it reports this
   * total in Content-Range and waits (bounded) for not-yet-written ranges, so
   * ExoPlayer sees the real duration instead of failing on a short file.
   */
  loopbackTotal?: number
  /**
   * Bytes durably written so far. The JS advances this after each chunk lands
   * on disk; the native loopback server never serves past it (prevents torn
   * reads at the write frontier → ExoPlayer Invalid NAL length).
   */
  loopbackWritten?: number
  /** Set true once the full file is on disk (lets waiting reads proceed). */
  streamComplete?: boolean
  paused?: boolean
  muted?: boolean
  /** Playback volume 0..1 (ignored while muted). */
  volume?: number
  /** Playback speed (e.g. 1.0, 1.5, 2.0). */
  rate?: number
  seek?: number
  onReady?: (event: any) => void
  onProgress?: (event: any) => void
  onEnd?: (event: any) => void
  onError?: (event: any) => void
}

export const NativeVideoView = requireNativeComponent<NativeVideoViewProps>('MeshDropVideoView')
