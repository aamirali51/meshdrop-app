package com.meshdropmobile

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.widget.FrameLayout
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.RCTEventEmitter
import java.io.File

/**
 * Progressive media player backed by ExoPlayer/Media3.
 *
 * P4 replaces the legacy VideoView/MediaPlayer so .mkv plays via Media3's
 * built-in MatroskaExtractor. Two source modes:
 *   - MP4 / head-metadata files: a LOCAL FILE PATH (file:// or absolute). The
 *     direct file DataSource keeps the growing-.part watch-party flow working.
 *   - MKV / tail-metadata files: an HTTP URL served by LoopbackMediaServer so
 *     Media3 can issue byte-range (206) reads against a length-aware source —
 *     a growing .part has no stable length and would stall Matroska seeking.
 * The JS side decides which src to hand over after sniffing the container.
 */
class MeshDropVideoView(context: Context) : FrameLayout(context), Player.Listener {

    private val playerView: PlayerView = PlayerView(context).apply {
        useController = false
        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
    }
    private var player: ExoPlayer? = null
    private var loopback: LoopbackMediaServer? = null
    private var loopbackPath: String? = null
    private var loopbackTotal: Long = -1L
    // Latest durable-watermark the JS reported. Applied to any newly created
    // loopback server regardless of React prop ordering (loopbackWritten may
    // arrive before loopbackSrc).
    private var loopbackWritten: Long = -1L
    private var isPrepared = false
    private var isPaused = false
    private var isMuted = false
    private var volume = 1f
    private var playbackRate = 1f
    private var sourcePath: String? = null
    private var pendingSeekPositionMs: Long = -1
    private var videoWidth = 0
    private var videoHeight = 0
    private var lastReportedSec = -1.0

    private val handler = Handler(Looper.getMainLooper())
    private val progressRunnable = object : Runnable {
        override fun run() {
            if (isPrepared) emitProgress()
            handler.postDelayed(this, 500)
        }
    }

