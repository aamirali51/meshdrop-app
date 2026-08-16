package com.meshdropmobile

import android.content.Context
import android.content.res.AssetManager
import android.util.Log
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.io.FileOutputStream

/**
 * Ships the Bare engine bundle + addon prebuilds (udx-native, ...) from the
 * APK assets into the app filesystem.
 *
 * The react-native-bare-kit Worklet takes an `assets` path that Bare uses to
 * resolve `require.addon` — addons must live on the real filesystem (Bare does
 * not read through Android's AssetManager). `scripts/copy-engine-assets.js`
 * populates android/app/src/main/assets/engine/ from the bare-pack
 * --offload-addons output; on first launch this class copies that tree to
 * <filesDir>/engine and the JS bridge points the Worklet at it.
 * (Pattern ported from lynko-mobile.)
 */
object EngineAssets {
  private const val TAG = "MeshDropEngineAssets"
  const val ASSET_ROOT = "engine"
  private const val MARKER = ".complete"

  fun ensure(context: Context) {
    val dest = File(context.filesDir, ASSET_ROOT)
    val marker = File(dest, MARKER)
    if (marker.exists()) return
    try {
      copyAssetTree(context.assets, ASSET_ROOT, dest)
      if (File(dest, "node_modules").exists()) marker.writeText("ok")
      Log.i(TAG, "extracted engine assets to ${dest.absolutePath}")
    } catch (err: Exception) {
      Log.e(TAG, "failed to extract engine assets", err)
    }
  }

  private fun copyAssetTree(assets: AssetManager, assetPath: String, dest: File) {
    val children = assets.list(assetPath) ?: emptyArray()
    if (children.isEmpty()) {
      // Leaf file.
      dest.parentFile?.mkdirs()
      val out = FileOutputStream(dest)
      assets.open(assetPath).use { input -> input.copyTo(out) }
      out.close()
    } else {
      dest.mkdirs()
      for (child in children) {
        copyAssetTree(assets, "$assetPath/$child", File(dest, child))
      }
    }
  }
}

class MeshDropEngineAssetsModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

  override fun getName(): String = "MeshDropEngineAssets"

  @ReactMethod
  fun getEngineAssetsDir(callback: com.facebook.react.bridge.Callback) {
    val dir = File(context.filesDir, EngineAssets.ASSET_ROOT).absolutePath
    callback.invoke(dir)
  }

  @ReactMethod
  fun hasAllFilesAccess(promise: com.facebook.react.bridge.Promise) {
    try {
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
        promise.resolve(android.os.Environment.isExternalStorageManager())
      } else {
        promise.resolve(true)
      }
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun requestAllFilesAccess(promise: com.facebook.react.bridge.Promise) {
    try {
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
        if (!android.os.Environment.isExternalStorageManager()) {
          try {
            val intent = android.content.Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
            intent.data = android.net.Uri.parse("package:" + context.packageName)
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            promise.resolve(true)
          } catch (e: Exception) {
            val intent = android.content.Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            promise.resolve(true)
          }
        } else {
          promise.resolve(true)
        }
      } else {
        promise.resolve(true)
      }
    } catch (e: Exception) {
      promise.reject(e)
    }
  }
}

class MeshDropEngineAssetsPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
      listOf(
          MeshDropEngineAssetsModule(reactContext),
          MeshDropFilePickerModule(reactContext),
          MeshDropClipboardModule(reactContext),
          BackgroundServiceModule(reactContext),
          MeshDropUpdaterModule(reactContext)
      )

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
      emptyList()
}
