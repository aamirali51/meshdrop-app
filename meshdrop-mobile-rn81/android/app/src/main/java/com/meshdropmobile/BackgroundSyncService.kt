package com.meshdropmobile

import android.os.Handler
import android.os.Looper
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

class BackgroundSyncService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "BackgroundSyncService onCreate")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == ACTION_STOP) {
            Log.i(TAG, "Stopping BackgroundSyncService")
            releaseLocks()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            isRunning = false
            return START_NOT_STICKY
        }

        Log.i(TAG, "Starting BackgroundSyncService in foreground")
        acquireLocks()
        val notification = buildNotification()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        isRunning = true
        return START_STICKY
    }

    override fun onDestroy() {
        Log.i(TAG, "BackgroundSyncService onDestroy")
        releaseLocks()
        isRunning = false
        super.onDestroy()
    }

    private fun acquireLocks() {
        try {
            if (wakeLock == null) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "meshdrop:background_sync_wakelock"
                ).apply {
                    setReferenceCounted(false)
                    acquire(10 * 60 * 1000L) // 10-minute safe timeout to preserve battery
                }
            }
            if (wifiLock == null) {
                val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                wifiLock = wifiManager.createWifiLock(
                    WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                    "meshdrop:background_sync_wifilock"
                ).apply {
                    setReferenceCounted(false)
                    acquire()
                }
                // WifiLock has no timed acquire() — release it after 10 minutes
                // so a permanent FULL_HIGH_PERF lock never keeps the radio
                // awake 24/7 (drains battery).
                Handler(Looper.getMainLooper()).postDelayed({
                    wifiLock?.let {
                        if (it.isHeld) it.release()
                    }
                }, 10 * 60 * 1000L)
            }
            Log.i(TAG, "Acquired WakeLock (timed) and WifiLock (timed) for background P2P sync")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to acquire locks: ${e.message}")
        }
    }

    private fun releaseLocks() {
        try {
            wakeLock?.let {
                if (it.isHeld) it.release()
            }
            wakeLock = null
            wifiLock?.let {
                if (it.isHeld) it.release()
            }
            wifiLock = null
            Log.i(TAG, "Released WakeLock and WifiLock")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to release locks: ${e.message}")
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "MeshDrop Background Sync",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps MeshDrop P2P sync and file transfers alive in the background"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MeshDrop · P2P Active")
            .setContentText("Syncing and ready for direct transfers")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build()
    }

    companion object {
        private const val TAG = "BackgroundSyncService"
        const val CHANNEL_ID = "meshdrop_sync_channel"
        const val NOTIFICATION_ID = 49202
        const val ACTION_START = "com.meshdropmobile.action.START_SYNC"
        const val ACTION_STOP = "com.meshdropmobile.action.STOP_SYNC"

        @Volatile
        var isRunning: Boolean = false
            private set
    }
}
