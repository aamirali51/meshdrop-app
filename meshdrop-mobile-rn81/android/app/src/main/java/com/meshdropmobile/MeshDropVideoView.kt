package com.meshdropmobile

import android.content.Context
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.VideoView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.RCTEventEmitter
import java.io.File

class MeshDropVideoView(context: Context) : FrameLayout(context),
    MediaPlayer.OnPreparedListener,
    MediaPlayer.OnCompletionListener,
    MediaPlayer.OnErrorListener {

    private val videoView: VideoView = VideoView(context)
    private var mediaPlayer: MediaPlayer? = null
    private var isPrepared = false
    private var isPaused = false
    private var isMuted = false
    private var sourcePath: String? = null
    private var pendingSeekPosition: Int = -1

    private val handler = Handler(Looper.getMainLooper())
    private val progressRunnable = object : Runnable {
        override fun run() {
            if (isPrepared && videoView.isPlaying) {
                emitProgress()
            }
            handler.postDelayed(this, 500)
        }
    }

    init {
        val params = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT).apply {
            gravity = Gravity.CENTER
        }
        addView(videoView, params)

        videoView.setOnPreparedListener(this)
        videoView.setOnCompletionListener(this)
        videoView.setOnErrorListener(this)
        handler.post(progressRunnable)
    }

    fun setSrc(src: String?) {
        if (src.isNullOrEmpty()) {
            videoView.stopPlayback()
            sourcePath = null
            isPrepared = false
            return
        }

        if (src == sourcePath) return
        sourcePath = src
        isPrepared = false

        try {
            val uri = if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("content://")) {
                Uri.parse(src)
            } else if (src.startsWith("file://")) {
                Uri.parse(src)
            } else {
                Uri.fromFile(File(src))
            }
            videoView.setVideoURI(uri)
        } catch (e: Exception) {
            Log.e("MeshDropVideo", "Error setting video URI: ${e.message}")
            emitEvent("onError", Arguments.createMap().apply {
                putString("error", e.message ?: "Failed to open video source")
            })
        }
    }

    fun setPaused(paused: Boolean) {
        isPaused = paused
        if (!isPrepared) return

        if (paused) {
            if (videoView.isPlaying) {
                videoView.pause()
            }
        } else {
            if (!videoView.isPlaying) {
                videoView.start()
            }
        }
    }

    fun setMuted(muted: Boolean) {
        isMuted = muted
        mediaPlayer?.let { player ->
            try {
                if (muted) {
                    player.setVolume(0f, 0f)
                } else {
                    player.setVolume(1f, 1f)
                }
            } catch (e: Exception) {
                Log.e("MeshDropVideo", "Error setting volume: ${e.message}")
            }
        }
    }

    fun seekToPosition(seconds: Double) {
        val ms = (seconds * 1000).toInt()
        if (isPrepared) {
            videoView.seekTo(ms)
        } else {
            pendingSeekPosition = ms
        }
    }

    override fun onPrepared(mp: MediaPlayer) {
        mediaPlayer = mp
        isPrepared = true

        mp.setVideoScalingMode(MediaPlayer.VIDEO_SCALING_MODE_SCALE_TO_FIT)
        setMuted(isMuted)

        val durationSec = mp.duration.toDouble() / 1000.0
        val width = mp.videoWidth
        val height = mp.videoHeight

        emitEvent("onReady", Arguments.createMap().apply {
            putDouble("duration", durationSec)
            putInt("naturalWidth", width)
            putInt("naturalHeight", height)
        })

        if (pendingSeekPosition >= 0) {
            videoView.seekTo(pendingSeekPosition)
            pendingSeekPosition = -1
        }

        if (!isPaused) {
            videoView.start()
        }
    }

    override fun onCompletion(mp: MediaPlayer) {
        emitEvent("onEnd", Arguments.createMap())
    }

    override fun onError(mp: MediaPlayer, what: Int, extra: Int): Boolean {
        Log.e("MeshDropVideo", "VideoView error: what=$what, extra=$extra")
        emitEvent("onError", Arguments.createMap().apply {
            putString("error", "Playback error code $what ($extra)")
        })
        return true
    }

    private fun emitProgress() {
        val currentMs = videoView.currentPosition
        val durationMs = videoView.duration
        val currentSec = currentMs.toDouble() / 1000.0
        val durationSec = if (durationMs > 0) durationMs.toDouble() / 1000.0 else 0.0

        emitEvent("onProgress", Arguments.createMap().apply {
            putDouble("currentTime", currentSec)
            putDouble("duration", durationSec)
        })
    }

    private fun emitEvent(eventName: String, eventData: WritableMap) {
        val reactContext = context as? ReactContext ?: return
        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(
            id,
            eventName,
            eventData
        )
    }

    fun cleanup() {
        handler.removeCallbacks(progressRunnable)
        videoView.stopPlayback()
        mediaPlayer = null
        isPrepared = false
    }
}
