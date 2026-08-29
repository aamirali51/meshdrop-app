const fs = require('fs')
const path = require('path')
const plink = require('pear-link')

const pkg = require('./package.json')
const appName = pkg.productName ?? pkg.name

let packagerConfig = {
  asar: {
    unpack: '**/{node_modules,core}/**'
  },
  icon: 'build/icon',
  protocols: [{ name: appName, schemes: [pkg.name] }],
  derefSymlinks: true,
  prune: true,
  ignore: [
    /^[/\\]data([/\\]|$)/,
    /^[/\\]\.p2p-test-profile([/\\]|$)/,
    /^[/\\]out([/\\]|$)/,
    /^[/\\]\.git([/\\]|$)/,
    /^[/\\]\.gemini([/\\]|$)/,
    /^[/\\]renderer[/\\]src([/\\]|$)/,
    /[/\\]node_modules[/\\]\.cache([/\\]|$)/
  ]
}

if (process.env.MAC_CODESIGN_IDENTITY) {
  packagerConfig = {
    ...packagerConfig,
    osxSign: {
      identity: process.env.MAC_CODESIGN_IDENTITY,
      optionsForFile: () => ({
        entitlements: path.join(__dirname, 'build', 'entitlements.mac.plist')
      })
    },
    osxNotarize: {
      tool: 'notarytool',
      keychainProfile: process.env.KEYCHAIN_PROFILE
    }
  }
}

module.exports = {
  packagerConfig,

  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32', 'darwin', 'linux']
    },
    {
      name: 'pear-electron-forge-maker-appimage',
      platforms: ['linux'],
      config: {
        icons: [
          { file: 'build/icon/icon-16x16.png', size: 16 },
          { file: 'build/icon/icon-32x32.png', size: 32 },
          { file: 'build/icon/icon-64x64.png', size: 64 },
          { file: 'build/icon/icon-128x128.png', size: 128 },
          { file: 'build/icon/icon-256x256.png', size: 256 }
        ]
      }
    },
    {
      name: 'pear-electron-forge-maker-flatpak',
      platforms: ['linux'],
      config: {
        appId: 'com.meshdrop.desktop',
        icon: `${packagerConfig.icon}.png`,
        metainfo: 'build/metainfo.xml',
        entrypoint: 'build/entrypoint.sh',
        comment: 'Decentralized Peer-to-Peer Application Framework',
        categories: ['Network', 'Utility']
      }
    },
    {
      name: 'pear-electron-forge-maker-snap',
      platforms: ['linux'],
      config: {
        snapcraftYamlPath: 'build/snapcraft.yaml',
        summary: 'Decentralized Peer-to-Peer Application Framework',
        description:
          'Decentralized peer-to-peer networking platform built with Electron and Pear Runtime.',
        license: 'MIT',
        icon: `${packagerConfig.icon}.png`
      }
    }
  ],

  hooks: {
    readPackageJson: async (forgeConfig, packageJson) => {
      if (process.env.UPGRADE_KEY) {
        packageJson.upgrade = process.env.UPGRADE_KEY
      }

      try {
        plink.parse(packageJson.upgrade)
      } catch {
        throw new Error('Use `pear touch` to get a valid upgrade key for package.json#upgrade')
      }

      return packageJson
    },
    preMake: async () => {
      try {
        fs.rmSync(path.join(__dirname, 'out', 'make'), { recursive: true, force: true })
      } catch {}
    }
  },

  plugins: [
    {
      name: 'electron-forge-plugin-universal-prebuilds',
      config: {}
    },
    {
      name: 'electron-forge-plugin-prune-prebuilds',
      config: {}
    }
  ]
}
