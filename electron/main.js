const { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell } = require('electron')

const fs = require('fs')
const os = require('os')
const path = require('path')

const { isMac } = require('which-runtime')
const { command, flag } = require('paparam')
const pkg = require('../package.json')
const { name, productName, version } = pkg
const {
  createResponse,
  parseMessage,
  isProtocolCompatible,
  METHODS
} = require('../src/shared/protocol.js')
const {
  startWebDAVServer,
  stopWebDAVServer,
  mountWindowsDrive,
  unmountWindowsDrive,
  getDriveStatus,
  updateDrivePermissions,
  setFileCreatedCallback
} = require('./webdav')
const { setupUpdater } = require('./updater')
const { registerIpcHandlers } = require('./ipc')
const { createTrayIcon, updateTraySettings } = require('./tray')
const { createEngineBridge, WORKER_SPECIFIER } = require('./engine')
const { registerEngineHandlers } = require('./handlers')
const {
  registerWindowsContextMenu,
  unregisterWindowsContextMenu,
  registerLinuxContextMenu
} = require('./contextMenu')

const protocol = name

const appName = productName ?? name


const cmd = command(
  appName,
  flag('--storage <dir>', 'pass custom storage dir (userData root)'),
  flag('--no-updates', 'start without OTA updates'),
  flag('--no-sandbox', 'start without Chromium sandbox').hide(),
  flag('--allow-multiple-instances', 'allow multiple app instances').hide(),
  flag(
    '--test-peer',
    'local multi-instance testing: dedicated profile, no single-instance lock'
  ).hide()
)

const APP_FLAGS = new Set([
  '--no-updates',
  '--allow-multiple-instances',
  '--storage',
  '--test-peer'
])
let argStart = 1
while (argStart < process.argv.length) {
  const a = process.argv[argStart]
  if (!a.startsWith('-')) {
    argStart++
    continue
  }
  if (APP_FLAGS.has(a)) break
  argStart++
}
cmd.parse(process.argv.slice(argStart))

const pearStore = cmd.flags.storage
const updates = cmd.flags.updates
const allowMultipleInstances = cmd.flags.allowMultipleInstances
// Dev-only: run a second instance side-by-side with its own identity for
// local P2P testing. Implies skipping the single-instance lock and using a
// dedicated userData directory.
const testPeer = cmd.flags.testPeer

function getStorageDir() {
  if (pearStore) return path.resolve(pearStore)
  // Local multi-instance testing: a dedicated profile next to the project
  // root gives this instance its own corestore, hence its own cryptographic
  // identity, without touching real user data.
  if (testPeer) return path.join(process.cwd(), '.p2p-test-profile')
  return null
}

// Custom storage roots redirect userData; the engine then stores its state
// under <userData>/mesh_store and receives files in the OS downloads folder.
const customStorage = getStorageDir()
if (customStorage) app.setPath('userData', customStorage)

// Portable mode (single-file sfx or folder portable): ALL app state (mesh
// identity, devices, transfers, settings) lives in a `data/` folder next to
// the app, so the whole mesh travels with it. An explicit --storage flag
// always wins. Unwritable locations fall back to AppData with a warning.
const portable = require('./portable')
if (!customStorage) {
  const portableDataDir = portable.ensurePortableDataDir()
  if (portableDataDir) app.setPath('userData', portableDataDir)
}
// Rollback: a leftover <appDir>.old from the last folder update means the new
// build booted — drop the backup. (The sfx path cleans <exe>.old in the
// updater's startup block.)
portable.applyStartupCleanup()
portable.setupPortableIpc()

function getLabel() {
  if (cmd.flags.storage) return path.basename(cmd.flags.storage)
  if (testPeer) return 'test-peer'
  return 'default'
}

ipcMain.on('pkg', (evt) => {
  evt.returnValue = pkg
})

function sendToAll(name, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(name, data)
  }
}