    init {
        val params = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT).apply {
            gravity = Gravity.CENTER
        }
        addView(playerView, params)
        handler.post(progressRunnable)
    }

    private fun ensurePlayer(): ExoPlayer {
        val existing = player
        if (existing != null) return existing
        val exo = ExoPlayer.Builder(context)
            .setMediaSourceFactory(
                androidx.media3.exoplayer.source.DefaultMediaSourceFactory(context)
                    .setDataSourceFactory(DefaultDataSource.Factory(context, httpDataSourceFactory()))
            )
            .build()
        exo.addListener(this)
        exo.setVideoScalingMode(C.VIDEO_SCALING_MODE_SCALE_TO_FIT)
        playerView.player = exo
        player = exo
        return exo
    }

    private fun httpDataSourceFactory(): DefaultHttpDataSource.Factory {
        // Loopback-only media server: no cross-network traffic, no auth needed.
        return DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(false)
            .setConnectTimeoutMs(10000)
            .setReadTimeoutMs(30000)
    }

    fun setSrc(src: String?) {
        if (src.isNullOrEmpty()) {
            releasePlayer()
            sourcePath = null
            isPrepared = false
            return
        }
        if (src == sourcePath && player != null) return
        sourcePath = src
        isPrepared = false
        lastReportedSec = -1.0

        val exo = ensurePlayer()
        try {
            val isHttp = src.startsWith("http://") || src.startsWith("https://")
            val uri: Uri = when {
                isHttp || src.startsWith("content://") -> Uri.parse(src)
                src.startsWith("file://") -> Uri.parse(src)
                else -> Uri.fromFile(File(src))
            }
            // MKV over HTTP goes through the loopback server for byte-range
            // reads; plain files use the local file DataSource directly.
            val source = if (isHttp) {
                ProgressiveMediaSource.Factory(httpDataSourceFactory()).createMediaSource(MediaItem.fromUri(uri))
            } else {
                ProgressiveMediaSource.Factory(DefaultDataSource.Factory(context)).createMediaSource(MediaItem.fromUri(uri))
            }
            exo.setMediaSource(source)
            exo.prepare()
            exo.playWhenReady = !isPaused
        } catch (e: Exception) {
            Log.e("MeshDropVideo", "Error setting media source: ${e.message}")
            emitEvent("onError", Arguments.createMap().apply {
                putString("error", e.message ?: "Failed to open video source")
            })
        }
    }

    fun setLoopbackSrc(filePath: String?) {
        if (filePath.isNullOrEmpty()) {
            loopbackPath = null
        } else {
            loopbackPath = filePath
        }
        configureSource()
    }

    /** Declares the file's true final size. A positive value puts the loopback
     *  server in grow-aware mode: Content-Range reports the real total and
     *  range reads wait (bounded) for bytes the JS writer hasn't landed yet,
     *  instead of failing with a short/source error (the >1 GB MP4 issue).
     *  <=0 switches back to complete-file mode. */
    fun setLoopbackTotal(totalBytes: Double) {
        loopbackTotal = totalBytes.toLong()
        configureSource()
    }

    /** Records the durable high-water mark and applies it to the active server
     *  (or to the next one created, if the source prop hasn't landed yet). */
    fun setLoopbackWritten(bytes: Double) {
        loopbackWritten = bytes.toLong()
        loopback?.setCommittedBytes(loopbackWritten)
    }

    /** Reconciles the current source props into one action:
     *  - no path            -> release
     *  - path, no total     -> complete-file loopback (watch-party MKV mode)
     *  - path, total > 0    -> grow-aware loopback (progressive shared-folder)
     */
    private fun configureSource() {
        val rawPath = loopbackPath
        if (rawPath == null) {
            stopLoopback()
            sourcePath = null
            isPrepared = false
            return
        }
        // The JS side may hand us either "file:///..." or a raw absolute path.
        // LoopbackMediaServer reads with java.io.File, which needs the raw form.
        val path = rawPath.removePrefix("file://")
        val desiredTotal: Long? = if (loopbackTotal > 0) loopbackTotal else null
        // Keep the running server when it already serves the same path with the
        // same total semantics — avoids a stop/restart churn on prop flushes.
        val running = loopback
        if (running != null && running.path == path && running.expectedTotal == desiredTotal) return
        try {
            stopLoopback()
            val server = LoopbackMediaServer(path, desiredTotal ?: -1L)
            // Re-apply any durable watermark the JS already reported (React may
            // deliver loopbackWritten before loopbackSrc).
            if (loopbackWritten > 0) server.setCommittedBytes(loopbackWritten)
            loopback = server
            setSrc(server.baseUrl)
        } catch (e: Exception) {
            Log.e("MeshDropVideo", "Loopback start failed: ${e.message}")
            emitEvent("onError", Arguments.createMap().apply {
                putString("error", e.message ?: "Failed to start media server")
            })
        }
    }

    /** Notifies an active grow-aware loopback server that the full file is now
     *  on disk (lets any waiting range-read proceed immediately). No-op when
     *  the source is a complete file. */
    fun markLoopbackComplete() {
        loopback?.markComplete()
    }

    fun setPaused(paused: Boolean) {
        isPaused = paused
        player?.let { p ->
            if (paused) {
                if (p.isPlaying) p.pause()
            } else {
                if (!p.isPlaying) p.play()
            }
        }
    }

    fun setMuted(muted: Boolean) {
        isMuted = muted
        player?.volume = if (muted) 0f else volume
    }

    fun setVolume(value: Double) {
        volume = value.toFloat().coerceIn(0f, 1f)
        player?.volume = if (isMuted) 0f else volume
    }

    fun setPlaybackRate(rate: Double) {
        playbackRate = rate.toFloat().coerceIn(0.25f, 2f)
        player?.setPlaybackSpeed(playbackRate)
    }

    fun seekToPosition(seconds: Double) {
        val ms = (seconds * 1000).toLong()
        player?.let { p ->
            if (isPrepared) {
                p.seekTo(ms)
                emitProgress()
            } else {
                pendingSeekPositionMs = ms
            }
        }
    }

    override fun onEvents(player: Player, events: Player.Events) {
        if (events.contains(Player.EVENT_PLAYBACK_STATE_CHANGED)) {
            if (player.playbackState == Player.STATE_READY && !isPrepared) {
                isPrepared = true
                val durationSec = player.duration.takeIf { it > 0 }?.toDouble()?.div(1000.0) ?: 0.0
                videoWidth = player.videoSize?.width ?: 0
                videoHeight = player.videoSize?.height ?: 0
                emitEvent("onReady", Arguments.createMap().apply {
                    putDouble("duration", durationSec)
                    putInt("naturalWidth", videoWidth)
                    putInt("naturalHeight", videoHeight)
                })
                if (pendingSeekPositionMs >= 0) {
                    player.seekTo(pendingSeekPositionMs)
                    pendingSeekPositionMs = -1
                }
            }
        }
    }

    override fun onPlayerError(error: PlaybackException) {
        val code = error.errorCodeName
        val msg = error.message ?: ""
        Log.e("MeshDropVideo", "ExoPlayer error: code=$code ($error.errorCode) msg=$msg cause=${error.cause?.message}")
        // Send a richer error string so the JS alert shows the code, not just
        // the generic "Source error" Media3 maps the underlying cause to.
        emitEvent("onError", Arguments.createMap().apply {
            putString("error", "$code: $msg".trim())
        })
    }

    override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState == Player.STATE_ENDED) {
            emitEvent("onEnd", Arguments.createMap())
        }
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        if (isPlaying) emitProgress()
    }

    private fun emitProgress() {
        val p = player ?: return
        if (!isPrepared) return
        val currentMs = p.currentPosition
        val durationMs = p.duration
        val currentSec = currentMs.toDouble() / 1000.0
        val durationSec = if (durationMs > 0) durationMs.toDouble() / 1000.0 else 0.0
        // Avoid spamming the JS bridge every 500ms with identical values.
        if (Math.abs(currentSec - lastReportedSec) < 0.05 && durationSec > 0) return
        lastReportedSec = currentSec
        emitEvent("onProgress", Arguments.createMap().apply {
            putDouble("currentTime", currentSec)
            putDouble("duration", durationSec)
        })
    }

    private fun emitEvent(eventName: String, eventData: WritableMap) {
        val reactContext = context as? ReactContext ?: return
        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, eventName, eventData)
    }

    private fun stopLoopback() {
        loopback?.stop()
        loopback = null
    }

    private fun releasePlayer() {
        stopLoopback()
        player?.removeListener(this)
        player?.release()
        player = null
        playerView.player = null
        isPrepared = false
    }

    fun cleanup() {
        handler.removeCallbacks(progressRunnable)
        releasePlayer()
    }
}
