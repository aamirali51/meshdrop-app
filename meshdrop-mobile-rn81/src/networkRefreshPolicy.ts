export type NetworkRefreshState = {
  isOffline: boolean;
  pendingNetworkChange: boolean;
};

export type NetworkRefreshAction = 'none' | 'cancel' | 'refresh';

export type MobileNetworkProfile = {
  kind: 'mobile-wifi' | 'mobile-cellular';
  headBytes: number;
  tailBytes: number;
  lookaheadBlocks: number;
  syncWindowBytes: number;
  requestTimeoutMs: number;
  maxConcurrentPeers: number;
  lruBytes: number;
};

export const INITIAL_NETWORK_REFRESH_STATE: NetworkRefreshState = {
  isOffline: false,
  pendingNetworkChange: false,
};

// Map the Android ConnectivityManager transport (from NetworkModule.kt:
// wifi | cellular | ethernet | other) to a tuned core profile. Cellular is the
// tight case: smaller head/tail windows, lower lookahead, a narrower sync
// byte cap, and only 2 peer fan-in so the phone never runs out of RAM or
// burns metered bandwidth. Wi-Fi/ethernet/unknown get the mid profile.
export function profileForNetworkType(type?: string): MobileNetworkProfile {
  const isCellular = type === 'cellular'
  if (isCellular) {
    return {
      kind: 'mobile-cellular',
      headBytes: 1 * 1024 * 1024,
      tailBytes: 512 * 1024,
      lookaheadBlocks: 64,
      syncWindowBytes: 2 * 1024 * 1024,
      requestTimeoutMs: 1500,
      maxConcurrentPeers: 2,
      lruBytes: 8 * 1024 * 1024,
    };
  }
  return {
    kind: 'mobile-wifi',
    headBytes: 4 * 1024 * 1024,
    tailBytes: 2 * 1024 * 1024,
    lookaheadBlocks: 128,
    syncWindowBytes: 4 * 1024 * 1024,
    requestTimeoutMs: 500,
    maxConcurrentPeers: 3,
    lruBytes: 16 * 1024 * 1024,
  };
}

export function recordNetworkChange(
  state: NetworkRefreshState,
  online: boolean,
  engineReady: boolean,
): { state: NetworkRefreshState; action: NetworkRefreshAction } {
  if (!online) {
    return {
      state: { isOffline: true, pendingNetworkChange: false },
      action: 'cancel',
    };
  }

  if (!engineReady) {
    return {
      state: { isOffline: false, pendingNetworkChange: true },
      action: 'none',
    };
  }

  return {
    state: { isOffline: false, pendingNetworkChange: false },
    action: 'refresh',
  };
}

export function recordEngineReady(state: NetworkRefreshState): {
  state: NetworkRefreshState;
  action: NetworkRefreshAction;
} {
  const shouldRefresh = state.pendingNetworkChange && !state.isOffline;
  return {
    state: { ...state, pendingNetworkChange: false },
    action: shouldRefresh ? 'refresh' : 'none',
  };
}
