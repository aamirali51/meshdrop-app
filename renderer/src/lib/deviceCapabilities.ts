// Compute what THIS browser can actually play, for watch-party capability
// negotiation. The host uses this declaration to decide direct-play vs remux
// vs refuse, so under-declaring costs a remux (fine) and over-declaring costs a
// black screen (not fine). Conservative wins.

import mpegts from 'mpegts.js'
import Hls from 'hls.js'

export interface DeviceCapabilities {
  videoCodecs: string[]
  audioCodecs: string[]
  containers: string[]
  protocols: string[]
}

function probeVideo(video: HTMLVideoElement, mime: string, codec: string): boolean {
  try {
    return video.canPlayType(`${mime}; codecs="${codec}"`) !== ''
  } catch {
    return false
  }
}

// One shared <video> element for probing; created lazily so SSR/tests don't
// touch document until first use.
let probeVideoEl: HTMLVideoElement | null = null
function videoEl(): HTMLVideoElement | null {
  if (typeof document === 'undefined') return null
  if (!probeVideoEl) {
    probeVideoEl = document.createElement('video')
    probeVideoEl.muted = true
  }
  return probeVideoEl
}

function mseSupports(mimeWithCodecs: string): boolean {
  try {
    return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mimeWithCodecs)
  } catch {
    return false
  }
}

export function computeDeviceCapabilities(): DeviceCapabilities {
  const v = videoEl()
  const caps: DeviceCapabilities = {
    videoCodecs: [],
    audioCodecs: [],
    containers: [],
    protocols: []
  }
  if (!v) return caps

  // Video codecs — the browser must report it can play the codec in a standard
  // container. MSE support matters for the mpegts.js path.
  const videoTests: Array<[string, string]> = [
    ['video/mp4', 'avc1.64001f'],
    ['video/mp4', 'hev1.1.6.L93.B0'],
    ['video/webm', 'vp9'],
    ['video/webm', 'vp8'],
    ['video/mp4', 'av01.0.05M.08']
  ]
  for (const [mime, codec] of videoTests) {
    if (probeVideo(v, mime, codec)) {
      // Map the MSE codec string to our canonical vocabulary.
      if (codec.startsWith('avc1')) caps.videoCodecs.push('h264')
      else if (codec.startsWith('hev1')) caps.videoCodecs.push('hevc')
      else if (codec.startsWith('vp9')) caps.videoCodecs.push('vp9')
      else if (codec.startsWith('vp8')) caps.videoCodecs.push('vp8')
      else if (codec.startsWith('av01')) caps.videoCodecs.push('av1')
    }
  }

  // Audio codecs.
  const audioTests: Array<[string, string]> = [
    ['audio/mp4', 'mp4a.40.2'],
    ['audio/mpeg', ''],
    ['audio/mp4', 'ac-3'],
    ['audio/mp4', 'ec-3'],
    ['audio/opus', '']
  ]
  for (const [mime, codec] of audioTests) {
    try {
      const ok = codec
        ? v.canPlayType(`${mime}; codecs="${codec}"`) !== ''
        : v.canPlayType(mime) !== ''
      if (ok) {
        if (mime === 'audio/mp4' && codec === 'mp4a.40.2') caps.audioCodecs.push('aac')
        else if (mime === 'audio/mpeg') caps.audioCodecs.push('mp3')
        else if (mime === 'audio/mp4' && codec === 'ac-3') caps.audioCodecs.push('ac3')
        else if (mime === 'audio/mp4' && codec === 'ec-3') caps.audioCodecs.push('eac3')
        else if (mime === 'audio/opus') caps.audioCodecs.push('opus')
      }
    } catch {}
  }

  // Containers — what this browser can demux. mpegts.js gives us TS/FLV (and
  // MSE), hls.js gives HLS; native gives mp4/webm.
  const nativeMp4 = mseSupports('video/mp4; codecs="avc1.64001f"') || probeVideo(v, 'video/mp4', 'avc1.64001f')
  const nativeWebm = mseSupports('video/webm; codecs="vp9"') || probeVideo(v, 'video/webm', 'vp9')
  if (nativeMp4) caps.containers.push('mp4')
  if (nativeWebm) caps.containers.push('webm')

  // mpegts.js demuxes MPEG-TS and FLV in the browser.
  let hasMpegts = false
  try {
    // mpegts.js is imported as a module; avoid a hard dependency here — the
    // modal already imports it, so this is a light capability probe.
    hasMpegts = typeof mpegts !== 'undefined' && !!mpegts && typeof mpegts.isSupported === 'function' && mpegts.isSupported()
  } catch {
    hasMpegts = false
  }
  if (hasMpegts) {
    caps.containers.push('ts', 'flv')
    caps.protocols.push('mpegts')
  }

  let hasHls = false
  try {
    hasHls = typeof Hls !== 'undefined' && !!Hls && Hls.isSupported()
  } catch {
    hasHls = false
  }
  if (hasHls) caps.protocols.push('hls')

  if (nativeMp4 || nativeWebm || hasMpegts) caps.protocols.push('mse')

  // Dedupe (canPlayType can report overlapping results).
  caps.videoCodecs = [...new Set(caps.videoCodecs)]
  caps.audioCodecs = [...new Set(caps.audioCodecs)]
  caps.containers = [...new Set(caps.containers)]
  caps.protocols = [...new Set(caps.protocols)]

  return caps
}
