import { NativeModules } from 'react-native'

// Watch-party capability declaration for THIS device. The host uses it to
// decide direct-play vs remux vs refuse. Conservative wins: under-declaring
// costs a remux, over-declaring costs a black screen.
export interface DeviceCapabilities {
  videoCodecs: string[]
  audioCodecs: string[]
  containers: string[]
  protocols: string[]
}

// The native module declares `get(promise: Promise)` as a React Promise
// (TurboModule interop), so the JS side must call it with NO arguments and
// await the returned promise — passing a trailing callback is never invoked
// (same pattern as MeshDropUpdater; see src/updater.ts).
const native = NativeModules.MeshDropCapabilities as
  | { get?: () => Promise<DeviceCapabilities> }
  | undefined

let cached: DeviceCapabilities | null = null

export function getDeviceCapabilities(): Promise<DeviceCapabilities> {
  if (cached) return Promise.resolve(cached)
  if (!native?.get) {
    // No native probe (e.g. running in a test harness) — declare nothing so
    // the host refuses with a reason rather than guessing.
    cached = { videoCodecs: [], audioCodecs: [], containers: [], protocols: [] }
    return Promise.resolve(cached)
  }
  return native
    .get()
    .then((caps) => {
      cached = {
        videoCodecs: Array.isArray(caps?.videoCodecs) ? caps.videoCodecs : [],
        audioCodecs: Array.isArray(caps?.audioCodecs) ? caps.audioCodecs : [],
        containers: Array.isArray(caps?.containers) ? caps.containers : [],
        protocols: Array.isArray(caps?.protocols) ? caps.protocols : []
      }
      return cached
    })
    .catch(() => {
      // A failed probe must not block party creation — declare nothing so the
      // host refuses with a clear reason rather than the party failing to start.
      cached = { videoCodecs: [], audioCodecs: [], containers: [], protocols: [] }
      return cached
    })
}
