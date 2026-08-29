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

const native = NativeModules.MeshDropCapabilities as
  | { get?: (cb: (caps: DeviceCapabilities) => void) => void }
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
  return new Promise((resolve) => {
    native.get!((caps) => {
      cached = {
        videoCodecs: Array.isArray(caps?.videoCodecs) ? caps.videoCodecs : [],
        audioCodecs: Array.isArray(caps?.audioCodecs) ? caps.audioCodecs : [],
        containers: Array.isArray(caps?.containers) ? caps.containers : [],
        protocols: Array.isArray(caps?.protocols) ? caps.protocols : []
      }
      resolve(cached)
    })
  })
}
