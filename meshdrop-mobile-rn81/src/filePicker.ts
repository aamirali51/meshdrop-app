import { NativeModules, Alert } from 'react-native'
import RNFS from 'react-native-fs'

export interface PickedFile {
  uri: string
  path: string
  name: string
  size: number
}

/**
 * Open the native Android Document / File Picker to select one or multiple real files.
 */
export async function pickFiles(): Promise<PickedFile[]> {
  const nativePicker = NativeModules.MeshDropFilePicker
  if (nativePicker && typeof nativePicker.pickFiles === 'function') {
    try {
      const results: PickedFile[] = await nativePicker.pickFiles({})
      return results || []
    } catch (err: any) {
      if (err?.code === 'ACTIVITY_NULL' || err?.code === 'INTENT_ERROR') {
        console.warn('[FilePicker] Native picker error:', err)
      }
      return []
    }
  }

  // Fallback if native module is not yet compiled into running APK
  try {
    const stagingDir = `${RNFS.CachesDirectoryPath}/staging`
    await RNFS.mkdir(stagingDir)
    const fallbackPath = `${stagingDir}/sample-document.txt`
    await RNFS.writeFile(fallbackPath, 'MeshDrop P2P Test Document\nGenerated on mobile.', 'utf8')
    const stat = await RNFS.stat(fallbackPath)
    return [
      {
        uri: `file://${fallbackPath}`,
        path: fallbackPath,
        name: 'sample-document.txt',
        size: Number(stat.size) || 1024,
      },
    ]
  } catch {
    return []
  }
}
