import { NativeModules } from 'react-native'

const native = NativeModules.MeshDropClipboard

/**
 * Write text to the system clipboard. Returns true when the native clipboard
 * module is available and the write succeeded; false otherwise so callers can
 * fall back to an honest message instead of claiming a copy that never happened.
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