// ─── P2P Engine (in-process @mesh/core) ─────────────────────────────────────
//
// The old architecture ran the P2P engine in a separate Bare worker process
// (PearRuntime + FramedStream pipe over IPC). The engine now lives directly
// in the Electron main process; the renderer's 'pear:worker:ipc:' channel is
// served by main itself, so the preload/renderer bridge contract is intact.

async function getPersistedSettings() {
  try {
    const bee = await engineBridge.engine.getBee('settings')
    const entry = await bee.get('settings')
    return entry?.value || {}
  } catch {
    return {}
  }
}

function applyLinuxAutostart(openAtLogin, startMinimized) {
  if (process.platform !== 'linux') return
  try {
    const autostartDir = path.join(os.homedir(), '.config', 'autostart')
    const desktopFilePath = path.join(autostartDir, `${appName.toLowerCase()}.desktop`)

    if (!openAtLogin) {
      if (fs.existsSync(desktopFilePath)) {
        fs.unlinkSync(desktopFilePath)
      }
      return
    }

    const execPath = process.env.APPIMAGE || process.execPath
    const execArgs = startMinimized ? ' --hidden' : ''
    const content = `[Desktop Entry]
Type=Application
Version=1.0
Name=${appName}
Comment=MeshDrop — Zero-Cloud P2P File Sharing
Exec="${execPath}"${execArgs}
StartupNotify=false
Terminal=false
`
    fs.mkdirSync(autostartDir, { recursive: true })
    fs.writeFileSync(desktopFilePath, content, { mode: 0o755 })
    console.log(`[Main:Linux] Written XDG autostart desktop file: ${desktopFilePath}`)
  } catch (err) {
    console.warn('[Main:Linux] Failed to write XDG autostart file:', err.message)
  }
}

async function updateAutoStart(explicitSettings = null) {
  try {
    const saved = explicitSettings || (await getPersistedSettings())
    const syncEngine = engineBridge.engine?.syncEngine
    const libraries = syncEngine ? Array.from(syncEngine.libraries.values()) : []
    const activeCount = libraries.filter((lib) => !lib.paused).length

    const launchAtStartup = Boolean(saved.launchAtStartup || activeCount > 0)
    const startMinimized = saved.startMinimized !== false // default true

    const currentSettings = app.getLoginItemSettings()
    const currentArgs = currentSettings.args || []
    const needsHiddenArg = startMinimized
    const hasHiddenArg = currentArgs.includes('--hidden')

    if (
      currentSettings.openAtLogin !== launchAtStartup ||
      (launchAtStartup && hasHiddenArg !== needsHiddenArg)
    ) {
      console.log(
        `[Main] Syncing OS auto-start: openAtLogin = ${launchAtStartup}, startMinimized = ${startMinimized}`
      )
      const targetPath = process.env.APPIMAGE || process.execPath
      app.setLoginItemSettings({
        openAtLogin: launchAtStartup,
        openAsHidden: startMinimized,
        path: targetPath,
        args: startMinimized ? ['--hidden'] : []
      })
    }

    if (process.platform === 'linux') {
      applyLinuxAutostart(launchAtStartup, startMinimized)
    }

    updateTraySettings({
      launchAtStartup: Boolean(saved.launchAtStartup),
      startMinimized: Boolean(startMinimized)
    })
  } catch (err) {
    console.warn('[Main] Failed to update auto-start:', err.message)
  }
}

async function handleTrayToggleStartup(val) {
  try {
    const bee = await engineBridge.engine.getBee('settings')
    const entry = await bee.get('settings')
    const current = entry?.value || {}
    const updated = { ...current, launchAtStartup: val }
    await bee.put('settings', updated)
    await updateAutoStart(updated)
    const { createEvent, EVENTS } = require('../src/shared/protocol.js')
    sendToAll('pear:worker:ipc:' + WORKER_SPECIFIER, Buffer.from(createEvent(EVENTS.SETTINGS_UPDATED, updated)))
  } catch (err) {
    console.warn('[Main] Failed to toggle startup from tray:', err.message)
  }
}

