/// <reference types="vite/client" />

interface Bridge {
  pkg(): {
    name: string
    productName: string
    version: string
    upgrade: string
    description: string
  }
  applyUpdate: () => Promise<void>
  appAfterUpdate: () => Promise<void>
  startWorker: (specifier: string) => Promise<boolean>
  onWorkerStdout: (specifier: string, listener: (data: Uint8Array) => void) => () => void
  onWorkerStderr: (specifier: string, listener: (data: Uint8Array) => void) => () => void
  onWorkerIPC: (specifier: string, listener: (data: Uint8Array) => void) => () => void
  onWorkerExit: (specifier: string, listener: (code: number) => void) => () => void
  writeWorkerIPC: (specifier: string, data: string | Uint8Array) => Promise<void>
  getPathForFile?: (file: File) => string
  openFileDialog?: () => Promise<{ filePath: string; filename: string; fileSize: number } | null>
  saveTempFile?: (
    filename: string,
    buffer: ArrayBuffer
  ) => Promise<{ filePath: string; filename: string; fileSize: number } | null>
  writeClipboard: (data: { text: string }) => Promise<void>
  onClipboardChanged: (callback: (data: { type: string; content: string }) => void) => () => void
}

declare global {
  interface Window {
    bridge: Bridge
  }
}
