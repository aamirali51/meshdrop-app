package com.meshdropmobile

import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

/**
 * Reports what THIS device can actually play, for watch-party capability
 * negotiation. The host uses the declaration to decide direct-play vs remux vs
 * refuse, so under-declaring costs a remux (fine) and over-declaring costs a
 * black screen (not fine). Conservative wins.
 *
 * The probe walks MediaCodecList for HARDWARE video decoders only: every
 * Android ships software decoders that claim codecs they cannot decode at
 * watchable speed, and a watch party that "works" at 2 fps is a black screen
 * with a timer. Audio decoders are cheaper, so any decoder counts there.
 */
class MeshDropCapabilitiesModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "MeshDropCapabilities"

  // MIME -> canonical vocabulary (matches engine/watchCapabilities.js).
  private val VIDEO_MIME_TO_CODEC = mapOf(
      MediaFormat.MIMETYPE_VIDEO_AVC to "h264",
      MediaFormat.MIMETYPE_VIDEO_HEVC to "hevc",
      MediaFormat.MIMETYPE_VIDEO_VP9 to "vp9",
      MediaFormat.MIMETYPE_VIDEO_VP8 to "vp8",
      MediaFormat.MIMETYPE_VIDEO_AV1 to "av1",
      MediaFormat.MIMETYPE_VIDEO_MPEG4 to "mpeg4",
      MediaFormat.MIMETYPE_VIDEO_MPEG2 to "mpeg2"
  )

  private val AUDIO_MIME_TO_CODEC = mapOf(
      MediaFormat.MIMETYPE_AUDIO_AAC to "aac",
      MediaFormat.MIMETYPE_AUDIO_MPEG to "mp3",
      MediaFormat.MIMETYPE_AUDIO_AC3 to "ac3",
      MediaFormat.MIMETYPE_AUDIO_EAC3 to "eac3",
      MediaFormat.MIMETYPE_AUDIO_DTS to "dts",
      MediaFormat.MIMETYPE_AUDIO_OPUS to "opus",
      MediaFormat.MIMETYPE_AUDIO_VORBIS to "vorbis",
      MediaFormat.MIMETYPE_AUDIO_FLAC to "flac"
  )

  // Containers this device's demuxers handle. Android's platform demuxers
  // cover these; a phone cannot demux a container not in this list.
  private val CONTAINERS = listOf("mp4", "mkv", "webm", "ts", "avi")

  @ReactMethod
  fun get(promise: Promise) {
    try {
      val result = Arguments.createMap()

      val videoCodecs = Arguments.createArray()
      val audioCodecs = Arguments.createArray()
      val seenVideo = HashSet<String>()
      val seenAudio = HashSet<String>()

      val codecList = MediaCodecList(MediaCodecList.ALL_CODECS)
      for (info in codecList.codecInfos) {
        if (info.isEncoder) continue
        val isHardware =
            info.isHardwareAccelerated ||
                (info.name ?: "").startsWith("c2.") && (info.name ?: "").contains(".hw.") ||
                (info.name ?: "").startsWith("omx.") && (info.name ?: "").contains(".hw.")

        for (type in info.supportedTypes) {
          val canonical = VIDEO_MIME_TO_CODEC[type]
          if (canonical != null && isHardware && seenVideo.add(canonical)) {
            videoCodecs.pushString(canonical)
            continue
          }
          val audio = AUDIO_MIME_TO_CODEC[type]
          if (audio != null && seenAudio.add(audio)) {
            audioCodecs.pushString(audio)
          }
        }
      }

      // Android always has a baseline AVC decoder; if the probe found nothing
      // hardware-backed, refuse to declare rather than let the host guess.
      result.putArray("videoCodecs", videoCodecs)
      result.putArray("audioCodecs", audioCodecs)

      val containers = Arguments.createArray()
      for (c in CONTAINERS) containers.pushString(c)
      result.putArray("containers", containers)

      // Android's native player demuxes TS directly; no mpegts.js here.
      val protocols = Arguments.createArray()
      protocols.pushString("mpegts")
      result.putArray("protocols", protocols)

      promise.resolve(result)
    } catch (e: Exception) {
      // Never crash the bridge over a codec probe — an empty declaration
      // makes the host refuse with a reason, which is the safe failure.
      promise.resolve(Arguments.createMap())
    }
  }
}