async function handleTrayToggleStartMinimized(val) {
  try {
    const bee = await engineBridge.engine.getBee('settings')
    const entry = await bee.get('settings')
    const current = entry?.value || {}
    const updated = { ...current, startMinimized: val }
    await bee.put('settings', updated)
    await updateAutoStart(updated)
    const { createEvent, EVENTS } = require('../src/shared/protocol.js')
    sendToAll('pear:worker:ipc:' + WORKER_SPECIFIER, Buffer.from(createEvent(EVENTS.SETTINGS_UPDATED, updated)))
  } catch (err) {
    console.warn('[Main] Failed to toggle start minimized from tray:', err.message)
  }
}

const engineBridge = createEngineBridge({
  storageDir: path.join(app.getPath('userData'), 'mesh_store'),
  downloadsDir: app.getPath('downloads'),
  deviceName: os.hostname(),
  sendToAll,
  getLabel
})

const engineHandlers = registerEngineHandlers({
  engine: engineBridge.engine,
  sendToAll,
  getLabel,
  updateAutoStart
})

// WebDAV ("Drive") file creations broadcast to paired peers through the
// engine's signaling channels (previously piped into the Bare worker).
setFileCreatedCallback((item) => {
  try {
    console.log('[Main] WebDAV file created, broadcasting to P2P peers:', item.filename)
    engineHandlers[METHODS.DRIVE_BROADCAST_FILE](item).catch((err) => {
      console.error('[Main] Failed to broadcast WebDAV file:', err.message)
    })
  } catch (err) {
    console.error('[Main] Failed to broadcast WebDAV file:', err.message)
  }
})

function safeParseIPC(raw) {
  try {
    if (!raw) return null
    if (typeof raw === 'string') return JSON.parse(raw)
    if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString('utf8'))
    if (raw instanceof Uint8Array || raw instanceof ArrayBuffer)
      return JSON.parse(Buffer.from(raw).toString('utf8'))
    if (typeof raw === 'object' && raw.type === 'Buffer' && Array.isArray(raw.data)) {
      return JSON.parse(Buffer.from(raw.data).toString('utf8'))
    }
    if (typeof raw === 'object') return raw
    return null
  } catch {
    return null
  }
}

async function respond(win, msg, result, error) {
  const response = createResponse(msg.id, result, error)
  if (!win.isDestroyed()) {
    win.webContents.send('pear:worker:ipc:' + WORKER_SPECIFIER, Buffer.from(response))
  }
}

// The renderer's request router (renderer/src/lib/ipc.ts) sends protocol
// requests over writeWorkerIPC; main now executes them against the engine.
ipcMain.handle('pear:worker:writeIPC:' + WORKER_SPECIFIER, async (evt, data) => {
  const win = BrowserWindow.fromWebContents(evt.sender)
  const msg = safeParseIPC(data)

  if (!msg || msg.type !== 'request' || typeof msg.method !== 'string') return true
  if (!isProtocolCompatible(msg)) {
    if (win) {
      respond(
        win,
        msg,
        null,
        `Protocol version mismatch (expected ${require('../src/shared/protocol.js').PROTOCOL_VERSION})`
      )
    }
    return true
  }

  // Drive (WebDAV) operations are answered by the main-process webdav module
  // (they manage a local mount, not the P2P engine).
  if (msg.method.startsWith('drive.')) {
    let result = null
    let error = null
    try {
      if (msg.method === 'drive.getStatus') {
        result = getDriveStatus()
      } else if (msg.method === 'drive.mount') {
        result = await mountWindowsDrive(msg.params?.driveLetter || 'Z')
      } else if (msg.method === 'drive.unmount') {
        result = await unmountWindowsDrive(msg.params?.driveLetter || 'Z')
      } else if (msg.method === 'drive.updatePermissions') {
        result = updateDrivePermissions(msg.params)
      } else {
        result = await engineHandlers[msg.method](msg.params)
      }
    } catch (err) {
      error = err.message
    }
    if (win) await respond(win, msg, result, error)
    return true
  }

  const ts = new Date().toISOString().slice(11, 23)
  const label = getLabel()
  const noisy = ['diagnostics.get', 'devices.list', 'sync.list', 'files.listPending', 'history.list', 'notifications.list', 'connection.status']
  if (!noisy.includes(msg.method)) {
    console.log(`[Main:${label} ${ts}] engine request ${msg.method} (${msg.id})`)
  }

  let result = null
  let error = null
  try {
    // The renderer can flush its queue before the engine finished booting
    // (its 1s fallback timer); await the shared start promise first.
    await engineBridge.start()
    const handler = engineHandlers[msg.method]
    if (!handler) throw new Error(`Unknown method: ${msg.method}`)
    result = await handler(msg.params)
  } catch (err) {
    error = err && err.message ? err.message : String(err)
    console.error(`[Main:${label}] engine request ${msg.method} failed:`, error)
  }
  if (win) await respond(win, msg, result, error)
  return true
})

