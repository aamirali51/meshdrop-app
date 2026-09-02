export type NavRoute =
  | '/dashboard'
  | '/devices'
  | '/sync'
  | '/party'
  | '/transfers'
  | '/activity'
  | '/history'
  | '/diagnostics'
  | '/settings'
  | '/about'

export interface NavItem {
  label: string
  route: NavRoute
  icon: string
  shortcut?: string
  badge?: string | number
}

export type DeviceType = 'desktop' | 'laptop' | 'server' | 'mobile'
export type NetworkType = 'direct_lan' | 'p2p_dht' | 'relay'

export interface Device {
  id: string
  name: string
  /** Optional user-set display name override; falls back to `name`. */
  customName?: string
  os: 'windows' | 'macos' | 'linux'
  osVersion: string
  avatar: string
  isTrusted: boolean
  isEncrypted: boolean
  isOnline: boolean
  isFavorite?: boolean
  signalStrength: number
  latencyMs: number
  lastSeen: Date | string
  ipAddress: string
  publicKey?: string
  networkType: NetworkType
  deviceType: DeviceType
  /** Live flag: this peer's active connection is tunneled through a DHT relay. */
  relayed?: boolean
  /** How this peer is currently reached: 'lan' | 'relay' | other (e.g. dht). */
  transferMethod?: string
  cpuUsage?: number
  ramUsage?: number
}

export type ActivityType = 'transfer' | 'session' | 'notification'

export interface ActivityItem {
  id: string
  type: ActivityType
  title: string
  description?: string
  timestamp: Date | string
  transferId?: string
  status?: string
  transferMethod?: string
}

export interface NetworkDiagnostics {
  natType: string | null
  relayStatus: string
  dhtNodes: number | null
  avgLatencyMs: number | null
  packetLossPercent: number | null
  noiseProtocol: string
  bandwidthMbps: number | null
  systemCpuUsage: number | null
  systemRamUsage: number | null
  connectedPeersCount?: number
  connected?: boolean
  uptimeMs?: number
  bytesReceived?: number
  bytesSent?: number
}

export interface NotificationItem {
  id: string
  title: string
  description: string
  type: 'info' | 'success' | 'warning' | 'error'
  timestamp: Date | string
  read: boolean
  actionUrl?: string
}

export interface UserIdentity {
  id: string
  name: string
  os: string
  publicKey: string
  pairingCode: string
}

export type PendingShareStatus = 'waiting' | 'claimed' | 'completed' | 'expired' | 'cancelled'

export interface IncomingOffer {
  transferId: string
  filename: string
  fileSize: number
  fileType?: string
  senderIdentity?: { name?: string; id?: string }
}

export interface PendingShareFile {
  filename: string
  fileSize: number
  fileType?: string
}

export interface ClaimPreviewFile {
  index: number
  filename: string
  fileSize: number
  fileType?: string
}

export interface ClaimPreview {
  code: string
  shareId: string
  folderName?: string | null
  totalSize: number
  totalFiles: number
  files: ClaimPreviewFile[]
}

export interface PendingShare {
  id: string
  code: string
  filename: string
  fileSize: number
  fileType?: string
  expiresAt: number
  expirationPreset: string
  status: PendingShareStatus
  downloadCount: number
  maxDownloads: number
  folderName?: string | null
  files?: PendingShareFile[]
  createdAt: number
  isGroupDrop?: boolean
  isWatchParty?: boolean
  roomTitle?: string
}

export interface WatchState {
  roomCode?: string
  action: 'play' | 'pause' | 'seek'
  positionSec: number
  timestampMs?: number
  buffering?: boolean
  senderDevice?: { id?: string; name?: string } | null
}

export type TransferDirection = 'send' | 'receive'
export type TransferPriority = 'interactive' | 'bulk' | 'background'
export type TransferStatus =
  | 'queued'
  | 'active'
  | 'paused'
  | 'interrupted'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'pending_approval'
  | 'waiting_peer'

export interface TransferSummary {
  checksum?: string
  manifestHash?: string
  blocksVerified?: number
  bytesVerified?: number
}

export interface TransferRecord {
  id: string
  filename: string
  fileSize: number
  fileType?: string
  direction: TransferDirection
  status: TransferStatus
  priority?: TransferPriority
  progress: number
  speed: number
  peakSpeed?: number
  eta: number
  duration?: number
  transferMethod?: string
  isEncrypted?: boolean
  peerId?: string
  peerName?: string
  error?: string
  summary?: TransferSummary
  createdAt: string | Date
  completedAt?: string
  // Local file path on this device: the source path for sends, the final
  // download path for receives (set once the file lands). Used for the
  // "Show in Folder" action in the Transfers page.
  filePath?: string
  destPath?: string
  isClaim?: boolean
  // The DROP code a claimer-side "waiting for sender" placeholder is for.
  claimCode?: string
}
