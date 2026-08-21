'use strict'

// Native OS Context Menu Manager (Windows Explorer & Linux Desktop).
//
// Allows users to right-click any file or directory in their OS file explorer
// and select "Send via MeshDrop" (or cascade into dynamic online device targets).
// Operates under HKCU on Windows (zero admin rights required; works for both
// portable exes and NSIS installations).

const { execFile, exec } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const SHELL_REG_TARGETS = [
  { root: 'HKCU\\Software\\Classes\\*\\shell\\MeshDrop', subKeyPath: '*\\shell\\MeshDrop' },
  { root: 'HKCU\\Software\\Classes\\Directory\\shell\\MeshDrop', subKeyPath: 'Directory\\shell\\MeshDrop' }
]

function runReg(args) {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true }, (err, stdout, stderr) => {
      resolve({ err, stdout, stderr })
    })
  })
}

/**
 * Register Windows Explorer context menu handlers.
 * @param {object} options
 * @param {string} [options.execPath] Path to MeshDrop executable
 * @param {Array} [options.devices] List of paired/online devices for cascading sub-menus
 */
async function registerWindowsContextMenu({ execPath, devices = [] } = {}) {
  if (process.platform !== 'win32') return

  const binPath = execPath || (process.env.APPIMAGE || process.execPath)
  if (!binPath) return

  try {
    for (const { root, subKeyPath } of SHELL_REG_TARGETS) {
      // 1. Set root verb properties
      await runReg(['add', root, '/ve', '/d', 'Send via MeshDrop', '/f'])
      await runReg(['add', root, '/v', 'MUIVerb', '/d', 'Send via MeshDrop', '/f'])
      await runReg(['add', root, '/v', 'Icon', '/d', binPath, '/f'])

      if (devices.length > 0) {
        // Cascading sub-menu mode via ExtendedSubCommandsKey
        await runReg(['add', root, '/v', 'ExtendedSubCommandsKey', '/d', subKeyPath, '/f'])
        await runReg(['delete', root, '/v', 'SubCommands', '/f'])
        await runReg(['delete', `${root}\\command`, '/f'])

        // Purge old child shell items
        await runReg(['delete', `${root}\\shell`, '/f'])

        // Option 0: Open in-app device picker
        const pickerKey = `${root}\\shell\\0_picker`
        await runReg(['add', pickerKey, '/ve', '/d', 'Select Device in MeshDrop...', '/f'])
        await runReg(['add', pickerKey, '/v', 'MUIVerb', '/d', 'Select Device in MeshDrop...', '/f'])
        await runReg(['add', pickerKey, '/v', 'Icon', '/d', binPath, '/f'])
        await runReg(['add', `${pickerKey}\\command`, '/ve', '/d', `"${binPath}" --send "%1"`, '/f'])

        // Option 1..N: Individual paired / online devices (up to 12)
        const displayDevices = devices.slice(0, 12)
        for (let idx = 0; idx < displayDevices.length; idx++) {
          const dev = displayDevices[idx]
          const devId = (dev.id || dev.publicKey || `dev_${idx}`).replace(/[^a-zA-Z0-9_-]/g, '')
          const devKey = dev.publicKey || dev.id
          const peerName = (dev.name || 'Unnamed Device').replace(/"/g, '')
          const statusSuffix = dev.isOnline ? ' (Online)' : ''
          const label = `${peerName}${statusSuffix}`

          const itemKey = `${root}\\shell\\${idx + 1}_${devId}`
          await runReg(['add', itemKey, '/ve', '/d', label, '/f'])
          await runReg(['add', itemKey, '/v', 'MUIVerb', '/d', label, '/f'])
          await runReg(['add', itemKey, '/v', 'Icon', '/d', binPath, '/f'])
          await runReg(['add', `${itemKey}\\command`, '/ve', '/d', `"${binPath}" --send-to "${devKey}" "%1"`, '/f'])
        }
      } else {
        // Flat mode: single action opens MeshDrop picker
        await runReg(['delete', root, '/v', 'ExtendedSubCommandsKey', '/f'])
        await runReg(['delete', root, '/v', 'SubCommands', '/f'])
        await runReg(['delete', `${root}\\shell`, '/f'])
        await runReg(['add', `${root}\\command`, '/ve', '/d', `"${binPath}" --send "%1"`, '/f'])
      }
    }
    console.log('[ContextMenu] Windows Explorer context menu registered successfully')
  } catch (err) {
    console.warn('[ContextMenu] Failed to register Windows context menu:', err.message)
  }
}

/**
 * Remove Windows Explorer context menu registry keys.
 */
async function unregisterWindowsContextMenu() {
  if (process.platform !== 'win32') return

  for (const { root } of SHELL_REG_TARGETS) {
    await runReg(['delete', root, '/f'])
  }
  console.log('[ContextMenu] Windows Explorer context menu removed')
}

/**
 * Register Linux file manager scripts (Nautilus, Nemo, Caja).
 */
function registerLinuxContextMenu({ execPath } = {}) {
  if (process.platform !== 'linux') return Promise.resolve()

  return new Promise((resolve) => {
    try {
      const binPath = process.env.APPIMAGE || execPath || process.execPath
      const nautilusScriptsDir = path.join(os.homedir(), '.local', 'share', 'nautilus', 'scripts')
      fs.mkdirSync(nautilusScriptsDir, { recursive: true })

      const scriptFile = path.join(nautilusScriptsDir, 'Send via MeshDrop')
      const scriptContent = `#!/bin/sh\n"${binPath}" --send "$@"\n`

      fs.writeFileSync(scriptFile, scriptContent, { mode: 0o755 })
      console.log('[ContextMenu] Linux file manager script registered:', scriptFile)
    } catch (err) {
      console.warn('[ContextMenu] Failed to write Linux script:', err.message)
    }
    resolve()
  })
}

function unregisterLinuxContextMenu() {
  if (process.platform !== 'linux') return Promise.resolve()

  return new Promise((resolve) => {
    try {
      const scriptFile = path.join(os.homedir(), '.local', 'share', 'nautilus', 'scripts', 'Send via MeshDrop')
      if (fs.existsSync(scriptFile)) fs.unlinkSync(scriptFile)
    } catch {}
    resolve()
  })
}

module.exports = {
  registerWindowsContextMenu,
  unregisterWindowsContextMenu,
  registerLinuxContextMenu,
  unregisterLinuxContextMenu
}
