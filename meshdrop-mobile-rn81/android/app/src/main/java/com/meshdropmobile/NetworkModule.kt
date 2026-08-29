package com.meshdropmobile

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Watches the active network transport and emits a "MeshDropNetworkChanged"
 * JS event when the connection switches networks (Wi-Fi → cellular, router
 * swap, VPN on/off). The bridge reacts by telling the engine to rebuild its
 * swarm: the DHT node + sockets are bound to the previous interface, and only
 * a fresh swarm re-announces this device on the new network. Without this,
 * paired devices stay "offline" until the app is restarted.
 */
class NetworkModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "MeshDropNetwork"

  private val signatureTracker = NetworkSignatureTracker()
  private var registered = false

  private data class NetworkState(val type: String, val signature: String, val isOnline: Boolean)

  @ReactMethod
  fun startListening() {
    if (registered) return
    val cm = reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val request = NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build()
    // registerNetworkCallback immediately reports the current network. Seed it
    // as this process's baseline so that callback is not misclassified as a
    // transport transition and used to rebuild the just-started swarm.
    signatureTracker.seed(readNetworkState(cm).signature)
    cm.registerNetworkCallback(request, callback)
    registered = true
  }

  /**
   * Re-derive the active transport and emit MeshDropNetworkChanged only when
   * it changed since the last emission. Called when the app returns to the
   * foreground: connectivity callbacks are not replayed to a process that was
   * frozen while backgrounded (Doze / app freezer), so a switch that happened
   * in that window would otherwise be missed entirely.
   */
  @ReactMethod
  fun checkNow() {
    emitChange()
  }

  private val callback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) = emitChange()
    override fun onLost(network: Network) = emitChange()
    override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) = emitChange()
  }

  private fun emitChange() {
    try {
      val cm = reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val state = readNetworkState(cm)
      if (!signatureTracker.shouldEmit(state.signature)) return
      val params = Arguments.createMap()
      params.putString("type", state.type)
      params.putBoolean("online", state.isOnline)
      reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("MeshDropNetworkChanged", params)
    } catch (e: Exception) {
      // Never crash the bridge over a connectivity probe.
    }
  }

  private fun readNetworkState(cm: ConnectivityManager): NetworkState {
    val active = cm.activeNetwork
    val caps = active?.let { cm.getNetworkCapabilities(it) }
    val type =
        when {
          caps == null -> "none"
          caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
          caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
          caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
          else -> "other"
        }
    // Distinguish "no connectivity at all" from "switched transports": a full
    // loss with no replacement network must not trigger a swarm rebuild onto
    // a dead interface — the engine only rebuilds when connectivity returns.
    // The online flag is part of the signature so loss→recovery always emits.
    val isOnline = caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    val signature = "$type:${active?.toString() ?: "none"}:$isOnline"
    return NetworkState(type, signature, isOnline)
  }
}
