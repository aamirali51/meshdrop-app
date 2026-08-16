import { NativeModules, Platform } from 'react-native'

const { MeshDropBackgroundService } = NativeModules

export async function startBackgroundSync(): Promise<boolean> {
  if (Platform.OS !== 'android' || !MeshDropBackgroundService) return false
  try {
    return await MeshDropBackgroundService.startBackgroundSync()
  } catch (err) {
    console.warn('[backgroundService] startBackgroundSync failed:', err)
    return false
  }
}

export async function stopBackgroundSync(): Promise<boolean> {
  if (Platform.OS !== 'android' || !MeshDropBackgroundService) return false
  try {
    return await MeshDropBackgroundService.stopBackgroundSync()
  } catch (err) {
    console.warn('[backgroundService] stopBackgroundSync failed:', err)
    return false
  }
}

export async function isBackgroundSyncRunning(): Promise<boolean> {
  if (Platform.OS !== 'android' || !MeshDropBackgroundService) return false
  try {
    return await MeshDropBackgroundService.isBackgroundSyncRunning()
  } catch {
    return false
  }
}

export async function isBatteryOptimizationIgnored(): Promise<boolean> {
  if (Platform.OS !== 'android' || !MeshDropBackgroundService) return true
  try {
    return await MeshDropBackgroundService.isBatteryOptimizationIgnored()
  } catch {
    return true
  }
}

export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  if (Platform.OS !== 'android' || !MeshDropBackgroundService) return true
  try {
    return await MeshDropBackgroundService.requestIgnoreBatteryOptimizations()
  } catch (err) {
    console.warn('[backgroundService] requestIgnoreBatteryOptimizations failed:', err)
    return false
  }
}

export async function showTransferOfferNotification(
  id: string,
  title: string,
  message: string
): Promise<boolean> {
  if (Platform.OS !== 'android' || !MeshDropBackgroundService?.showTransferOfferNotification) {
    return false
  }
  try {
    return await MeshDropBackgroundService.showTransferOfferNotification(id, title, message)
  } catch (err) {
    console.warn('[backgroundService] showTransferOfferNotification failed:', err)
    return false
  }
}

export async function showTransferProgressNotification(
  id: string,
  title: string,
  message: string,
  progress: number,
  max: number = 100
): Promise<boolean> {
  if (Platform.OS !== 'android' || !MeshDropBackgroundService?.showTransferProgressNotification) {
    return false
  }
  try {
    return await MeshDropBackgroundService.showTransferProgressNotification(
      id,
      title,
      message,
      Math.round(progress),
      max
    )
  } catch (err) {
    console.warn('[backgroundService] showTransferProgressNotification failed:', err)
    return false
  }
}

export async function showTransferCompleteNotification(
  id: string,
  title: string,
  message: string
): Promise<boolean> {
  if (Platform.OS !== 'android' || !MeshDropBackgroundService?.showTransferCompleteNotification) {
    return false
  }
  try {
    return await MeshDropBackgroundService.showTransferCompleteNotification(id, title, message)
  } catch (err) {
    console.warn('[backgroundService] showTransferCompleteNotification failed:', err)
    return false
  }
}

export async function cancelTransferNotification(id: string): Promise<boolean> {
  if (Platform.OS !== 'android' || !MeshDropBackgroundService?.cancelTransferNotification) {
    return false
  }
  try {
    return await MeshDropBackgroundService.cancelTransferNotification(id)
  } catch (err) {
    console.warn('[backgroundService] cancelTransferNotification failed:', err)
    return false
  }
}

