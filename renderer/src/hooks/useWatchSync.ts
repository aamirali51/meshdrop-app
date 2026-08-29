import { useCallback, useEffect, useRef } from 'react'

// Three-tier drift correction for synchronized watch-party playback.
//
// Tier 1 — clock-offset expected position: the host stamps every sync with
//   timestampMs; the follower computes what the host's position *should be
//   now* (positionSec + elapsed) instead of trusting the stale value.
// Tier 2 — gradual rate correction (desktop only): for drift in
//   [MIN_RATE_DRIFT, SNAP_THRESHOLD) the follower nudges playbackRate to
//   0.95/1.05 until it converges, instead of an audible jump-cut.
// Tier 3 — hard resync: drift >= SNAP_THRESHOLD snaps currentTime.
//
// The host is the authority: followers apply corrections, the host broadcasts.
// Returns an apply function to call with every incoming WATCH_STATE_SYNC.

export const SNAP_THRESHOLD = 2.0
const RATE_DRIFT_MIN = 0.25
const RATE_CATCHUP = 1.05
const RATE_SLOWDOWN = 0.95
const RATE_RESET = 1.0

interface UseWatchSyncOptions {
  /** video element ref (desktop) */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** whether this client is the host (hosts never self-correct) */
  isHost: boolean
  /** disable sync entirely (e.g. manual playback toggle) */
  enabled?: boolean
  /** called after a hard resync with the drift magnitude (for metrics) */
  onResync?: (driftSec: number) => void
}

export function useWatchSync({ videoRef, isHost, enabled = true, onResync }: UseWatchSyncOptions) {
  const lastSyncAtRef = useRef(0)
  const rateRef = useRef(RATE_RESET)

  // Reset any rate adjustment when the caller unmounts or disables sync.
  useEffect(() => {
    if (!enabled || isHost) {
      if (videoRef.current) videoRef.current.playbackRate = RATE_RESET
      rateRef.current = RATE_RESET
    }
  }, [enabled, isHost, videoRef])

  const applySync = useCallback(
    (state: any) => {
      const video = videoRef.current
      if (!video || !state || !enabled || isHost) return

      // Seek is authoritative: always snap (no rate correction on a jump).
      if (state.action === 'seek') {
        const pos = Number(state.positionSec)
        if (Number.isFinite(pos)) {
          video.currentTime = pos
          if (video.paused) video.play().catch(() => {})
        }
        return
      }

      const now = Date.now()
      const sentAt = Number(state.timestampMs) || 0
      // Playback advances between when the host sent this and now.
      const elapsedSec = sentAt > 0 ? (now - sentAt) / 1000 : 0
      const expectedPos = Number(state.positionSec) + (state.action === 'play' ? elapsedSec : 0)
      if (!Number.isFinite(expectedPos)) return

      // Apply play/pause first so rate logic only runs while playing.
      if (state.action === 'play') {
        if (video.paused) video.play().catch(() => {})
      } else if (state.action === 'pause') {
        if (!video.paused) video.pause()
      }

      // Drift = local position vs the host's expected position.
      const drift = video.currentTime - expectedPos
      const absDrift = Math.abs(drift)

      if (absDrift >= SNAP_THRESHOLD) {
        // Tier 3 — hard resync (visible jump, necessary for large drift).
        video.currentTime = expectedPos
        video.playbackRate = RATE_RESET
        rateRef.current = RATE_RESET
        onResync?.(absDrift)
        return
      }

      if (state.action === 'pause') {
        // While paused, small drift is corrected silently by snapping the
        // paused position (no audible jump since nothing is playing).
        if (absDrift >= RATE_DRIFT_MIN) {
          video.currentTime = expectedPos
        }
        return
      }

      // Tier 2 — gradual rate correction for sub-threshold drift.
      if (absDrift >= RATE_DRIFT_MIN) {
        // Throttle rate changes to ~4/s so we don't fight the encoder.
        if (now - lastSyncAtRef.current > 250) {
          lastSyncAtRef.current = now
          const targetRate = drift > 0 ? RATE_SLOWDOWN : RATE_CATCHUP
          if (rateRef.current !== targetRate) {
            video.playbackRate = targetRate
            rateRef.current = targetRate
          }
        }
      } else if (rateRef.current !== RATE_RESET) {
        video.playbackRate = RATE_RESET
        rateRef.current = RATE_RESET
      }
    },
    [videoRef, enabled, isHost, onResync]
  )

  return applySync
}
