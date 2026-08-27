import { requireNativeComponent, type ViewProps } from 'react-native'

export interface NativeVideoViewProps extends ViewProps {
  src?: string
  paused?: boolean
  muted?: boolean
  seek?: number
  onReady?: (event: any) => void
  onProgress?: (event: any) => void
  onEnd?: (event: any) => void
  onError?: (event: any) => void
}

export const NativeVideoView = requireNativeComponent<NativeVideoViewProps>('MeshDropVideoView')
