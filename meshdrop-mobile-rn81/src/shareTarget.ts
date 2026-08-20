import { NativeModules, DeviceEventEmitter, type EmitterSubscription } from 'react-native'

const { MeshDropShare } = NativeModules

export interface SharedFileItem {
  path: string
  name: string
  size: number
  uri?: string
}

export interface SharedPayload {
  type: 'files' | 'text'
  items: SharedFileItem[]
  text?: string
}

/**
 * Fetch any pending share payload received on app startup or cold boot.
 */
export async function getInitialShare(): Promise<SharedPayload | null> {
  if (!MeshDropShare || !MeshDropShare.getPendingShare) return null
  try {
    const payload = await MeshDropShare.getPendingShare()
    return payload || null
  } catch {
    return null
  }
}

/**
 * Clear the current pending share payload and trigger cache cleanup.
 */
export async function clearInitialShare(): Promise<void> {
  if (!MeshDropShare || !MeshDropShare.clearPendingShare) return
  try {
    await MeshDropShare.clearPendingShare()
  } catch {}
}

/**
 * Subscribe to incoming share intents while the app is running in foreground/background.
 */
export function onShareReceived(callback: (payload: SharedPayload) => void): () => void {
  const subscription: EmitterSubscription = DeviceEventEmitter.addListener(
    'MeshDropShare:received',
    (payload: SharedPayload) => {
      if (payload) {
        callback(payload)
      }
    }
  )

  return () => {
    subscription.remove()
  }
}
