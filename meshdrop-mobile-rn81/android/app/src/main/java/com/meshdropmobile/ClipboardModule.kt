package com.meshdropmobile

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Minimal clipboard accessor so the UI can actually write text to the system
 * clipboard (QDR scan codes, drop codes, public keys) instead of fake-copying.
 */
class MeshDropClipboardModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

  override fun getName(): String = "MeshDropClipboard"

  @ReactMethod
  fun setString(text: String, promise: Promise) {
    try {
      val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("MeshDrop", text))
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject(e)
    }
  }
}