ipcMain.handle('pear:startWorker', () => {
  // Kept for the renderer's ensureReady(); there is no worker anymore, but
  // starting the engine here lets the UI race the boot instead of failing.
  engineBridge.start().catch((err) => {
    console.error('[Main] Engine start failed:', err)
  })
  return true
})

let mainWindow = null
let isQuitting = false
let trayHintShown = false
let closePromptOpen = false

// Small persisted UI prefs (close behavior, ...) in userData. Kept separate
// from engine state so a "remember my choice" checkbox actually survives restarts.
function readUiSettings() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(app.getPath('userData'), 'ui-settings.json'), 'utf8')
    )
  } catch {
    return {}
  }
}

function writeUiSettings(patch) {
  try {
    const file = path.join(app.getPath('userData'), 'ui-settings.json')
    fs.writeFileSync(file, JSON.stringify({ ...readUiSettings(), ...patch }, null, 2))
  } catch (err) {
    console.error('[Main] Failed to persist UI settings:', err)
  }
}

app.on('before-quit', () => {
  isQuitting = true
})

async function createWindow() {
  const instLabel = getLabel()
  const isHiddenBoot =
    process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAsHidden
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'MeshDrop',
    show: !isHiddenBoot,
    backgroundColor: '#0B0F17',
    // Window icon: the .ico on Windows (taskbar/alt-tab), PNG on Linux.
    // macOS ignores this — the dock icon comes from the .icns in the bundle.
    // Resolves inside app.asar in packaged builds, on disk in dev.
    icon: path.join(
      __dirname,
      '..',
      'build',
      process.platform === 'win32' ? 'icon.ico' : 'icon.png'
    ),
    // Replace the classic OS frame with custom app chrome: frameless on
    // Windows/Linux (the TopBar renders its own window controls), and hidden
    // native traffic lights on macOS, which is the platform convention there.
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 24 } }
      : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      // The app hides to the tray on close; without this, Chromium throttles
      // hidden windows' JS timers to ~1/min, so the 4s diagnostics poll (and
      // any other renderer timers) would stall while the window is hidden.
      backgroundThrottling: false,
      devTools: !!process.env.PEAR_DEV_SERVER_URL
    }
  })

  mainWindow = win
  createTrayIcon({
    win,
    onQuit: () => {
      isQuitting = true
      app.quit()
    },
    onToggleStartup: handleTrayToggleStartup,
    onToggleStartMinimized: handleTrayToggleStartMinimized
  })

  // First close asks: tray (sync keeps running) or quit? The window stays
  // visible while the dialog is up so it can't get lost behind a hidden
  // parent; it only hides once the user picks "Close to tray".
  const showTrayHint = () => {
    if (trayHintShown) return
    trayHintShown = true
    try {
      new Notification({
        title: appName,
        body: 'MeshDrop is still running in the system tray.'
      }).show()
    } catch {}
    win.webContents.send('app:tray-hidden')
  }

  win.on('close', (evt) => {
    if (isQuitting) return
    evt.preventDefault()

    const settings = readUiSettings()
    if (settings.rememberClose) {
      if (settings.closeAction === 'quit') {
        isQuitting = true
        app.quit()
      } else {
        win.hide()
        showTrayHint()
      }
      return
    }

    if (closePromptOpen) return
    closePromptOpen = true
    dialog
      .showMessageBox(win, {
        type: 'question',
        title: appName,
        message: 'MeshDrop is closing',
        detail:
          'Close to the system tray and keep syncing in the background, or quit completely?',
        buttons: ['Close to tray', 'Quit'],
        defaultId: 0,
        cancelId: 0,
        checkboxLabel: 'Remember my choice',
        checkboxChecked: false
      })
      .then(({ response, checkboxChecked }) => {
        closePromptOpen = false
        const closeAction = response === 0 ? 'tray' : 'quit'
        if (checkboxChecked) writeUiSettings({ rememberClose: true, closeAction })
        if (closeAction === 'quit') {
          isQuitting = true
          app.quit()
        } else {
          win.hide()
          showTrayHint()
        }
      })
      .catch(() => {
        // Dialog dismissed without a choice (e.g. Esc) — fall back to tray.
        closePromptOpen = false
        win.hide()
      })
  })

  win.on('closed', () => console.log(`[Main:${instLabel}] window closed`))
  win.on('maximize', () => win.webContents.send('window:maximized', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized', false))
  win.webContents.on('destroyed', () => console.log(`[Main:${instLabel}] webContents destroyed`))
  win.webContents.on('crashed', () => console.log(`[Main:${instLabel}] webContents crashed`))
  win.webContents.on('render-process-gone', (e, details) =>
    console.log(`[Main:${instLabel}] render-process-gone:`, JSON.stringify(details))
  )
  win.webContents.on('did-finish-load', () => {
    console.log(`[Main:${instLabel}] did-finish-load`)
    const initialQuickSend = parseQuickSendArgs(process.argv)
    if (initialQuickSend) {
      setTimeout(() => handleQuickSend(initialQuickSend), 800)
    }
  })
  win.webContents.on('dom-ready', () => console.log(`[Main:${instLabel}] dom-ready`))
  win.webContents.on('did-fail-load', (e, code, desc) =>
    console.log(`[Main:${instLabel}] did-fail-load: ${code} ${desc}`)
  )


  // Forward renderer console.log/warn/error to the main-process terminal so
  // we can read [Renderer] / [App] / [ThemeProvider] logs in the dev:p2p output.
  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    const tag = ['verbose', 'info', 'warn', 'error'][level] || 'log'
    const src = sourceId ? sourceId.replace(/.*\/renderer\//, '') : ''
    const fn = level >= 3 ? console.error : level >= 2 ? console.warn : console.log
    fn(`[Renderer:${instLabel}][${tag}] ${message}  (${src}:${line})`)
  })

  const devServerUrl = process.env.PEAR_DEV_SERVER_URL

  if (devServerUrl) {
    await win.loadURL(devServerUrl)
    win.webContents.openDevTools()
  } else {
    // Build a real application menu (roles restore native shortcuts like
    // Cmd+C/V on macOS and Ctrl+C/V on Windows).
    const template = [
      ...(isMac
        ? [
            {
              label: appName,
              submenu: [
                { role: 'about', label: `About ${appName}` },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
              ]
            }
          ]
        : []),
      {
        label: 'File',
        submenu: [{ role: 'close', label: 'Close Window' }]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ role: 'front' }] : [])]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: `About ${appName}`,
            click: () => win.webContents.send('app:deep-link', { url: '' })
          }
        ]
      }
    ]
    if (isMac) {
      // macOS keeps the app menu in the system menu bar — it is required for
      // Cmd+C/V/X/A and lives outside the in-window chrome.
      Menu.setApplicationMenu(Menu.buildFromTemplate(template))
    } else {
      // Frameless windows render no menu bar, so drop the classic File/Edit
      // menus entirely on Windows/Linux. Chromium still handles text-editing
      // shortcuts (Ctrl+C/V/X/A) natively.
      Menu.setApplicationMenu(null)
    }
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools()
    })
    const distPath = path.join(__dirname, '..', 'renderer', 'dist', 'index.html')
    const srcPath = path.join(__dirname, '..', 'renderer', 'index.html')

    if (fs.existsSync(distPath)) {
      await win.loadFile(distPath)
    } else {
      await win.loadFile(srcPath)
    }
  }

  // Boot the P2P engine in-process. Not awaited: the renderer's request
  // router waits on the shared start promise before dispatching, and the
  // engine emits worker.ready when it is up.
  engineBridge
    .start()
    .then(async () => {
      updateAutoStart()
      try {
        const settings = await getPersistedSettings()
        if (settings.contextMenu !== false) {
          if (process.platform === 'win32') {
            const devices = await engineBridge.engine.listDevices().catch(() => [])
            await registerWindowsContextMenu({ devices })
          } else if (process.platform === 'linux') {
            await registerLinuxContextMenu()
          }
        }
      } catch {}
    })
    .catch((err) => {
      console.error('[Main] Engine failed to start:', err)
    })

  // Dynamic context menu update on peer topology and pairing changes
  try {
    let contextMenuTimer = null
    const scheduleContextMenuUpdate = () => {
      if (process.platform !== 'win32') return
      clearTimeout(contextMenuTimer)
      contextMenuTimer = setTimeout(async () => {
        try {
          const settings = await getPersistedSettings()
          if (settings.contextMenu !== false && engineBridge.engine) {
            const devices = await engineBridge.engine.listDevices().catch(() => [])
            await registerWindowsContextMenu({ devices })
          }
        } catch {}
      }, 500)
    }

    engineBridge.engine.on('peer:connected', scheduleContextMenuUpdate)
    engineBridge.engine.on('peer:disconnected', scheduleContextMenuUpdate)
    engineBridge.engine.on('trust:paired', scheduleContextMenuUpdate)
    engineBridge.engine.on('device:paired', scheduleContextMenuUpdate)
  } catch {}
}

