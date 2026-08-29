package com.meshdropmobile

internal class NetworkSignatureTracker {
  private var lastSignature: String? = null

  @Synchronized
  fun seed(signature: String) {
    lastSignature = signature
  }

  @Synchronized
  fun shouldEmit(signature: String): Boolean {
    if (signature == lastSignature) return false
    lastSignature = signature
    return true
  }
}
