package com.meshdropmobile

import android.app.Activity
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

class MeshDropFilePickerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var pickerPromise: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "MeshDropFilePicker"

  @ReactMethod
  fun pickFiles(options: ReadableMap?, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_NULL", "Activity is not available")
      return
    }

    if (pickerPromise != null) {
      promise.reject("ALREADY_ACTIVE", "A file picker session is already active")
      return
    }

    pickerPromise = promise

    try {
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
      }
      activity.startActivityForResult(intent, REQUEST_CODE)
    } catch (e: Exception) {
      pickerPromise = null
      promise.reject("INTENT_ERROR", e.message, e)
    }
  }

  override fun onActivityResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?
  ) {
    if (requestCode != REQUEST_CODE) return

    val promise = pickerPromise ?: return
    pickerPromise = null

    if (resultCode != Activity.RESULT_OK || data == null) {
      // User cancelled
      val emptyArray = Arguments.createArray()
      promise.resolve(emptyArray)
      return
    }

    try {
      val results = Arguments.createArray()
      val clipData = data.clipData
      if (clipData != null) {
        for (i in 0 until clipData.itemCount) {
          val uri = clipData.getItemAt(i).uri
          val item = stageUri(uri)
          if (item != null) results.pushMap(item)
        }
      } else {
        val uri = data.data
        if (uri != null) {
          val item = stageUri(uri)
          if (item != null) results.pushMap(item)
        }
      }
      promise.resolve(results)
    } catch (e: Exception) {
      promise.reject("COPY_ERROR", e.message, e)
    }
  }

  private fun stageUri(uri: Uri): WritableMap? {
    var displayName = "file_${System.currentTimeMillis()}"
    var fileSize: Long = 0

    val cursor: Cursor? = reactContext.contentResolver.query(uri, null, null, null, null)
    cursor?.use {
      if (it.moveToFirst()) {
        val nameIndex = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeIndex = it.getColumnIndex(OpenableColumns.SIZE)
        if (nameIndex != -1) displayName = it.getString(nameIndex) ?: displayName
        if (sizeIndex != -1) fileSize = it.getLong(sizeIndex)
      }
    }

    val stagingDir = File(reactContext.cacheDir, "staging")
    if (!stagingDir.exists()) stagingDir.mkdirs()

    val targetFile = File(stagingDir, displayName)
    val stream = reactContext.contentResolver.openInputStream(uri) ?: return null

    FileOutputStream(targetFile).use { outputStream ->
      stream.use { input ->
        input.copyTo(outputStream)
      }
    }
    if (fileSize == 0L) fileSize = targetFile.length()

    return Arguments.createMap().apply {
      putString("uri", uri.toString())
      putString("path", targetFile.absolutePath)
      putString("name", displayName)
      putDouble("size", fileSize.toDouble())
    }
  }

  override fun onNewIntent(intent: Intent) {}

  companion object {
    private const val REQUEST_CODE = 49201
  }
}
