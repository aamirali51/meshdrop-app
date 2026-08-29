package com.meshdropmobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NetworkSignatureTrackerTest {
  @Test
  fun seededSignatureIsBaselineNotChange() {
    val tracker = NetworkSignatureTracker()

    tracker.seed("wifi:100:true")

    assertFalse(tracker.shouldEmit("wifi:100:true"))
  }

  @Test
  fun distinctSignatureEmitsExactlyOnce() {
    val tracker = NetworkSignatureTracker()
    tracker.seed("wifi:100:true")

    assertTrue(tracker.shouldEmit("cellular:101:true"))
    assertFalse(tracker.shouldEmit("cellular:101:true"))
  }

  @Test
  fun offlineAndRecoveryAreDistinctChanges() {
    val tracker = NetworkSignatureTracker()
    tracker.seed("wifi:100:true")

    assertTrue(tracker.shouldEmit("none:none:false"))
    assertTrue(tracker.shouldEmit("wifi:102:true"))
  }
}
