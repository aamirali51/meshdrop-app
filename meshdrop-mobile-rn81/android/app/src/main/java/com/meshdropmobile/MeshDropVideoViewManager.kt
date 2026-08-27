package com.meshdropmobile

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class MeshDropVideoViewManager : SimpleViewManager<MeshDropVideoView>() {

    override fun getName(): String = "MeshDropVideoView"

    override fun createViewInstance(reactContext: ThemedReactContext): MeshDropVideoView {
        return MeshDropVideoView(reactContext)
    }

    @ReactProp(name = "src")
    fun setSrc(view: MeshDropVideoView, src: String?) {
        view.setSrc(src)
    }

    @ReactProp(name = "paused", defaultBoolean = false)
    fun setPaused(view: MeshDropVideoView, paused: Boolean) {
        view.setPaused(paused)
    }

    @ReactProp(name = "muted", defaultBoolean = false)
    fun setMuted(view: MeshDropVideoView, muted: Boolean) {
        view.setMuted(muted)
    }

    @ReactProp(name = "seek")
    fun setSeek(view: MeshDropVideoView, positionSec: Double) {
        view.seekToPosition(positionSec)
    }

    override fun receiveCommand(root: MeshDropVideoView, commandId: String, args: ReadableArray?) {
        when (commandId) {
            "seek" -> {
                val sec = args?.getDouble(0) ?: 0.0
                root.seekToPosition(sec)
            }
            "pause" -> root.setPaused(true)
            "play" -> root.setPaused(false)
        }
    }

    override fun onDropViewInstance(view: MeshDropVideoView) {
        super.onDropViewInstance(view)
        view.cleanup()
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any>? {
        return MapBuilder.of(
            "onReady", MapBuilder.of("registrationName", "onReady"),
            "onProgress", MapBuilder.of("registrationName", "onProgress"),
            "onEnd", MapBuilder.of("registrationName", "onEnd"),
            "onError", MapBuilder.of("registrationName", "onError")
        )
    }
}
