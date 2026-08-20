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

const SHELL_REG_ROOTS = [
  'HKCU\\Software\\Classes\\*\\shell\\MeshDrop',
  'HKCU\\Software\\Classes\\Directory\\shell\\MeshDrop'
]

/**
 * Register Windows Explorer context menu handlers.
 * @param {object} options
 * @param {string} [options.execPath] Path to MeshDrop executable
 * @param {Array} [options.devices] List of paired/online devices for cascading sub-menus
 */
function registerWindowsContextMenu({ execPath, devices = [] } = {}) {
  if (process.platform !== 'win32') return Promise.resolve()

  const binPath = execPath || process.execPath
  const safeBin = `"${binPath}"`

  return new Promise((resolve) => {
    // 1. Root context menu for files and directories
    const commands = []

    for (const root of SHELL_REG_ROOTS) {
      commands.push(`reg add "${root}" /ve /d "Send via MeshDrop" /f`)
      commands.push(`reg add "${root}" /v "Icon" /d ${safeBin} /f`)

      if (devices.length > 0) {
        // If we have paired devices, create a cascading submenu
        commands.push(`reg add "${root}" /v "SubCommands" /d "" /f`)
      } else {
        // Direct root click invokes quick device picker
        commands.push(`reg delete "${root}" /v "SubCommands" /f 2>nul`)
        commands.push(`reg add "${root}\\command" /ve /d "${safeBin} --send \\"%1\\"" /f`)
      }
    }

    // 2. Populate dynamic sub-commands if devices exist
    if (devices.length > 0) {
      for (const root of SHELL_REG_ROOTS) {
        // Add "Choose device..." general option first
        commands.push(`reg add "${root}\\shell\\0_picker" /v "MUIVerb" /d "Select Device in MeshDrop..." /f`)
        commands.push(`reg add "${root}\\shell\\0_picker\\command" /ve /d "${safeBin} --send \\"%1\\"" /f`)

        devices.slice(0, 8).forEach((dev, idx) => {
          const devId = (dev.id || dev.publicKey || `dev_${idx}`).replace(/[^a-zA-Z0-9_-]/g, '')
          const devKey = dev.publicKey || dev.id
          const peerName = (dev.name || 'Unnamed Device').replace(/"/g, '')
          const statusSuffix = dev.isOnline ? ' (Online)' : ''
          const label = `${peerName}${statusSuffix}`

          commands.push(`reg add "${root}\\shell\\${idx + 1}_${devId}" /v "MUIVerb" /d "${label}" /f`)
          commands.push(`reg add "${root}\\shell\\${idx + 1}_${devId}\\command" /ve /d "${safeBin} --send-to \\"${devKey}\\" \\"%1\\"" /f`)
        })
      }
    }

    // Execute registry updates sequentially
    const fullCmd = commands.join(' & ')
    exec(fullCmd, { windowsHide: true }, (err) => {
      if (err) {
        console.warn('[ContextMenu] Failed to register Windows context menu:', err.message)
      } else {
        console.log('[ContextMenu] Windows Explorer context menu registered successfully')
      }
      resolve()
    })
  })
}

/**
 * Remove Windows Explorer context menu registry keys.
 */
function unregisterWindowsContextMenu() {
  if (process.platform !== 'win32') return Promise.resolve()

  return new Promise((resolve) => {
    const commands = SHELL_REG_ROOTS.map((root) => `reg delete "${root}" /f 2>nul`)
    exec(commands.join(' & '), { windowsHide: true }, () => {
      console.log('[ContextMenu] Windows Explorer context menu removed')
      resolve()
    })
  })
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
