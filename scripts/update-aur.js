'use strict'

// Helper script to update packaging/aur/PKGBUILD with the release version and sha256 checksum

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const https = require('https')

async function sha256Url(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(sha256Url(res.headers.location))
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`))
      }
      const hash = crypto.createHash('sha256')
      res.on('data', (d) => hash.update(d))
      res.on('end', () => resolve(hash.digest('hex')))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function main() {
  const args = process.argv.slice(2)
  const rawVer = args[0] || require('../package.json').version
  const version = rawVer.replace(/^v/, '')
  const pkgbuildPath = path.join(__dirname, '..', 'packaging', 'aur', 'PKGBUILD')
  
  if (!fs.existsSync(pkgbuildPath)) {
    console.error('PKGBUILD not found at', pkgbuildPath)
    process.exit(1)
  }

  console.log(`[AUR] Updating PKGBUILD to version ${version}...`)
  let content = fs.readFileSync(pkgbuildPath, 'utf8')

  // Update pkgver
  content = content.replace(/^pkgver=.*$/m, `pkgver=${version}`)
  content = content.replace(/^pkgrel=.*$/m, 'pkgrel=1')

  // Calculate or find SHA256 of AppImage
  let appImageSha = null
  const localDistAppImage = path.join(__dirname, '..', 'dist', `MeshDrop-${version}-linux-x86_64.AppImage`)
  const localGenericAppImage = path.join(__dirname, '..', 'dist', `MeshDrop-${version}.AppImage`)

  if (fs.existsSync(localDistAppImage)) {
    console.log('[AUR] Computing sha256 from local dist artifact:', localDistAppImage)
    const buf = fs.readFileSync(localDistAppImage)
    appImageSha = crypto.createHash('sha256').update(buf).digest('hex')
  } else if (fs.existsSync(localGenericAppImage)) {
    console.log('[AUR] Computing sha256 from local generic artifact:', localGenericAppImage)
    const buf = fs.readFileSync(localGenericAppImage)
    appImageSha = crypto.createHash('sha256').update(buf).digest('hex')
  } else {
    const releaseUrl = `https://github.com/aamirali51/meshdrop-releases/releases/download/v${version}/MeshDrop-${version}-linux-x86_64.AppImage`
    console.log('[AUR] Downloading & computing sha256 from release URL:', releaseUrl)
    try {
      appImageSha = await sha256Url(releaseUrl)
    } catch (err) {
      console.warn('[AUR] Could not fetch remote AppImage:', err.message)
    }
  }

  // Calculate desktop file sha256
  const desktopPath = path.join(__dirname, '..', 'packaging', 'aur', 'meshdrop.desktop')
  const desktopSha = fs.existsSync(desktopPath)
    ? crypto.createHash('sha256').update(fs.readFileSync(desktopPath)).digest('hex')
    : 'SKIP'

  if (appImageSha) {
    console.log(`[AUR] AppImage SHA256: ${appImageSha}`)
    content = content.replace(
      /sha256sums_x86_64=\([\s\S]*?\)/m,
      `sha256sums_x86_64=(\n    '${appImageSha}'\n    '${desktopSha}'\n)`
    )
  }

  fs.writeFileSync(pkgbuildPath, content, 'utf8')
  console.log('[AUR] PKGBUILD successfully updated!')
}

main().catch((err) => {
  console.error('[AUR] Error:', err)
  process.exit(1)
})
