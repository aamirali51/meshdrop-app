'use strict'

// Electron-side face of the shared Sites HTTP gateway (Phase 1b).
//
// The whole gateway (token gate, per-visit serving, asset rewrite, HTML
// indexes) now lives in src/shared/localservers/sites-gateway.js and is
// consumed identically by the desktop app and the headless host. This facade
// keeps the legacy module-level export surface electron/main.js and
// electron/engine.js require — behavior unchanged.

const {
  createSitesGateway,
  mintSitesUrl
} = require('../src/shared/localservers/sites-gateway.js')

let engineRef = null

// One shared gateway instance for this process; no tokenProvider, so the
// gateway mints/rotates its own in-memory token (resetToken on visit
// start/stop, exactly like the legacy module).
const gateway = createSitesGateway({
  getEngine: () => engineRef
})

function setSitesGatewayEngine(engine) {
  engineRef = engine
}

function startSitesGateway(options = {}) {
  return gateway.start(options)
}

function stopSitesGateway() {
  gateway.stop()
}

function getSitesGatewayUrl() {
  return gateway.getUrl()
}

function resetToken() {
  gateway.resetToken()
}

function mintSitesUrlForEngine(engine, params) {
  if (engine && engine !== engineRef) setSitesGatewayEngine(engine)
  return mintSitesUrl(gateway, engine)
}

module.exports = {
  startSitesGateway,
  stopSitesGateway,
  setSitesGatewayEngine,
  getSitesGatewayUrl,
  resetToken,
  mintSitesUrl: mintSitesUrlForEngine
}
