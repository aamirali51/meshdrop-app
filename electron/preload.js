const { contextBridge, ipcRenderer, webUtils } = require('electron')

function toBuffer(data) {
  if (data === null || data === undefined || typeof data === 'number') return data
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

contextBridge.exposeInMainWorld('bridge', {
  pkg() {
    return ipcRenderer.sendSync('pkg')
  },
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onWindowMaximized: (callback) => {
    const wrap = (evt, val) => callback(val)
    ipcRenderer.on('window:maximized', wrap)
    return () => ipcRenderer.removeListener('window:maximized', wrap)
  },
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
  portableStatus: () => ipcRenderer.invoke('portable:status'),
  portableInstall: (options) => ipcRenderer.invoke('portable:install', options),
  portablePickFolder: () => ipcRenderer.invoke('portable:pickFolder'),
  getUpdateChannel: () => ipcRenderer.invoke('updater:getChannel'),
  setUpdateChannel: (channel) => ipcRenderer.invoke('updater:setChannel', channel),
  onUpdateStatus: (callback) => {
    const wrap = (evt, data) => callback(data)
    ipcRenderer.on('updater:status', wrap)
    return () => ipcRenderer.removeListener('updater:status', wrap)
  },
  // UPDATE_DOWNLOADED event: fired once a new version is fully downloaded.
  onUpdateDownloaded: (callback) => {
    const wrap = (evt, data) => callback(data)
    ipcRenderer.on('updater:downloaded', wrap)
    return () => ipcRenderer.removeListener('updater:downloaded', wrap)
  },
  // RESTART_AND_INSTALL: quit and apply the downloaded update.
  restartAndInstall: () => {
    return ipcRenderer.invoke('updater:restartAndInstall')
  },
  applyUpdate: () => ipcRenderer.invoke('updater:quitAndInstall'),
  appAfterUpdate: () => ipcRenderer.invoke('app:afterUpdate'),
  startWorker: (specifier) => ipcRenderer.invoke('pear:startWorker', specifier),
  onWorkerStdout: (specifier, listener) => {
    const wrap = (evt, data) => listener(toBuffer(data))
    ipcRenderer.on('pear:worker:stdout:' + specifier, wrap)
    return () => ipcRenderer.removeListener('pear:worker:stdout:' + specifier, wrap)
  },
  onWorkerStderr: (specifier, listener) => {
    const wrap = (evt, data) => listener(toBuffer(data))
    ipcRenderer.on('pear:worker:stderr:' + specifier, wrap)
    return () => ipcRenderer.removeListener('pear:worker:stderr:' + specifier, wrap)
  },
  onWorkerIPC: (specifier, listener) => {
    const wrap = (evt, data) => listener(toBuffer(data))
    ipcRenderer.on('pear:worker:ipc:' + specifier, wrap)
    return () => ipcRenderer.removeListener('pear:worker:ipc:' + specifier, wrap)
  },
  onWorkerExit: (specifier, listener) => {
    const wrap = (evt, code) => listener(code)
    ipcRenderer.on('pear:worker:exit:' + specifier, wrap)
    return () => ipcRenderer.removeListener('pear:worker:exit:' + specifier, wrap)
  },
  writeWorkerIPC: (specifier, data) => {
    return ipcRenderer.invoke('pear:worker:writeIPC:' + specifier, data)
  },
  getPathForFile: (file) => {
    return webUtils.getPathForFile(file)
  },
  openFileDialog: () => {
    return ipcRenderer.invoke('dialog:openFile')
  },
  openFilesDialog: () => {
    return ipcRenderer.invoke('dialog:openFiles')
  },
  openFolderDialog: () => {
    return ipcRenderer.invoke('dialog:openFolder')
  },
  saveTempFile: (filename, buffer) => {
    return ipcRenderer.invoke('file:saveTemp', filename, buffer)
  },
  openPath: (filePath) => {
    return ipcRenderer.invoke('shell:openPath', filePath)
  },
  openExternal: (url) => {
    return ipcRenderer.invoke('shell:openExternal', url)
  },
  showItemInFolder: (filePath) => {
    return ipcRenderer.invoke('shell:showItemInFolder', filePath)
  },
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (data) => ipcRenderer.invoke('clipboard:write', data),
  onClipboardChanged: (callback) => {
    const wrap = (evt, data) => callback(data)
    ipcRenderer.on('clipboard:changed', wrap)
    return () => ipcRenderer.removeListener('clipboard:changed', wrap)
  },
  onTrayHidden: (callback) => {
    const wrap = () => callback()
    ipcRenderer.on('app:tray-hidden', wrap)
    return () => ipcRenderer.removeListener('app:tray-hidden', wrap)
  },
  onDeepLink: (callback) => {
    const wrap = (evt, data) => callback(data)
    ipcRenderer.on('app:deep-link', wrap)
    return () => ipcRenderer.removeListener('app:deep-link', wrap)
  }
})
