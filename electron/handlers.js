'use strict'

// Renderer protocol handlers, ported from the old Bare worker
// (workers/handlers.js) to operate directly on the in-process MeshEngine.
//
// Every method in src/shared/protocol.js METHODS maps to either a MeshEngine
// method or a thin Hyperbee-backed store operation (engine.getBee). Events
// are re-emitted with the worker-protocol names the renderer subscribes to.

const fs = require('fs')
const path = require('path')
const fsp = require('fs/promises')
const { METHODS, EVENTS, createEvent } = require('../src/shared/protocol.js')
const { normalizePairingCode, deriveDeviceId } = require('@mesh/core/crypto.js')
const { WORKER_SPECIFIER } = require('./engine.js')

// ─── Pure helpers (ported from workers/helpers.js) ──────────────────────────

const DEFAULT_SETTINGS = {
  theme: 'dark',
  deviceName: '',
  // Security default: devices must pair via the key/code handshake. LAN
  // discovery connects peers, it does NOT grant trust.
  autoTrustLAN: false,
  // When false the engine holds incoming transfers at "pending approval"
  // until the user explicitly accepts (Require Manual File Acceptance).
  autoAcceptOffers: true,
  preferOwnRelay: true,
  relayMode: 'auto',
  customRelayUrl: '',
  noiseEncryption: true,
  autoUpdate: true,
  releaseChannel: 'stable',
  notifications: { transfer: true, device: true, sound: false },
  downloadDir: null,
  launchAtStartup: false,
  startMinimized: true
}

function mergeSettings(saved) {
  return { ...DEFAULT_SETTINGS, ...(saved || {}) }
}

// A device's stable identity key. identityKey (the peer's identity core key,
// persisted across restarts) is the canonical dedup key; legacy rows without
// it fall back to their id.
function canonicalDeviceKey(dev) {
  if (!dev || typeof dev !== 'object') return null
  return typeof dev.identityKey === 'string' && dev.identityKey
    ? dev.identityKey
    : typeof dev.id === 'string'
      ? dev.id
      : null
}

// One-time startup migration. Legacy records were keyed by ids derived from
// ephemeral noise keys (regenerated on every boot), so each restart created a
// new row for the same physical device. Re-key every record to its stable
// identity-derived id and delete the superseded duplicates.
async function cleanupDuplicateDevices(engine) {
  try {
    const bee = await engine.getBee('devices')
    const groups = new Map() // groupKey -> { rows: [{ key, value }], canonicalId }
    for await (const node of bee.createReadStream()) {
      const value = node.value
      if (!value || typeof value !== 'object' || !value.id) continue
      if (
        engine.deviceIdentity &&
        (value.id === engine.deviceIdentity.id ||
          value.publicKey === engine.deviceIdentity.publicKey)
      ) {
        continue // never touch the local node's own records
      }
      const identityKey =
        typeof value.identityKey === 'string' && value.identityKey ? value.identityKey : null
      const groupKey = identityKey || `id:${value.id}`
      const canonicalId = identityKey ? deriveDeviceId(identityKey) : value.id
      if (!groups.has(groupKey)) groups.set(groupKey, { rows: [], canonicalId })
      groups.get(groupKey).rows.push({ key: node.key, value })
    }
    let merged = 0
    let removed = 0
    for (const { rows, canonicalId } of groups.values()) {
      if (rows.length === 0) continue
      // Winner: the row with the most recent lastSeen (ISO strings compare
      // lexicographically).
      let winner = rows[0]
      for (const r of rows) {
        if ((r.value.lastSeen || '') > (winner.value.lastSeen || '')) winner = r
      }
      if (winner.key !== canonicalId || winner.value.id !== canonicalId) {
        await bee.put(canonicalId, { ...winner.value, id: canonicalId })
        merged++
        if (winner.key !== canonicalId) {
          await bee.del(winner.key)
          removed++
        }
      }
      for (const r of rows) {
        if (r === winner) continue
        await bee.del(r.key)
        removed++
      }
    }
    if (merged > 0 || removed > 0) {
      console.log(
        `[Main] Device store cleanup: re-keyed ${merged} record(s), removed ${removed} stale duplicate(s)`
      )
    }
  } catch (err) {
    console.warn('[Main] Device store cleanup failed:', err.message)
  }
}

