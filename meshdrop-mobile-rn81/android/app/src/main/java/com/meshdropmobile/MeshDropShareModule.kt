package com.meshdropmobile

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

/**
 * Native Android Share Target / Intent Receiver Module.
 *
 * Captures ACTION_SEND and ACTION_SEND_MULTIPLE intents from any Android app
 * (Gallery, Files, Browser, etc.), extracts content:// and file:// streams,
 * copies content URIs safely into internal cache storage, and delivers real
 * filesystem paths and metadata to the React Native UI.
 */
class MeshDropShareModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

  companion object {
    private const val TAG = "MeshDropShare"
    const val EVENT_SHARE_RECEIVED = "MeshDropShare:received"
    private var pendingShareData: WritableMap? = null
    private var instance: MeshDropShareModule? = null

    /**
     * Called by MainActivity on initial launch or onNewIntent when a share intent arrives.
     */
    fun handleIncomingIntent(context: Context, intent: Intent?) {
      if (intent == null) return
      val action = intent.action ?: return
      if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return

      try {
        val shareData = extractShareData(context, intent)
        if (shareData != null) {
          pendingShareData = shareData
          instance?.emitShareEvent(shareData)
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error handling incoming share intent", e)
      }
    }

    private fun extractShareData(context: Context, intent: Intent): WritableMap? {
      val action = intent.action
      val type = intent.type ?: "*/*"
      val result = Arguments.createMap()
      val items = Arguments.createArray()

      val cacheDir = File(context.cacheDir, "shared_incoming")
      if (!cacheDir.exists()) cacheDir.mkdirs()

      if (action == Intent.ACTION_SEND) {
        // Plain text / URL sharing
        if (intent.hasExtra(Intent.EXTRA_TEXT) && !intent.hasExtra(Intent.EXTRA_STREAM)) {
          val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
          if (text.isNotBlank()) {
            result.putString("type", "text")
            result.putString("text", text)
            result.putArray("items", items)
            return result
          }
        }

        // Single file / image / media stream
        val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        if (uri != null) {
          val itemMap = resolveUriToFile(context, uri, cacheDir)
          if (itemMap != null) {
            items.pushMap(itemMap)
          }
        }
      } else if (action == Intent.ACTION_SEND_MULTIPLE) {
        val uriList = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
        if (uriList != null) {
          for (uri in uriList) {
            val itemMap = resolveUriToFile(context, uri, cacheDir)
            if (itemMap != null) {
              items.pushMap(itemMap)
            }
          }
        }
      }

      if (items.size() == 0) return null

      result.putString("type", "files")
      result.putArray("items", items)
      return result
    }

    private fun resolveUriToFile(context: Context, uri: Uri, targetDir: File): WritableMap? {
      return try {
        val contentResolver: ContentResolver = context.contentResolver
        var fileName: String? = null
        var fileSize: Long = 0

        if (uri.scheme == ContentResolver.SCHEME_CONTENT) {
          contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
              val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
              val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
              if (nameIdx != -1) fileName = cursor.getString(nameIdx)
              if (sizeIdx != -1 && !cursor.isNull(sizeIdx)) fileSize = cursor.getLong(sizeIdx)
            }
          }
        }

        if (fileName.isNullOrBlank()) {
          fileName = uri.lastPathSegment ?: "shared_file_${System.currentTimeMillis()}"
        }

        // Clean filename to prevent traversal
        val safeName = fileName!!.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        val destFile = File(targetDir, "${System.currentTimeMillis()}_$safeName")

        val inputStream: InputStream? = contentResolver.openInputStream(uri)
        if (inputStream != null) {
          FileOutputStream(destFile).use { out ->
            inputStream.copyTo(out)
          }
          if (fileSize <= 0) {
            fileSize = destFile.length()
          }

          val map = Arguments.createMap()
          map.putString("path", destFile.absolutePath)
          map.putString("name", safeName)
          map.putDouble("size", fileSize.toDouble())
          map.putString("uri", uri.toString())
          map
        } else {
          null
        }
      } catch (e: Exception) {
        Log.e(TAG, "Failed to copy content uri: $uri", e)
        null
      }
    }
  }

  init {
    instance = this
  }

  override fun getName(): String = "MeshDropShare"

  @ReactMethod
  fun getPendingShare(promise: Promise) {
    try {
      promise.resolve(pendingShareData)
    } catch (e: Exception) {
      promise.reject(e)
    }
  }

  @ReactMethod
  fun clearPendingShare(promise: Promise) {
    try {
      pendingShareData = null
      // Clean old cache files
      val cacheDir = File(context.cacheDir, "shared_incoming")
      if (cacheDir.exists()) {
        cacheDir.listFiles()?.forEach { file ->
          // Remove files older than 1 hour
          if (System.currentTimeMillis() - file.lastModified() > 3600000) {
            file.delete()
          }
        }
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject(e)
    }
  }

  fun emitShareEvent(data: WritableMap) {
    try {
      if (context.hasActiveReactInstance()) {
        context
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_SHARE_RECEIVED, data)
      }
    } catch (e: Exception) {
      Log.e(TAG, "Failed to emit share event", e)
    }
  }
}
