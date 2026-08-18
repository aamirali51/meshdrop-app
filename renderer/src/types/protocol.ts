import * as shared from '@shared/protocol'

export const METHODS = {
  DEVICES_LIST: 'devices.list',
  DEVICES_PAIR: 'devices.pair',
  DEVICES_PAIR_CODE: 'devices.pairCode',
  DEVICES_GET_CODE: 'devices.getCode',
  DEVICES_RENAME: 'devices.rename',
  DEVICES_REMOVE: 'devices.remove',
  DEVICES_FAVORITE: 'devices.favorite',
  DEVICES_TRUST: 'devices.trust',
  DEVICES_GET_IDENTITY: 'devices.getIdentity',
  DEVICES_SPEED_TEST: 'devices.speedTest',
  PRESENCE_SET: 'presence.set',
  PRESENCE_GET: 'presence.get',
  DIAGNOSTICS_GET: 'diagnostics.get',
  NOTIFICATIONS_LIST: 'notifications.list',
  NOTIFICATIONS_CLEAR: 'notifications.clear',
  NOTIFICATIONS_MARK_READ: 'notifications.markRead',
  HISTORY_LIST: 'history.list',
  HISTORY_CLEAR: 'history.clear',
  CONNECTION_STATUS: 'connection.status',
  SETTINGS_GET: 'settings.get',
  SETTINGS_UPDATE: 'settings.update',
  STORAGE_STATS: 'storage.stats',
  STORAGE_CLEAR: 'storage.clear',
  FILES_CREATE_CODE: 'files.createCode',
  FILES_CLAIM_CODE: 'files.claimCode',
  FILES_LIST_PENDING: 'files.listPending',
  FILES_EXTEND_EXPIRATION: 'files.extendExpiration',
  FILES_CANCEL_CODE: 'files.cancelCode',
  FILES_DELETE_PENDING: 'files.deletePending',
  TRANSFERS_START: 'transfers.start',
  TRANSFERS_ACCEPT: 'transfers.accept',
  TRANSFERS_DECLINE: 'transfers.decline',
  TRANSFERS_PAUSE: 'transfers.pause',
  TRANSFERS_RESUME: 'transfers.resume',
  TRANSFERS_CANCEL: 'transfers.cancel',
  TRANSFERS_RETRY: 'transfers.retry',
  TRANSFERS_LIST: 'transfers.list',
  TRANSFERS_CLEAR: 'transfers.clear',
  TRANSFERS_BROADCAST: 'transfers.broadcast',
  SYNC_ADD: 'sync.add',
  SYNC_REMOVE: 'sync.remove',
  SYNC_LIST: 'sync.list',
  SYNC_TRIGGER: 'sync.trigger',
  SYNC_PAUSE: 'sync.pause',
  SYNC_RESUME: 'sync.resume',
  SYNC_ACCEPT_INVITE: 'sync.acceptInvite',
  SYNC_DECLINE_INVITE: 'sync.declineInvite',
  SYNC_LIST_INVITES: 'sync.listInvites',
  SHARED_LIST: 'shared.list',
  SHARED_REMOVE: 'shared.remove',
  SHARED_FAVORITE: 'shared.favorite',
  ...(shared.METHODS || {})
}

export const EVENTS = {
  DEVICE_PAIRED: 'device.paired',
  DEVICE_UNPAIRED: 'device.unpaired',
  DEVICE_REMOVED: 'device.removed',
  DEVICE_ONLINE: 'device.online',
  DEVICE_OFFLINE: 'device.offline',
  DEVICE_UPDATED: 'device.updated',
  DEVICE_SPEED_TEST: 'device.speedTest',
  TRANSFER_QUEUED: 'transfer.queued',
  TRANSFER_OFFER: 'transfer.offer',
  TRANSFER_STARTED: 'transfer.started',
  TRANSFER_PROGRESS: 'transfer.progress',
  TRANSFER_COMPLETED: 'transfer.completed',
  TRANSFER_FAILED: 'transfer.failed',
  TRANSFER_CANCELLED: 'transfer.cancelled',
  TRANSFER_PAUSED: 'transfer.paused',
  TRANSFER_RESUMED: 'transfer.resumed',
  TRANSFER_DECLINED: 'transfer.declined',
  DROP_CODE_CREATED: 'drop.created',
  DROP_CLAIM_PROGRESS: 'drop.progress',
  DROP_CLAIM_COMPLETED: 'drop.completed',
  SYNC_LIBRARY_ADDED: 'sync.library_added',
  SYNC_LIBRARY_REMOVED: 'sync.library_removed',
  SYNC_SCAN: 'sync.scan',
  SYNC_UP_TO_DATE: 'sync.up_to_date',
  SYNC_COMPLETED: 'sync.completed',
  SYNC_DELETED: 'sync.deleted',
  SYNC_CONFLICT: 'sync.conflict',
  SYNC_ERROR: 'sync.error',
  SYNC_INVITE_RECEIVED: 'sync.invite_received',
  SYNC_PHASE: 'sync:phase',
  NOTIFICATION_RECEIVED: 'notification.received',
  NOTIFICATIONS_CLEARED: 'notifications.cleared',
  SETTINGS_UPDATED: 'settings.updated',
  DIAGNOSTICS_UPDATED: 'diagnostics.updated',
  PRESENCE_CHANGED: 'presence.changed',
  NETWORK_STATUS: 'network.status',
  ...(shared.EVENTS || {})
}

export const PROTOCOL_VERSION = shared.PROTOCOL_VERSION || '1.0'
export const isProtocolCompatible = shared.isProtocolCompatible || (() => true)

export type MethodName = (typeof METHODS)[keyof typeof METHODS]
export type EventName = (typeof EVENTS)[keyof typeof EVENTS]

export interface RequestMessage {
  type: 'request'
  v?: string
  id: string
  method: MethodName
  params: unknown
}

export interface ResponseMessage {
  type: 'response'
  v?: string
  id: string
  result?: unknown
  error?: string
}

export interface EventMessage {
  type: 'event'
  v?: string
  event: EventName
  data: unknown
}

export type WireMessage = RequestMessage | ResponseMessage | EventMessage