// ─── Device store helpers ──────────────────────────────────────────────────
function registerEngineHandlers({ engine, sendToAll, getLabel, updateAutoStart }) {
  const handlers = {}

  const emit = (event, data) => {
    try {
      const isSync = !!(data && (data.isSync || data.source === 'sync'))
      if (isSync && (event === EVENTS.TRANSFER_OFFER || event === EVENTS.TRANSFER_OFFER_RECEIVED || event === EVENTS.TRANSFER_QUEUED || event === EVENTS.TRANSFER_COMPLETED || event === EVENTS.TRANSFER_STARTED)) {
        return
      }
      sendToAll('pear:worker:ipc:' + WORKER_SPECIFIER, Buffer.from(createEvent(event, data)))
    } catch (err) {
      console.error('[Main] Failed to emit event:', err.message)
    }
  }

  // ─── Devices ──────────────────────────────────────────────────────────────

  handlers[METHODS.DEVICES_LIST] = async () => {
    // Source of truth is the devices bee (written by the trusted-handshake
    // path) merged with live connection state. Rows are deduplicated by the
    // stable identity key so stale noise-key-derived duplicates never surface.
    const bee = await engine.getBee('devices')
    const deviceMap = new Map()

    for await (const node of bee.createReadStream()) {
      const dev = node.value
      if (dev && dev.id) {
        if (
          engine.deviceIdentity &&
          (dev.id === engine.deviceIdentity.id || dev.publicKey === engine.deviceIdentity.publicKey)
        ) {
          continue
        }
        if (dev.name && dev.name.startsWith('Device-')) {
          continue
        }
        const key = canonicalDeviceKey(dev)
        if (!key) continue
        const existing = deviceMap.get(key)
        if (existing && (existing.lastSeen || '') > (dev.lastSeen || '')) continue
        deviceMap.set(key, { ...dev, isOnline: false })
      }
    }

    for (const [, peerObj] of engine.peers.entries()) {
      const dev = peerObj.device
      if (dev && dev.id && dev.name !== 'Connecting...') {
        if (
          engine.deviceIdentity &&
          (dev.id === engine.deviceIdentity.id || dev.publicKey === engine.deviceIdentity.publicKey)
        ) {
          continue
        }
        const key = canonicalDeviceKey(dev)
        if (!key) continue
        deviceMap.set(key, { ...dev, isOnline: true })
      }
    }

    return Array.from(deviceMap.values())
  }

  handlers[METHODS.DEVICES_GET_IDENTITY] = async () => {
    const identity = engine.getIdentity()
    return { ...(engine.deviceIdentity || {}), pairingCode: identity.pairingCode }
  }

  handlers[METHODS.DEVICES_GET_CODE] = async () => {
    const identity = engine.getIdentity()
    return {
      code: identity.pairingCode,
      id: identity.deviceId,
      publicKey: identity.publicKey,
      name: engine.deviceIdentity?.name || '',
      os: engine.deviceIdentity?.os || ''
    }
  }

  handlers[METHODS.DEVICES_PAIR_CODE] = async (params) => {
    // Register the code and let the engine's challenge-response complete in
    // the background; the UI is driven by the device.paired / peer.connected
    // events (PairDeviceModal) — exactly like the old worker.
    engine.pairWithCode(params?.code).catch((err) => {
      console.warn(`[Main:${getLabel()}] Pairing failed:`, err.message)
    })
    return { success: true, code: params?.code || '' }
  }

  handlers[METHODS.DEVICES_PAIR] = async (params) => {
    const bee = await engine.getBee('devices')
    const device = {
      id: params.id || `device-${Date.now().toString(36)}`,
      name: params.name || 'Unknown Device',
      os: params.os || 'Unknown',
      osVersion: params.osVersion || '',
      avatar: params.avatar || '',
      isTrusted: true,
      isEncrypted: true,
      isOnline: false,
      signalStrength: 0,
      lastSeen: new Date().toISOString(),
      ipAddress: params.ipAddress || '',
      pairedAt: Date.now()
    }
    await bee.put(device.id, device)
    emit(EVENTS.DEVICE_PAIRED, device)
    return device
  }

  handlers[METHODS.DEVICES_RENAME] = async (params) => {
    return engine.renameDevice(params?.id, params?.name)
  }

  handlers[METHODS.DEVICES_FAVORITE] = async (params) => {
    const bee = await engine.getBee('devices')
    const entry = await bee.get(params.id)
    if (!entry) throw new Error('Device not found')
    const device = { ...entry.value, isFavorite: params.isFavorite }
    await bee.put(params.id, device)
    return device
  }

  handlers[METHODS.DEVICES_REMOVE] = async (params) => {
    const bee = await engine.getBee('devices')
    const entry = await bee.get(params.id)
    const device = entry && entry.value
    await bee.del(params.id)
    // Revoke trust: the in-memory trusted-key set survives the record delete,
    // so without this the deleted device silently re-adds itself the next time
    // it connects (isTrustedPublicKey -> directTrusted -> re-persisted).
    //
    // The key stays revoked only until a FRESH pairing: rotating the host code
    // invalidates the code the deleted peer memorized (its stale answers no
    // longer verify), while the revoked set blocks the auto-trust paths. The
    // device is re-admitted exactly the way it should be — by pairing with the
    // current code again.
    if (device && device.publicKey) {
      engine.trustManager.removeTrustedKey(device.publicKey)
      await engine.trustManager.revokeKey(device.publicKey)
    }
    try {
      await engine.trustManager.rotateHostPairingCode()
    } catch (err) {
      console.warn('[MeshEngine] Failed to rotate pairing code after device deletion:', err.message)
    }
    // Stop advertising the device's discovery topic and tear down any open
    // session with it so the deletion is immediate and permanent.
    if (device) {
      try {
        engine.topicRegistry.leave(`p2p-peer-${device.identityKey || device.publicKey}`)
      } catch {}
      for (const [, peerObj] of engine.peers.entries()) {
        if (
          peerObj &&
          peerObj.device &&
          (peerObj.device.id === params.id ||
            (device.publicKey && peerObj.device.publicKey === device.publicKey))
        ) {
          try {
            peerObj.connection.destroy()
          } catch {}
        }
      }
    }
    emit(EVENTS.DEVICE_UPDATED, { id: params.id, deleted: true })
    return { deleted: params.id }
  }

  handlers[METHODS.DEVICES_TRUST] = async (params) => {
    const bee = await engine.getBee('devices')
    const entry = await bee.get(params.id)
    if (!entry) return null
    const device = {
      ...entry.value,
      isTrusted: !entry.value.isTrusted,
      trustedAt: entry.value.isTrusted ? undefined : new Date().toISOString()
    }
    await bee.put(params.id, device)
    if (device.publicKey) {
      if (device.isTrusted) engine.trustManager.addTrustedKey(device.publicKey)
      else engine.trustManager.removeTrustedKey(device.publicKey)
    }
    emit(EVENTS.DEVICE_UPDATED, device)
    return device
  }

  handlers[METHODS.DEVICES_SPEED_TEST] = async () => {
    // No fabricated numbers. A real speed test ships with the transfer engine
    // (Phase 1+); until then this endpoint honestly reports unavailability.
    throw new Error('Speed test is not available in this build')
  }

  // ─── Presence / diagnostics / notifications ───────────────────────────────

  handlers[METHODS.PRESENCE_SET] = async () => {
    // Presence is derived from live connections; nothing to set in this build.
    return { success: true }
  }

  handlers[METHODS.PRESENCE_GET] = async () => {
    return { status: engine.connectionCount > 0 ? 'Online' : 'Offline' }
  }

  handlers[METHODS.DIAGNOSTICS_GET] = async () => {
    return engine.getDiagnostics()
  }

  handlers[METHODS.NOTIFICATIONS_LIST] = async () => {
    return engine.notificationStore ? engine.notificationStore.getNotifications() : []
  }

  handlers[METHODS.NOTIFICATIONS_MARK_READ] = async () => {
    return engine.notificationStore ? engine.notificationStore.markAllRead() : []
  }

  handlers[METHODS.NOTIFICATIONS_CLEAR] = async () => {
    return engine.notificationStore ? engine.notificationStore.clear() : []
  }

  // ─── History / connection / settings / storage ────────────────────────────

  handlers[METHODS.HISTORY_LIST] = async () => {
    const bee = await engine.getBee('history')
    const results = []
    for await (const node of bee.createReadStream()) {
      results.push(node.value)
    }
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    return results
  }

  handlers[METHODS.HISTORY_CLEAR] = async () => {
    const bee = await engine.getBee('history')
    const keys = []
    for await (const node of bee.createReadStream()) {
      keys.push(node.key)
    }
    for (const k of keys) {
      await bee.del(k)
    }
    return { success: true, count: keys.length }
  }

  handlers[METHODS.CONNECTION_STATUS] = async () => {
    return engine.getStatus()
  }

  handlers[METHODS.SETTINGS_GET] = async () => {
    const bee = await engine.getBee('settings')
    const entry = await bee.get('settings')
    // Surface the engine's live auto-accept flag so the UI toggle reflects
    // the actual @mesh/core state (Ground Truth Rule).
    const live = (await engine.getSettings()) || {}
    return mergeSettings({
      ...(entry?.value || {}),
      autoAcceptOffers: live.autoAcceptOffers,
      preferOwnRelay: live.preferOwnRelay,
      relayMode: live.relayMode,
      customRelayUrl: live.customRelayUrl
    })
  }

  handlers[METHODS.SETTINGS_UPDATE] = async (params) => {
    const bee = await engine.getBee('settings')
    const entry = await bee.get('settings')
    const merged = mergeSettings({ ...(entry?.value || {}), ...(params || {}) })
    await bee.put('settings', merged)
    // Honor the persisted values live: downloads land in the chosen folder
    // and the LAN auto-trust toggle applies to new connections.
    if (typeof merged.downloadDir === 'string' && merged.downloadDir) {
      engine.downloadsDir = merged.downloadDir
    }
    if (typeof merged.autoTrustLAN === 'boolean') {
      engine.autoTrustLAN = merged.autoTrustLAN
    }
    if (typeof merged.autoAcceptOffers === 'boolean') {
      await engine.setAutoAcceptOffers(merged.autoAcceptOffers)
    }
    if (typeof merged.preferOwnRelay === 'boolean') {
      await engine.setPreferOwnRelay(merged.preferOwnRelay)
    }
    if (typeof merged.relayMode === 'string') {
      await engine.setRelayMode(merged.relayMode)
    }
    if (typeof merged.customRelayUrl === 'string') {
      await engine.setCustomRelayUrl(merged.customRelayUrl)
    }
    if (updateAutoStart) {
      updateAutoStart(merged)
    }
    emit(EVENTS.SETTINGS_UPDATED, merged)
    return merged
  }

  handlers[METHODS.STORAGE_STATS] = async () => {
    return { storageUsed: 0, storageTotal: 0 }
  }

  handlers[METHODS.STORAGE_CLEAR] = async () => {
    const tempDir = path.join(engine.storageDir, 'p2p-temp')
    try {
      const files = await fsp.readdir(tempDir).catch(() => [])
      for (const f of files) {
        await fsp.unlink(path.join(tempDir, f)).catch(() => {})
      }
    } catch {}
    return { success: true }
  }

// ─── One-time shares (drop codes) ─────────────────────────────────────────
// All drop lifecycle logic lives in @mesh/core (createDropShare,
// claimDropCode, listPendingShares, extend/cancel/delete). These handlers are
// thin RPC shells that surface renderer events for the records they return.

handlers[METHODS.FILES_CREATE_CODE] = async (params) => {
  const share = await engine.createDropShare(params)
  emit(EVENTS.PENDING_SHARE_UPDATED, share)
  console.log(`[Main] Background pending code share created: ${share.code} (expires: ${share.expirationPreset})`)
  return share
}

handlers[METHODS.FILES_LIST_PENDING] = async () => {
  return engine.listPendingShares()
}

handlers[METHODS.FILES_EXTEND_EXPIRATION] = async (params) => {
  const share = await engine.extendPendingShare(params)
  emit(EVENTS.PENDING_SHARE_UPDATED, share)
  return share
}

handlers[METHODS.FILES_CANCEL_CODE] = async (params) => {
  const { id } = params
  const share = await engine.cancelPendingShare({ id })
  emit(EVENTS.PENDING_SHARE_UPDATED, share)
  return share
}

handlers[METHODS.FILES_DELETE_PENDING] = async (params) => {
  return engine.deletePendingShare({ id: params.id })
}

handlers[METHODS.FILES_CLAIM_CODE] = async (params) => {
  // MD- codes route to device pairing (random 80-bit code scheme)
  const mdCode = normalizePairingCode(params?.code)
  if (mdCode) {
    return handlers[METHODS.DEVICES_PAIR_CODE]({ code: mdCode })
  }
  return engine.claimDropCode(params?.code, { interactive: true })
}

handlers[METHODS.FILES_CONFIRM_CLAIM] = async (params) => {
  return engine.confirmClaimDownload(params)
}

handlers[METHODS.FILES_CANCEL_CLAIM] = async (params) => {
  return engine.cancelClaimDownload(params)
}

  // ─── Transfers ────────────────────────────────────────────────────────────

  handlers[METHODS.TRANSFERS_START] = async (params) => {
    console.log(
      `[Main] TRANSFERS_START: ${params.filename || 'unknown'} (${params.fileSize || 0} bytes) peer=${params.peerId || 'none'} path=${params.filePath || 'none'}`
    )
    return engine.startTransfer(params)
  }

  handlers[METHODS.TRANSFERS_ACCEPT] = async (params) => engine.acceptTransfer(params.id)
  handlers[METHODS.TRANSFERS_DECLINE] = async (params) => engine.declineTransfer(params.id)
  handlers[METHODS.TRANSFERS_PAUSE] = async (params) => engine.pauseTransfer(params.id)
  handlers[METHODS.TRANSFERS_RESUME] = async (params) => engine.resumeTransfer(params.id)
  handlers[METHODS.TRANSFERS_CANCEL] = async (params) => engine.cancelTransfer(params.id)
  handlers[METHODS.TRANSFERS_RETRY] = async (params) => engine.retryTransfer(params.id)
  handlers[METHODS.TRANSFERS_LIST] = async () => engine.listTransfers()
  handlers[METHODS.TRANSFERS_CLEAR] = async (params) => engine.clearTransfers(params)
  handlers[METHODS.TRANSFERS_DELETE] = async (params) => engine.deleteTransfer(params?.id)

  handlers[METHODS.TRANSFERS_BROADCAST] = async (params) => {
    const onlinePeers = Array.from(engine.peers.values()).filter(
      (p) => p.device && p.device.isOnline !== false
    )
    console.log(`[Main] TRANSFERS_BROADCAST to ${onlinePeers.length} online peers`)
    const results = []
    for (const p of onlinePeers) {
      try {
        const res = await engine.startTransfer({
          ...params,
          peerId: p.device.publicKey,
          peerName: p.device.name
        })
        results.push(res)
      } catch (err) {
        console.warn(`[Main] Broadcast error for peer ${p.device.id}:`, err.message)
      }
    }
    return { success: true, count: results.length, transfers: results }
  }

  // ─── Folder sync (SyncEngine) ────────────────────────────────────────────

  handlers[METHODS.SYNC_ADD] = async (params) => {
    const lib = await engine.addSyncLibrary({
      path: params?.path,
      peerId: params?.peerId,
      name: params?.name,
      mode: params?.mode
    })
    console.log(`[Main] Sync library added: ${lib.name} (${lib.fileCount} file(s)) -> ${lib.peerId ? lib.peerId.slice(0, 12) : 'unknown'}...`)
    if (updateAutoStart) updateAutoStart()
    return lib
  }

  handlers[METHODS.SYNC_REMOVE] = async (params) => {
    const res = await engine.removeSyncLibrary(params?.id)
    if (updateAutoStart) updateAutoStart()
    return res
  }

  handlers[METHODS.SYNC_LIST] = async () => engine.listSyncLibraries()

  handlers[METHODS.SYNC_TRIGGER] = async (params) => engine.syncLibrary(params?.id)

  handlers[METHODS.SYNC_PAUSE] = async (params) => {
    const res = await engine.pauseSyncLibrary(params?.id)
    if (updateAutoStart) updateAutoStart()
    return res
  }

  handlers[METHODS.SYNC_RESUME] = async (params) => {
    const res = await engine.resumeSyncLibrary(params?.id)
    if (updateAutoStart) updateAutoStart()
    return res
  }

  handlers[METHODS.SYNC_ACCEPT_INVITE] = async (params) => {
    const res = await engine.acceptSyncInvite({ id: params?.id, customPath: params?.customPath })
    if (updateAutoStart) updateAutoStart()
    return res
  }

  handlers[METHODS.SYNC_DECLINE_INVITE] = async (params) => engine.declineSyncInvite({ id: params?.id })

  handlers[METHODS.SYNC_LIST_INVITES] = async () => engine.listPendingSyncInvites()

  // ─── Shared files ─────────────────────────────────────────────────────────

  handlers[METHODS.SHARED_LIST] = async () => {
    const bee = await engine.getBee('shared')
    const results = []
    for await (const node of bee.createReadStream()) {
      results.push(node.value)
    }
    return results
  }

  handlers[METHODS.SHARED_REMOVE] = async (params) => {
    const bee = await engine.getBee('shared')
    await bee.del(params.id)
    return { deleted: params.id }
  }

  handlers[METHODS.SHARED_FAVORITE] = async (params) => {
    const bee = await engine.getBee('shared')
    const entry = await bee.get(params.id)
    if (!entry) throw new Error('File not found')
    const file = { ...entry.value, isFavorite: params.isFavorite }
    await bee.put(params.id, file)
    return file
  }

  // ─── Drive (WebDAV) peer broadcasts ───────────────────────────────────────

  handlers[METHODS.DRIVE_BROADCAST_FILE] = async (params) => {
    if (!params || !params.filename) return { success: false }
    const payload = {
      type: 'DRIVE_FILE_SYNC',
      senderIdentity: engine.deviceIdentity,
      file: {
        id: params.id || `drive-${Date.now().toString(36)}`,
        filename: params.filename,
        fileSize: params.fileSize || 0,
        fileType: params.fileType || 'application/octet-stream'
      }
    }

    let broadcastCount = 0
    for (const [, peerObj] of engine.peers.entries()) {
      if (peerObj.signaling) {
        try {
          peerObj.signaling.send(payload)
          broadcastCount++
        } catch {}
      }
    }
    console.log(`[Main] DRIVE_BROADCAST_FILE sent to ${broadcastCount} peers: ${params.filename}`)
    return { success: true, broadcastCount }
  }

  handlers[METHODS.DRIVE_SHARE_INVITE] = async (params) => {
    const { targetPeerId } = params || {}
    let sentCount = 0
    for (const [peerId, peerObj] of engine.peers.entries()) {
      if (
        (!targetPeerId || targetPeerId === peerId || peerObj.device?.id === targetPeerId) &&
        peerObj.signaling
      ) {
        try {
          peerObj.signaling.send({
            type: 'DRIVE_SHARE_INVITE',
            senderIdentity: engine.deviceIdentity
          })
          sentCount++
        } catch (err) {
          console.error(`[Main] Failed to send DRIVE_SHARE_INVITE to ${peerId}:`, err.message)
        }
      }
    }
    return { success: sentCount > 0, sentCount }
  }

  handlers[METHODS.DRIVE_SHARE_ACCEPT] = async (params) => {
    const { peerId } = params || {}
    for (const [pId, peerObj] of engine.peers.entries()) {
      if ((!peerId || peerId === pId || peerObj.device?.id === peerId) && peerObj.signaling) {
        try {
          peerObj.signaling.send({
            type: 'DRIVE_SHARE_ACCEPT',
            senderIdentity: engine.deviceIdentity
          })
        } catch (err) {
          console.error(`[Main] Failed to send DRIVE_SHARE_ACCEPT to ${pId}:`, err.message)
        }
      }
    }
    return { success: true }
  }

  handlers[METHODS.DRIVE_SHARE_DECLINE] = async (params) => {
    const { peerId } = params || {}
    for (const [pId, peerObj] of engine.peers.entries()) {
      if ((!peerId || peerId === pId || peerObj.device?.id === peerId) && peerObj.signaling) {
        try {
          peerObj.signaling.send({
            type: 'DRIVE_SHARE_DECLINE',
            senderIdentity: engine.deviceIdentity
          })
        } catch {}
      }
    }
    return { success: true }
  }

  // ─── Clipboard / updates / LAN (legacy surface) ───────────────────────────

  handlers[METHODS.CLIPBOARD_SEND] = async (params) => {
    console.log(
      '[Main] CLIPBOARD_SEND broadcasting content:',
      typeof params?.content === 'string' ? params.content.slice(0, 30) : 'image payload'
    )
    const payload = {
      type: 'CLIPBOARD_SYNC',
      content: params.content,
      contentType: params.contentType || 'text',
      timestamp: Date.now()
    }
    let sentCount = 0
    for (const [, peerObj] of engine.peers.entries()) {
      if (peerObj.signaling && peerObj.device?.isOnline !== false) {
        try {
          peerObj.signaling.send(payload)
          sentCount++
        } catch (err) {
          console.warn(`[Main] Failed sending clipboard to peer:`, err.message)
        }
      }
    }
    return { success: true, count: sentCount }
  }

  handlers[METHODS.CHECK_FOR_UPDATES] = async () => {
    return { status: 'up_to_date', message: 'Application is already up to date.' }
  }

  handlers[METHODS.LAN_DISCOVERY_PEER] = async (params) => {
    // LAN discovery now runs inside the engine; accept legacy announcements
    // for compatibility with old mains that forwarded them.
    let added = false
    try {
      if (engine.lanDiscovery && params?.key) {
        added = engine.lanDiscovery.handleAnnouncement(params.key)
      }
    } catch {}
    return { success: true, added }
  }

  handlers[METHODS.WATCH_STATE_BROADCAST] = async (params) => {
    if (!engine) return { success: false }
    const res = engine.broadcastWatchState ? engine.broadcastWatchState(params) : { success: true }
    emit(EVENTS.WATCH_STATE_CHANGED, {
      ...params,
      timestampMs: Date.now(),
      senderDevice: engine.deviceIdentity ? { id: engine.deviceIdentity.id, name: engine.deviceIdentity.name } : null
    })
    return res || { success: true }
  }

  handlers[METHODS.WATCH_PARTY_CREATE] = async (params) => {
    if (!engine || !engine.createPartyRoom) throw new Error('Engine watch party unavailable')
    return engine.createPartyRoom(params)
  }

  handlers[METHODS.WATCH_PARTY_JOIN] = async (params) => {
    if (!engine || !engine.joinPartyRoom) throw new Error('Engine watch party unavailable')
    return engine.joinPartyRoom(params)
  }

  handlers[METHODS.WATCH_PARTY_LEAVE] = async () => {
    if (!engine || !engine.leavePartyRoom) return { success: true }
    return engine.leavePartyRoom()
  }

  handlers[METHODS.WATCH_PARTY_GET_ROOM] = async () => {
    if (!engine || !engine.getPartyRoom) return null
    return engine.getPartyRoom()
  }

  handlers[METHODS.WATCH_PARTY_LIST_ROOMS] = async () => {
    if (!engine || !engine.listPartyRooms) return []
    return engine.listPartyRooms()
  }

  handlers[METHODS.WATCH_PARTY_REACTION] = async (params) => {
    if (!engine || !engine.sendPartyReaction) return false
    return engine.sendPartyReaction(params?.emoji)
  }

  handlers[METHODS.WATCH_PARTY_STATUS] = async (params) => {
    if (!engine || !engine.broadcastPartyStatus) return false
    return engine.broadcastPartyStatus(params)
  }

  handlers[METHODS.STREAM_URL_GET] = async (params) => {
    const { startWebDAVServer, setWebDAVEngine, getDriveStatus } = require('./webdav')
    setWebDAVEngine(engine)
    await startWebDAVServer().catch(() => {})
    const status = getDriveStatus()
    const port = status.port || 41983
    if (params?.transferId) {
      const pathParam = params?.filePath ? `&path=${encodeURIComponent(params.filePath)}` : ''
      return { url: `http://127.0.0.1:${port}/stream/transfer?id=${encodeURIComponent(params.transferId)}${pathParam}` }
    }
    if (params?.filePath) {
      return { url: `http://127.0.0.1:${port}/stream/file?path=${encodeURIComponent(params.filePath)}` }
    }
    return { url: `http://127.0.0.1:${port}/p2p/` }
  }

  return handlers
}

module.exports = { registerEngineHandlers, cleanupDuplicateDevices }
