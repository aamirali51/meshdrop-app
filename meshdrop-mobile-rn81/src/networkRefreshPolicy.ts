export type NetworkRefreshState = {
  isOffline: boolean;
  pendingNetworkChange: boolean;
};

export type NetworkRefreshAction = 'none' | 'cancel' | 'refresh';

export const INITIAL_NETWORK_REFRESH_STATE: NetworkRefreshState = {
  isOffline: false,
  pendingNetworkChange: false,
};

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