function parseQuickSendArgs(args) {
  if (!Array.isArray(args) || args.length === 0) return null
  let peerId = null
  const filePaths = []

  const IGNORE_FLAGS = new Set([
    '--storage',
    '--user-data-dir',
    '--inspect',
    '--inspect-brk',
    '--remote-debugging-port',
    '--cwd'
  ])

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const prevArg = i > 0 ? args[i - 1] : null

    if (arg === '--send') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        filePaths.push(args[i + 1])
        i++
      }
    } else if (arg === '--send-to') {
      if (args[i + 1]) {
        peerId = args[i + 1]
        i++
      }
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        filePaths.push(args[i + 1])
        i++
      }
    } else if (
      i > 0 &&
      !arg.startsWith('-') &&
      !arg.startsWith(protocol + '://') &&
      !arg.includes('electron') &&
      !arg.endsWith('.js') &&
      arg !== '.' &&
      !IGNORE_FLAGS.has(prevArg) &&
      !arg.includes('p2p-instance') &&
      path.resolve(arg) !== process.cwd() &&
      path.resolve(arg) !== app.getAppPath()
    ) {
      try {
        if (fs.existsSync(arg)) filePaths.push(arg)
      } catch {}
    }
  }

  if (filePaths.length === 0) return null
  return { peerId, filePaths }
}

