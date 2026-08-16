package com.meshdropmobile

import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Store-free APK updater support. Exposes the running build version so the JS
 * side can compare against a hosted manifest, and hands a freshly downloaded
 * APK to the Android system installer (ACTION_VIEW via a FileProvider content
 * URI), prompting for the one-time "install unknown apps" grant when needed.
 *
 * Updates are NOT published to an app store. A newer APK must be signed by the
 * exact same release keystore or Android treats it as a different app.
 *
 * Mirrors the MeshDropClipboardModule pattern (try/catch + Promise).
 */
class MeshDropUpdaterModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

  override fun getName(): String = "MeshDropUpdater"

  @ReactMethod
  fun getVersionCode(promise: Promise) {
    try {
      promise.resolve(BuildConfig.VERSION_CODE)
    } catch (e: Exception) {
      promise.reject(e)
    }
  }

  @ReactMethod
  fun getVersionName(promise: Promise) {
    try {
      promise.resolve(BuildConfig.VERSION_NAME)
    } catch (e: Exception) {
      promise.reject(e)
    }
  }

  @ReactMethod
  fun canInstallPackages(promise: Promise) {
    try {
      promise.resolve(context.packageManager.canRequestPackageInstalls())
    } catch (e: Exception) {
      promise.reject(e)
    }
  }

  /** Deep-link to the per-app "Allow install unknown apps" setting. */
  @ReactMethod
  fun openInstallSettings(promise: Promise) {
    try {
      val intent = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
      intent.data = Uri.parse("package:" + context.packageName)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  /** Launch the system package installer for a previously downloaded APK. */
  @ReactMethod
  fun installApk(path: String, promise: Promise) {
    try {
      val file = File(path)
      if (!file.exists() || !file.isFile) {
        promise.reject("E_NO_FILE", "Downloaded APK not found: " + path)
        return
      }
      if (!context.packageManager.canRequestPackageInstalls()) {
        promise.reject(
          "E_UNKNOWN_SOURCES",
          "Allow install from this app in Settings, then retry."
        )
        return
      }
      val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", file)
      val intent = Intent(Intent.ACTION_VIEW)
      intent.setDataAndType(uri, "application/vnd.android.package-archive")
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject(e)
    }
  }
}
