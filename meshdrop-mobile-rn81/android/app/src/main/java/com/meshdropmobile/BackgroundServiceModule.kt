package com.meshdropmobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BackgroundServiceModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MeshDropBackgroundService"

    init {
        createNotificationChannels()
    }

    private fun getNotificationManager(): NotificationManager? {
        return reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getNotificationManager() ?: return

            // 1. High Priority Channel for Incoming File Offers & Completion Alerts
            val alertChannel = NotificationChannel(
                CHANNEL_ALERTS,
                "MeshDrop File Transfers",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts for incoming file transfer requests and completions"
                enableVibration(true)
                setShowBadge(true)
            }

            // 2. Progress Channel for Live File Transfer Progress
            val progressChannel = NotificationChannel(
                CHANNEL_PROGRESS,
                "MeshDrop Transfer Progress",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Live progress for active file transfers"
                setShowBadge(false)
            }

            manager.createNotificationChannel(alertChannel)
            manager.createNotificationChannel(progressChannel)
        }
    }

    private fun getLaunchPendingIntent(): PendingIntent {
        val launchIntent = reactContext.packageManager.getLaunchIntentForPackage(reactContext.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            reactContext,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    @ReactMethod
    fun showTransferOfferNotification(id: String, title: String, message: String, promise: Promise) {
        try {
            val manager = getNotificationManager()
            val notifId = id.hashCode()
            val notification = NotificationCompat.Builder(reactContext, CHANNEL_ALERTS)
                .setContentTitle(title)
                .setContentText(message)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setContentIntent(getLaunchPendingIntent())
                .build()

            manager?.notify(notifId, notification)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIF_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun showTransferProgressNotification(id: String, title: String, message: String, progress: Int, max: Int, promise: Promise) {
        try {
            val manager = getNotificationManager()
            val notifId = id.hashCode()
            val builder = NotificationCompat.Builder(reactContext, CHANNEL_PROGRESS)
                .setContentTitle(title)
                .setContentText(message)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(getLaunchPendingIntent())

            if (max > 0) {
                builder.setProgress(max, progress.coerceIn(0, max), false)
            } else {
                builder.setProgress(0, 0, true)
            }

            manager?.notify(notifId, builder.build())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIF_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun showTransferCompleteNotification(id: String, title: String, message: String, promise: Promise) {
        try {
            val manager = getNotificationManager()
            val notifId = id.hashCode()
            // Cancel any ongoing progress notification for this id
            manager?.cancel(notifId)

            val notification = NotificationCompat.Builder(reactContext, CHANNEL_ALERTS)
                .setContentTitle(title)
                .setContentText(message)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setContentIntent(getLaunchPendingIntent())
                .build()

            manager?.notify(notifId + 1, notification)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIF_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelTransferNotification(id: String, promise: Promise) {
        try {
            val manager = getNotificationManager()
            val notifId = id.hashCode()
            manager?.cancel(notifId)
            manager?.cancel(notifId + 1)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIF_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun startBackgroundSync(promise: Promise) {
        try {
            val intent = Intent(reactContext, BackgroundSyncService::class.java).apply {
                action = BackgroundSyncService.ACTION_START
            }
            ContextCompat.startForegroundService(reactContext, intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopBackgroundSync(promise: Promise) {
        try {
            val intent = Intent(reactContext, BackgroundSyncService::class.java).apply {
                action = BackgroundSyncService.ACTION_STOP
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isBackgroundSyncRunning(promise: Promise) {
        promise.resolve(BackgroundSyncService.isRunning)
    }

    @ReactMethod
    fun isBatteryOptimizationIgnored(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            val isIgnored = powerManager?.isIgnoringBatteryOptimizations(reactContext.packageName) ?: false
            promise.resolve(isIgnored)
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
                if (powerManager?.isIgnoringBatteryOptimizations(reactContext.packageName) == true) {
                    promise.resolve(true)
                    return
                }

                val intent = Intent().apply {
                    action = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
                    data = Uri.parse("package:${reactContext.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
                promise.resolve(true)
            } catch (e: Exception) {
                // Fallback to standard battery optimization settings
                try {
                    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    reactContext.startActivity(intent)
                    promise.resolve(true)
                } catch (fallbackEx: Exception) {
                    promise.reject("BATTERY_OPT_ERROR", fallbackEx.message, fallbackEx)
                }
            }
        } else {
            promise.resolve(true)
        }
    }

    companion object {
        const val CHANNEL_ALERTS = "meshdrop_transfers_alerts"
        const val CHANNEL_PROGRESS = "meshdrop_transfers_progress"
    }
}

