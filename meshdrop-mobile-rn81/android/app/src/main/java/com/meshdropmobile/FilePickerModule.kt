package com.meshdropmobile

import android.app.Activity
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

class MeshDropFilePickerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var pickerPromise: Promise? = null
  private var folderPickerPromise: Promise? = null

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

    if (pickerPromise != null || folderPickerPromise != null) {
      promise.reject("ALREADY_ACTIVE", "A picker session is already active")
      return
    }

    pickerPromise = promise

    try {
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION or
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        )
      }
      activity.startActivityForResult(intent, REQUEST_CODE)
    } catch (e: Exception) {
      pickerPromise = null
      promise.reject("INTENT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun pickFolder(options: ReadableMap?, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_NULL", "Activity is not available")
      return
    }

    if (pickerPromise != null || folderPickerPromise != null) {
      promise.reject("ALREADY_ACTIVE", "A picker session is already active")
      return
    }

    folderPickerPromise = promise

    try {
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
        addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION or
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        )
      }
      activity.startActivityForResult(intent, FOLDER_REQUEST_CODE)
    } catch (e: Exception) {
      folderPickerPromise = null
      promise.reject("INTENT_ERROR", e.message, e)
    }
  }

  override fun onActivityResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?
  ) {
    if (requestCode == REQUEST_CODE) {
      val promise = pickerPromise ?: return
      pickerPromise = null

      if (resultCode != Activity.RESULT_OK || data == null) {
        promise.resolve(Arguments.createArray())
        return
      }

      // Process file extraction in background thread to keep UI completely responsive
      Thread {
        try {
          val uris = mutableListOf<Uri>()
          val clipData = data.clipData
          if (clipData != null) {
            for (i in 0 until clipData.itemCount) {
              uris.add(clipData.getItemAt(i).uri)
            }
          } else {
            val uri = data.data
            if (uri != null) uris.add(uri)
          }

          val results = Arguments.createArray()
          for (uri in uris) {
            try {
              val takeFlags = data.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION
              if (takeFlags != 0) {
                reactContext.contentResolver.takePersistableUriPermission(uri, takeFlags)
              }
            } catch (_: Exception) {}

            val item = stageUri(uri)
            if (item != null) results.pushMap(item)
          }

          promise.resolve(results)
        } catch (e: Exception) {
          promise.reject("COPY_ERROR", e.message, e)
        }
      }.start()

    } else if (requestCode == FOLDER_REQUEST_CODE) {
      val promise = folderPickerPromise ?: return
      folderPickerPromise = null

      if (resultCode != Activity.RESULT_OK || data == null || data.data == null) {
        promise.resolve(null)
        return
      }

      val treeUri: Uri = data.data!!
      try {
        try {
          val takeFlags: Int = data.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
          reactContext.contentResolver.takePersistableUriPermission(treeUri, takeFlags)
        } catch (_: Exception) {}

        var folderPath = ""
        var folderName = ""

        val docId = DocumentsContract.getTreeDocumentId(treeUri)
        if (docId != null) {
          val parts = docId.split(":")
          val type = parts[0]
          val relPath = if (parts.size > 1) parts[1] else ""

          if ("primary".equals(type, ignoreCase = true)) {
            val root = Environment.getExternalStorageDirectory().absolutePath
            folderPath = if (relPath.isNotEmpty()) "$root/$relPath" else root
          } else {
            folderPath = "/storage/$type/$relPath".trimEnd('/')
          }

          folderName = if (relPath.isNotEmpty()) {
            File(folderPath).name
          } else {
            "Storage"
          }
        }

        if (folderPath.isEmpty()) {
          folderPath = treeUri.path ?: ""
          folderName = File(folderPath).name
        }

        val result = Arguments.createMap().apply {
          putString("uri", treeUri.toString())
          putString("path", folderPath)
          putString("name", folderName)
        }
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("PARSE_ERROR", e.message, e)
      }
    }
  }

  private fun stageUri(uri: Uri): WritableMap? {
    var displayName = "file_${System.currentTimeMillis()}"
    var fileSize: Long = 0

    // 1. Query metadata
    try {
      val cursor: Cursor? = reactContext.contentResolver.query(uri, null, null, null, null)
      cursor?.use {
        if (it.moveToFirst()) {
          val nameIndex = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          val sizeIndex = it.getColumnIndex(OpenableColumns.SIZE)
          if (nameIndex != -1) displayName = it.getString(nameIndex) ?: displayName
          if (sizeIndex != -1) fileSize = it.getLong(sizeIndex)
        }
      }
    } catch (_: Exception) {}

    // 2. Try resolving the real, direct filesystem path (Instant & Zero Copy)
    val directPath = resolveDirectPath(uri)
    if (directPath != null) {
      val directFile = File(directPath)
      if (directFile.exists() && directFile.canRead()) {
        if (fileSize == 0L) fileSize = directFile.length()
        return Arguments.createMap().apply {
          putString("uri", uri.toString())
          putString("path", directFile.absolutePath)
          putString("name", displayName)
          putDouble("size", fileSize.toDouble())
        }
      }
    }

    // 3. Fallback: stream into staging directory (for virtual/cloud files)
    val stagingDir = File(reactContext.cacheDir, "staging")
    if (!stagingDir.exists()) stagingDir.mkdirs()

    val targetFile = File(stagingDir, displayName)
    val stream = reactContext.contentResolver.openInputStream(uri) ?: return null

    FileOutputStream(targetFile).use { outputStream ->
      stream.use { input ->
        val buffer = ByteArray(64 * 1024)
        var read: Int
        while (input.read(buffer).also { read = it } != -1) {
          outputStream.write(buffer, 0, read)
        }
        outputStream.flush()
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

  private fun resolveDirectPath(uri: Uri): String? {
    try {
      if (DocumentsContract.isDocumentUri(reactContext, uri)) {
        val authority = uri.authority
        if ("com.android.externalstorage.documents" == authority) {
          val docId = DocumentsContract.getDocumentId(uri)
          val split = docId.split(":")
          val type = split[0]
          val relPath = if (split.size > 1) split[1] else ""
          if ("primary".equals(type, ignoreCase = true)) {
            return "${Environment.getExternalStorageDirectory().absolutePath}/$relPath"
          } else {
            val possible = "/storage/$type/$relPath"
            if (File(possible).exists()) return possible
          }
        } else if ("com.android.providers.downloads.documents" == authority) {
          val id = DocumentsContract.getDocumentId(uri)
          if (id.startsWith("raw:")) {
            return id.removePrefix("raw:")
          }
          try {
            val contentUri = ContentUris.withAppendedId(
                Uri.parse("content://downloads/public_downloads"), id.toLong()
            )
            return getDataColumn(contentUri, null, null)
          } catch (_: Exception) {}
        } else if ("com.android.providers.media.documents" == authority) {
          val docId = DocumentsContract.getDocumentId(uri)
          val split = docId.split(":")
          val type = split[0]
          val id = if (split.size > 1) split[1] else ""
          val contentUri = when (type) {
            "image" -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            "video" -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            "audio" -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            else -> MediaStore.Files.getContentUri("external")
          }
          return getDataColumn(contentUri, "_id=?", arrayOf(id))
        }
      } else if ("content".equals(uri.scheme, ignoreCase = true)) {
        return getDataColumn(uri, null, null)
      } else if ("file".equals(uri.scheme, ignoreCase = true)) {
        return uri.path
      }
    } catch (_: Exception) {}
    return null
  }

  private fun getDataColumn(uri: Uri, selection: String?, selectionArgs: Array<String>?): String? {
    val column = MediaStore.MediaColumns.DATA
    val projection = arrayOf(column)
    try {
      val cursor = reactContext.contentResolver.query(uri, projection, selection, selectionArgs, null)
      cursor?.use {
        if (it.moveToFirst()) {
          val columnIndex = it.getColumnIndex(column)
          if (columnIndex != -1) {
            return it.getString(columnIndex)
          }
        }
      }
    } catch (_: Exception) {}
    return null
  }

  override fun onNewIntent(intent: Intent) {}

  companion object {
    private const val REQUEST_CODE = 49201
    private const val FOLDER_REQUEST_CODE = 49202
  }
}