function handleQuickSend(quickSendPayload) {
  if (!quickSendPayload || !quickSendPayload.filePaths?.length) return
  const win = mainWindow
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.focus()

    const resolvedFiles = []
    for (const filePath of quickSendPayload.filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath)
          resolvedFiles.push({
            filePath: path.resolve(filePath),
            filename: path.basename(filePath),
            fileSize: stat.size,
            isDirectory: stat.isDirectory()
          })
        }
      } catch {}
    }

    if (resolvedFiles.length > 0) {
      win.webContents.send('app:quick-send', {
        peerId: quickSendPayload.peerId || null,
        files: resolvedFiles
      })
    }
  }
}

function handleDeepLink(url) {
  const win = mainWindow
  if (win) {
    win.show()
    win.focus()
  }
  // Two supported shapes:
  //   meshdrop://?code=DROP-ABCD-EFGH   (legacy query form)
  //   meshdrop://drop/DROP-ABCD-EFGH    (link form copied from the UI)
  let code = null
  try {
    const u = new URL(url)
    code = u.searchParams.get('code')
    if (!code) {
      const m = /^\/drop\/([A-Z0-9-]+)/i.exec(u.pathname)
      if (m) code = m[1]
    }
  } catch {}
  if (win) win.webContents.send('app:deep-link', { url, code })
}

