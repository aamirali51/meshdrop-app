import { PermissionsAndroid, Platform, Linking, Alert } from 'react-native'

export interface PermissionStatus {
  storage: boolean
  notifications: boolean
  nearbyDevices: boolean
}

/**
 * Check whether storage / media permissions are granted.
 */
export async function checkStoragePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10)

  try {
    if (apiLevel >= 33) {
      const [images, video, audio] = await Promise.all([
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES),
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO),
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO),
      ])
      return images || video || audio
    } else {
      return await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
      )
    }
  } catch {
    return false
  }
}

/**
 * Request storage / media permissions with user rationale.
 */
export async function requestStoragePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10)

  try {
    if (apiLevel >= 33) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
      ])
      return (
        results[PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES] ===
          PermissionsAndroid.RESULTS.GRANTED ||
        results[PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO] ===
          PermissionsAndroid.RESULTS.GRANTED ||
        results[PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO] ===
          PermissionsAndroid.RESULTS.GRANTED
      )
    } else {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        {
          title: 'Storage Permission Required',
          message: 'MeshDrop needs access to storage to transfer and sync files directly between your devices.',
          buttonPositive: 'Grant Access',
          buttonNegative: 'Cancel',
        }
      )
      return granted === PermissionsAndroid.RESULTS.GRANTED
    }
  } catch (err) {
    console.warn('[permissions] Storage request error:', err)
    return false
  }
}

/**
 * Check if notification permission is granted (Android 13+).
 */
export async function checkNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10)
  if (apiLevel < 33) return true

  try {
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    )
  } catch {
    return false
  }
}

/**
 * Request notification permission for background transfer alerts.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10)
  if (apiLevel < 33) return true

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: 'Notification Permission Required',
        message: 'MeshDrop needs notifications to alert you when incoming files arrive or transfers finish.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    )
    return granted === PermissionsAndroid.RESULTS.GRANTED
  } catch (err) {
    console.warn('[permissions] Notification request error:', err)
    return false
  }
}

/**
 * Check if nearby Wi-Fi / LAN discovery permission is granted (Android 13+).
 */
export async function checkNearbyWifiPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10)
  if (apiLevel < 33) return true

  try {
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES
    )
  } catch {
    return false
  }
}

/**
 * Request nearby Wi-Fi devices permission for zero-config LAN peer discovery.
 */
export async function requestNearbyWifiPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10)
  if (apiLevel < 33) return true

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
      {
        title: 'Local Device Discovery',
        message: 'MeshDrop uses local network discovery to find your nearby desktop and mobile devices at high LAN speed.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    )
    return granted === PermissionsAndroid.RESULTS.GRANTED
  } catch (err) {
    console.warn('[permissions] Nearby Wi-Fi request error:', err)
    return false
  }
}

/**
 * Check all essential Android permissions.
 */
export async function checkAllPermissions(): Promise<PermissionStatus> {
  const [storage, notifications, nearbyDevices] = await Promise.all([
    checkStoragePermission(),
    checkNotificationPermission(),
    checkNearbyWifiPermission(),
  ])

  return {
    storage,
    notifications,
    nearbyDevices,
  }
}

/**
 * Request all essential Android permissions sequentially with clean user prompts.
 */
export async function requestAllPermissions(): Promise<PermissionStatus> {
  const storage = await requestStoragePermission()
  const notifications = await requestNotificationPermission()
  const nearbyDevices = await requestNearbyWifiPermission()

  return {
    storage,
    notifications,
    nearbyDevices,
  }
}

/**
 * Open Android system app settings page.
 */
export function openAppSettings() {
  Linking.openSettings().catch(() => {
    Alert.alert('Unable to Open Settings', 'Please open system Settings > Apps > MeshDrop to manage permissions.')
  })
}
