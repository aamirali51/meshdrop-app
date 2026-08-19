package com.meshdropmobile

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Minimal clipboard accessor so the UI can read/write text to the system
 * clipboard (QR scan codes, drop codes, public keys).
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

  @ReactMethod
  fun getString(promise: Promise) {
    try {
      val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      if (clipboard.hasPrimaryClip()) {
        val item = clipboard.primaryClip?.getItemAt(0)
        val text = item?.text?.toString() ?: ""
        promise.resolve(text)
      } else {
        promise.resolve("")
      }
    } catch (e: Exception) {
      promise.resolve("")
    }
  }
}