app.setAsDefaultProtocolClient(protocol)

app.on('open-url', (evt, url) => {
  evt.preventDefault()
  handleDeepLink(url)
})

if (!allowMultipleInstances && !testPeer) {
  const lock = app.requestSingleInstanceLock()

  if (!lock) {
    app.quit()
  }
}

function ensureWindowsFirewallRule() {
  if (process.platform !== 'win32') return
  try {
    const { exec } = require('child_process')
    const exePath = process.execPath
    if (!exePath || exePath.toLowerCase().includes('electron.exe')) return
    exec('netsh advfirewall firewall show rule name="MeshDrop"', (err, stdout) => {
      if (err || !stdout || !stdout.includes('MeshDrop')) {
        exec(
          `netsh advfirewall firewall add rule name="MeshDrop" dir=in action=allow program="${exePath}" enable=yes profile=any & netsh advfirewall firewall add rule name="MeshDrop" dir=out action=allow program="${exePath}" enable=yes profile=any`,
          () => {}
        )
      }
    })
  } catch {}
}

{
  app.on('second-instance', (evt, args) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
    const url = args.find((arg) => arg.startsWith(protocol + '://'))
    if (url) {
      handleDeepLink(url)
    } else {
      const quickSend = parseQuickSendArgs(args)
      if (quickSend) {
        handleQuickSend(quickSend)
      }
    }
  })


  app.whenReady().then(() => {
    ensureWindowsFirewallRule()
    // CSP is owned by index.html (dev meta) and the vite build transform
    // (production meta). No header override needed.

    // WebDAV ("Drive") is intentionally NOT started at boot: it exposes an
    // unauthenticated local server (RW/DELETE on the sync dir) and no UI
    // consumes it. Opt-in only — startWebDAVServer() must be called
    // explicitly when the Drive feature is built and permission-gated.

    createWindow().catch((err) => {
      console.error('Failed to create window:', err)
      app.quit()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow().catch((err) => {
          console.error('Failed to create window:', err)
        })
      }
    })
  })

  app.on('window-all-closed', () => {
    console.log(`[Main:${getLabel()}] window-all-closed, quitting`)
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('will-quit', () => {
    console.log(`[Main:${getLabel()}] will-quit`)
    engineBridge.stop().catch((err) => {
      console.error('[Main] Engine stop failed:', err)
    })
    stopWebDAVServer()
  })
}

// ─── Module Wiring ───────────────────────────────────────────────────────────

// Auto-updater (electron-updater) and renderer IPC (dialogs/shell/clipboard)
// live in sibling modules; main.js wires them with their shared state.
// getAutoUpdate reads the persisted Settings toggle (autoUpdate) so the
// background auto-download honors the user's preference; the update CHECK
// still runs so the Settings page can always show status.
setupUpdater({
  sendToAll,
  version,
  appName,
  enabled: updates !== false,
  getAutoUpdate: () =>
    engineBridge.engine
      .getSettings()
      .then((s) => s.autoUpdate !== false)
      .catch(() => true)
})
registerIpcHandlers({
  storageDir: path.join(app.getPath('userData'), 'mesh_store'),
  getMainWindow: () => mainWindow,
  getLabel
})
