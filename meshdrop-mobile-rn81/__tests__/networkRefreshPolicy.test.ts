import {
  INITIAL_NETWORK_REFRESH_STATE,
  recordEngineReady,
  recordNetworkChange,
} from '../src/networkRefreshPolicy';

describe('network refresh policy', () => {
  test('does not refresh when the engine becomes ready without a transition', () => {
    expect(recordEngineReady(INITIAL_NETWORK_REFRESH_STATE).action).toBe(
      'none',
    );
  });

  test('replays one online network transition that happens during boot', () => {
    const duringBoot = recordNetworkChange(
      INITIAL_NETWORK_REFRESH_STATE,
      true,
      false,
    );
    expect(duringBoot.action).toBe('none');

    const ready = recordEngineReady(duringBoot.state);
    expect(ready.action).toBe('refresh');
    expect(recordEngineReady(ready.state).action).toBe('none');
  });

  test('does not refresh onto an offline network during boot', () => {
    const duringBoot = recordNetworkChange(
      INITIAL_NETWORK_REFRESH_STATE,
      false,
      false,
    );
    expect(duringBoot.action).toBe('cancel');
    expect(recordEngineReady(duringBoot.state).action).toBe('none');
  });

  test('refreshes when connectivity recovers after the engine is ready', () => {
    const offline = recordNetworkChange(
      INITIAL_NETWORK_REFRESH_STATE,
      false,
      true,
    );
    expect(offline.action).toBe('cancel');
    expect(recordNetworkChange(offline.state, true, true).action).toBe(
      'refresh',
    );
  });

  test('refreshes for an online transport change after ready', () => {
    expect(
      recordNetworkChange(INITIAL_NETWORK_REFRESH_STATE, true, true).action,
    ).toBe('refresh');
  });
});
