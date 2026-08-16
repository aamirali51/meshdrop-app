'use strict'

// System tray icon. Own module so main.js stays focused on window/worker
// lifecycle. `onQuit` is provided by main.js (it flips the quitting flag
// before calling app.quit()).

const { Tray, Menu, nativeImage } = require('electron')
// IMPORTANT: use the asar-aware `fs`, NOT `original-fs`. In a packaged app the
// build/ resources live inside app.asar, and original-fs bypasses Electron's
// asar support — the tray icon would silently fall back to the generic
// placeholder. (updater/portable use original-fs because they read real exe
// paths outside the asar; tray reads packaged resources, which need asar.)
const fs = require('fs')
const path = require('path')

let tray = null
let currentWin = null
let currentOnQuit = null
let currentOnToggleStartup = null
let currentOnToggleStartMinimized = null
let currentStartupSettings = { launchAtStartup: false, startMinimized: true }

function loadNativeImage(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath)
      const img = nativeImage.createFromBuffer(buf)
      if (!img.isEmpty()) return img
    }
  } catch {}
  return null
}

function buildContextMenu() {
  if (!tray || !currentWin) return
  const { launchAtStartup, startMinimized } = currentStartupSettings
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open MeshDrop',
      click: () => {
        if (currentWin.isMinimized()) currentWin.restore()
        currentWin.show()
        currentWin.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Launch on Startup',
      type: 'checkbox',
      checked: Boolean(launchAtStartup),
      click: (menuItem) => {
        currentStartupSettings.launchAtStartup = menuItem.checked
        if (currentOnToggleStartup) {
          currentOnToggleStartup(menuItem.checked)
        }
      }
    },
    {
      label: 'Start Minimized to Tray',
      type: 'checkbox',
      checked: Boolean(startMinimized),
      click: (menuItem) => {
        currentStartupSettings.startMinimized = menuItem.checked
        if (currentOnToggleStartMinimized) {
          currentOnToggleStartMinimized(menuItem.checked)
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit MeshDrop',
      click: currentOnQuit
    }
  ])

  tray.setContextMenu(contextMenu)
}

function createTrayIcon({ win, onQuit, onToggleStartup, onToggleStartMinimized, initialSettings }) {
  if (tray) return
  currentWin = win
  currentOnQuit = onQuit
  currentOnToggleStartup = onToggleStartup
  currentOnToggleStartMinimized = onToggleStartMinimized
  if (initialSettings) {
    if (typeof initialSettings.launchAtStartup === 'boolean') {
      currentStartupSettings.launchAtStartup = initialSettings.launchAtStartup
    }
    if (typeof initialSettings.startMinimized === 'boolean') {
      currentStartupSettings.startMinimized = initialSettings.startMinimized
    }
  }

  try {
    const iconDirs = [
      path.join(__dirname, '..', 'build'),
      path.join(__dirname, '..', '..', 'build'),
      path.join(process.resourcesPath, 'build'),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'build')
    ]
    let icon = null
    for (const baseDir of iconDirs) {
      const tray1x = path.join(baseDir, 'icon', 'tray-16x16.png')
      const tray2x = path.join(baseDir, 'icon', 'tray-32x32.png')
      if (fs.existsSync(tray1x)) {
        icon = loadNativeImage(tray1x)
        if (icon && fs.existsSync(tray2x)) {
          try {
            const buf2x = fs.readFileSync(tray2x)
            icon.addRepresentation({ scaleFactor: 2, buffer: buf2x })
          } catch {}
        }
        if (icon) break
      }
      const iconFileName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
      const iconPath = path.join(baseDir, iconFileName)
      if (fs.existsSync(iconPath)) {
        icon = loadNativeImage(iconPath)
        if (icon) break
      }
    }
    if (!icon || icon.isEmpty()) {
      const iconPngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA_SURBVDhPY2AYCjAwMvwfhJpGBhgZGBgYD8f__wxgGMDEyMDDAxBhgGgY0MP4HwzD1wzAMwzAaBwADAM0nEQz6cWjDAAAAAElFTkSuQmCC',
        'base64'
      )
      icon = nativeImage.createFromBuffer(iconPngBuffer)
    }
    tray = new Tray(icon)
    tray.setToolTip('MeshDrop — Peer-to-Peer File Sharing')

    buildContextMenu()

    tray.on('double-click', () => {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    })
  } catch (err) {
    console.error('Failed to create tray icon:', err.message)
  }
}

function updateTraySettings({ launchAtStartup, startMinimized }) {
  if (typeof launchAtStartup === 'boolean') {
    currentStartupSettings.launchAtStartup = launchAtStartup
  }
  if (typeof startMinimized === 'boolean') {
    currentStartupSettings.startMinimized = startMinimized
  }
  buildContextMenu()
}

function destroyTray() {
  if (tray) {
    try {
      tray.destroy()
    } catch {}
    tray = null
  }
}

module.exports = { createTrayIcon, updateTraySettings, destroyTray }

