import { NativeModules } from 'react-native'

const native = NativeModules.MeshDropClipboard

/**
 * Write text to the system clipboard.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!native || typeof native.setString !== 'function') return false
  try {
    await native.setString(String(text ?? ''))
    return true
  } catch {
    return false
  }
}

/**
 * Read text from the system clipboard.
 */
export async function getClipboardText(): Promise<string> {
  if (!native || typeof native.getString !== 'function') return ''
  try {
    const text = await native.getString()
    return String(text || '')
  } catch {
    return ''
  }
}
