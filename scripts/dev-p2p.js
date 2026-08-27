const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const DEV_SERVER_URL = process.env.PEAR_DEV_SERVER_URL || 'http://localhost:5173'

const nodeExe = process.execPath
const electronCli = path.resolve(ROOT, 'node_modules', 'electron', 'cli.js')
const mainEntry = path.resolve(ROOT, 'electron', 'main.js')

if (!fs.existsSync(electronCli)) {
  console.error('Electron CLI not found at:', electronCli)
  process.exit(1)
}

if (!fs.existsSync(mainEntry)) {
  console.error('App entry not found at:', mainEntry)
  process.exit(1)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function launchInstance(name, storageDir) {
  const resolved = path.resolve(ROOT, storageDir)

  const env = {
    ...process.env,
    PEAR_DEV_SERVER_URL: DEV_SERVER_URL
    // NOTE: do NOT set ELECTRON_DISABLE_SANDBOX here — it conflicts with
    // sandbox: true in BrowserWindow webPreferences and causes renderer crashes.
  }

  const args = [
    electronCli,
    `--user-data-dir=${resolved}`,
    mainEntry,
    '--no-updates',
    '--allow-multiple-instances',
    '--storage',
    resolved
  ]

  console.log(`[${name}] node ${args.join(' ')}`)

  const proc = spawn(nodeExe, args, {
    cwd: ROOT,
    env,
    stdio: 'inherit'
  })

  proc.on('exit', (code, signal) => {
    console.log(`[${name}] Exited (code: ${code}, signal: ${signal})`)
  })

  proc.on('error', (err) => {
    console.error(`[${name}] Failed to start:`, err.message)
  })

  return proc
}

const waitOn = require('wait-on')

const instances = []

async function main() {
  console.log(`Waiting for dev server at ${DEV_SERVER_URL}...`)
  try {
    await waitOn({ resources: [DEV_SERVER_URL], timeout: 15000 })
    console.log('Dev server ready! Launching Electron instances...')
  } catch (err) {
    console.error('Dev server wait failed:', err.message)
  }

  const proc1 = await launchInstance('Instance 1', './data/p2p-instance-1')
  instances.push(proc1)

  await sleep(3000)

  const proc2 = await launchInstance('Instance 2', './data/p2p-instance-2')
  instances.push(proc2)
}

main().catch((err) => {
  console.error('Failed to launch:', err)
  process.exit(1)
})

process.on('SIGINT', () => {
  console.log('\nShutting down instances...')
  for (const proc of instances) {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM')
    }
  }
})

process.on('SIGTERM', () => {
  for (const proc of instances) {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM')
    }
  }
  process.exit(0)
})
