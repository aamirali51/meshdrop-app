import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  NativeModules,
} from 'react-native'
import {
  Folder,
  FolderSync,
  RefreshCw,
  Trash2,
  Check,
  Plus,
  Camera,
  Pause,
  Play,
  FileText,
  HardDrive,
  Sparkles,
  Zap,
  Radio,
  Film,
} from 'lucide-react-native'
import { call, on } from '../bridge'
import {
  Card,
  Btn,
  Pill,
  SectionHeader,
  SimpleModal,
  StatCard,
  DeviceAvatar,
} from '../components'
import { theme, fonts } from '../theme'

interface SyncLibrary {
  id: string
  name: string
  localPath: string
  peerId?: string
  itemCount?: number
  /** Total size of live files — the engine returns this as `totalSize` (alias `size`). */
  totalBytes?: number
  totalSize?: number
  size?: number
  fileCount?: number
  status: 'synced' | 'syncing' | 'error' | 'idle' | 'paused' | 'waiting_peer' | 'waiting_accept'
  mode?: 'two-way' | 'send-only' | 'receive-only'
  lastSync?: string
  lastScanAt?: number
  paused?: boolean
}

interface PairedDevice {
  id: string
  name: string
  os?: string
  isOnline?: boolean
  isTrusted?: boolean
}

type SyncTemplateKey = 'camera' | 'docs' | 'media' | 'custom'

const ANDROID_STORAGE_ROOT = '/storage/emulated/0'

const SYNC_TEMPLATES: {
  key: SyncTemplateKey
  title: string
  icon: React.ElementType
  name: string
  path: string
  mode: 'two-way' | 'send-only' | 'receive-only'
  color: string
}[] = [
  {
    key: 'camera',
    title: 'Photos / Camera',
    icon: Camera,
    name: 'Camera Roll',
    path: `${ANDROID_STORAGE_ROOT}/DCIM/Camera`,
    mode: 'send-only',
    color: theme.primary,
  },
  {
    key: 'docs',
    title: 'Documents',
    icon: FileText,
    name: 'Documents',
    path: `${ANDROID_STORAGE_ROOT}/Documents`,
    mode: 'two-way',
    color: theme.accent,
  },
  {
    key: 'media',
    title: 'Media',
    icon: Film,
    name: 'Media',
    path: `${ANDROID_STORAGE_ROOT}/Download`,
    mode: 'receive-only',
    color: theme.purple,
  },
  {
    key: 'custom',
    title: 'Custom',
    icon: Zap,
    name: '',
    path: '',
    mode: 'send-only',
    color: theme.muted,
  },
]

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let val = bytes
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function formatRelativeTime(timestamp?: number | string): string {
  if (!timestamp) return 'Never'
  const t = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
  if (isNaN(t) || t <= 0) return 'Never'
  const diff = Date.now() - t
  if (diff < 15000) return 'Just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

// Memoized library card: re-renders only when its own props change (stable
// references from the parent), so progress events for one library never
// re-render the whole deck.
const SyncLibraryCard = React.memo(function SyncLibraryCard({
  lib,
  progress,
  phase,
  syncingId,
  onTrigger,
  onTogglePause,
  onDelete,
}: {
  lib: SyncLibrary
  progress?: { progress: number; speed: number }
  phase?: { phase: string; total: number; done: number }
  syncingId: string | null
  onTrigger: (lib: SyncLibrary) => void
  onTogglePause: (lib: SyncLibrary) => void
  onDelete: (lib: SyncLibrary) => void
}) {
  const isSyncing = syncingId === lib.id || lib.status === 'syncing'
  const isPaused = lib.paused || lib.status === 'paused'
  const isWaitingPeer = lib.status === 'waiting_peer' || lib.status === 'waiting_accept'
  const isAnalyzing = phase?.phase === 'analyzing'
  const isTransferring = phase?.phase === 'transferring'

  return (
    <Card glow={isSyncing} style={styles.libCard}>
      <View style={styles.libHeader}>
        <View style={styles.folderIconBox}>
          <Folder size={20} color={theme.primary} />
        </View>
        <View style={styles.flex1}>
          <View style={styles.libTitleRow}>
            <Text style={styles.libName} numberOfLines={1}>
              {lib.name}
            </Text>
            <Pill
              label={
                isPaused
                  ? 'Paused'
                  : isWaitingPeer
                  ? 'Waiting for Peer'
                  : isAnalyzing
                  ? 'Analyzing…'
                  : isTransferring || isSyncing
                  ? 'Syncing…'
                  : 'Synchronized'
              }
              color={
                isPaused
                  ? theme.warning
                  : isWaitingPeer
                  ? theme.muted
                  : isAnalyzing
                  ? theme.muted
                  : isTransferring || isSyncing
                  ? theme.primary
                  : theme.success
              }
              dot={!isPaused && !isWaitingPeer && !isAnalyzing}
            />
          </View>

          <Text style={styles.libPath} numberOfLines={1}>
            {lib.localPath || 'Default Storage Root'}
          </Text>
        </View>
      </View>

      {/* Telemetry Row */}
      <View style={styles.telemetryRow}>
        <View style={styles.telemetryItem}>
          <Text style={styles.telemetryLabel}>Items</Text>
          <Text style={styles.telemetryValue}>
            {lib.fileCount ?? lib.itemCount ?? 0} files
          </Text>
        </View>
        <View style={styles.telemetryItem}>
          <Text style={styles.telemetryLabel}>Size</Text>
          <Text style={styles.telemetryValue}>
            {formatBytes(lib.totalSize ?? lib.size)}
          </Text>
        </View>
        <View style={styles.telemetryItem}>
          <Text style={styles.telemetryLabel}>Last Replicated</Text>
          <Text style={styles.telemetryValue}>
            {formatRelativeTime(lib.lastSync || lib.lastScanAt)}
          </Text>
        </View>
      </View>

      {/* Live transfer progress (real verified bytes). The wrapper always
          reserves its height so the card never grows/shrinks (no flicker)
          when a transfer starts or finishes. During the analysis phase the
          bar is REPLACED by an explicit "Analyzing N files…" counter — the
          comparison of existing files is never shown as a transfer bar. */}
      <View style={styles.progressWrap}>
        {isAnalyzing ? (
          <Text style={styles.progressText}>
            {phase.total > 0
              ? `Analyzing ${phase.total} files… (${phase.done}/${phase.total})`
              : 'Analyzing files…'}
          </Text>
        ) : progress && progress.progress > 0 ? (
          <>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${Math.min(100, progress.progress)}%` }]}
              />
            </View>
            <Text style={styles.progressText}>
              {progress.progress}%
              {progress.speed ? ` · ${formatBytes(progress.speed)}/s` : ''}
              {isTransferring && phase.total > 0 ? ` · ${phase.done}/${phase.total}` : ''}
            </Text>
          </>
        ) : null}
      </View>

      {/* Action Controls */}
      <View style={styles.libActions}>
        <TouchableOpacity
          style={styles.actionPillBtn}
          onPress={() => onTrigger(lib)}
          disabled={isSyncing || isPaused}
          activeOpacity={0.7}
        >
          <RefreshCw size={13} color={theme.primary} />
          <Text style={styles.actionPillText}>{isSyncing ? 'Syncing…' : 'Rescan'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionPillBtn}
          onPress={() => onTogglePause(lib)}
          activeOpacity={0.7}
        >
          {isPaused ? (
            <Play size={13} color={theme.success} />
          ) : (
            <Pause size={13} color={theme.warning} />
          )}
          <Text style={styles.actionPillText}>{isPaused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionPillBtn, styles.actionPillDanger]}
          onPress={() => onDelete(lib)}
          activeOpacity={0.7}
        >
          <Trash2 size={13} color={theme.danger} />
          <Text style={[styles.actionPillText, { color: theme.danger }]}>Remove</Text>
        </TouchableOpacity>
      </View>
    </Card>
  )
})

export function Sync({ identity: _identity }: { identity?: any }) {
  const [libraries, setLibraries] = useState<SyncLibrary[]>([])
  const [devices, setDevices] = useState<PairedDevice[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState<SyncTemplateKey>('custom')
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderPath, setNewFolderPath] = useState('')
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  // Mobile is the source of truth: the default mode is one-way push (send-only)
  // so the desktop mirror can never modify the phone's folder. Two-way must be
  // chosen explicitly for folders where that is desired.
  const [syncMode, setSyncMode] = useState<'two-way' | 'send-only' | 'receive-only'>('send-only')
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Library id -> live transfer progress { progress, speed } from listTransfers.
  const [transferProgress, setTransferProgress] = useState<Record<string, { progress: number; speed: number }>>({})
  // Library id -> run phase from sync:phase events (analyzing/transferring/synced).
  const [phases, setPhases] = useState<Record<string, { phase: string; total: number; done: number }>>({})

  const refresh = useCallback(() => {
    call('listSyncLibraries')
      .then((libs: any) => {
        if (!Array.isArray(libs)) return
        // Stable references: keep the previous objects when nothing meaningful
        // changed, so memoized cards skip re-renders.
        setLibraries((prev: any) => {
          const sig = (l: any) =>
            `${l.id}|${l.status}|${l.paused}|${l.fileCount}|${l.totalSize ?? l.size}|${l.lastScanAt}`
          if (
            prev.length === libs.length &&
            prev.every((l: any, i: number) => sig(l) === sig(libs[i]))
          ) {
            return prev
          }
          return libs
        })
      })
      .catch(() => {})

    call('listDevices')
      .then((devs: any) => {
        if (Array.isArray(devs)) setDevices(devs)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    // Event-driven updates. The 30s interval is only a safety net in case an
    // event was missed — full lists are never polled at poll cadence (that
    // pattern starved the bridge and hung the app).
    const timer = setInterval(refresh, 30000)
    const events = [
      'sync:library:added',
      'sync:library:removed',
      'sync:scan',
      'sync:up_to_date',
      'sync:completed',
      'sync:error',
      'transfer:started',
      'transfer:completed',
      'transfer:failed',
      'transfer:cancelled',
    ]
    const unsubs = events.map((e) => on(e, refresh))

    // Live per-library progress comes from the event stream (real verified
    // bytes), not from polling the transfer log. Returning the previous state
    // when nothing changed keeps references stable (memoized cards skip
    // re-renders).
    const unsubProgress = on('transfer:progress', (delta: any) => {
      if (!delta || delta.source !== 'sync' || !delta.syncLibraryId) return
      setTransferProgress((prev) => {
        const p = Math.min(100, Math.round(delta.progress || 0))
        const s = delta.speed || 0
        const cur = prev[delta.syncLibraryId]
        if (cur && cur.progress === p && cur.speed === s) return prev
        return { ...prev, [delta.syncLibraryId]: { progress: p, speed: s } }
      })
    })
    const unsubDone = on('transfer:completed', (t: any) => {
      if (!t || t.source !== 'sync' || !t.syncLibraryId) return
      setTransferProgress((prev) => {
        if (!prev[t.syncLibraryId]) return prev
        const next = { ...prev }
        delete next[t.syncLibraryId]
        return next
      })
    })
    const unsubFail = on('transfer:failed', (t: any) => {
      if (!t || t.source !== 'sync' || !t.syncLibraryId) return
      setTransferProgress((prev) => {
        if (!prev[t.syncLibraryId]) return prev
        const next = { ...prev }
        delete next[t.syncLibraryId]
        return next
      })
    })
    // Run phases: analyzing → transferring → synced (counters from the engine).
    const unsubPhase = on('sync:phase', (p: any) => {
      if (!p || !p.id) return
      setPhases((prev) => {
        const cur = prev[p.id]
        if (cur && cur.phase === p.phase && cur.total === (p.total || 0) && cur.done === (p.done || 0)) {
          return prev
        }
        return { ...prev, [p.id]: { phase: p.phase, total: p.total || 0, done: p.done || 0 } }
      })
    })

    return () => {
      clearInterval(timer)
      unsubs.forEach((u) => u())
      unsubProgress()
      unsubDone()
      unsubFail()
      unsubPhase()
    }
  }, [refresh])

  const handleApplyTemplate = (tmpl: typeof SYNC_TEMPLATES[0]) => {
    setActiveTemplate(tmpl.key)
    if (tmpl.key !== 'custom') {
      setNewFolderName(tmpl.name)
      setNewFolderPath(tmpl.path)
      setSyncMode(tmpl.mode)
    } else {
      setNewFolderName('')
      setNewFolderPath('')
      setSyncMode('send-only')
    }
  }

  const handleCreateLibrary = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('Name Required', 'Please provide a name for this sync folder.')
      return
    }

    try {
      const mod = NativeModules.MeshDropEngineAssets as any
      if (mod && mod.hasAllFilesAccess) {
        const hasAccess = await mod.hasAllFilesAccess()
        if (!hasAccess && mod.requestAllFilesAccess) {
          Alert.alert(
            'All Files Access Required',
            'To scan and continuously synchronize folders like Camera Roll and Documents across your devices, MeshDrop needs All Files Access permission.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Grant Access',
                onPress: () => mod.requestAllFilesAccess(),
              },
            ]
          )
          return
        }
      }
    } catch {}

    setBusy(true)
    try {
      await call('createSyncLibrary', {
        name: newFolderName.trim(),
        localPath: newFolderPath.trim() || undefined,
        peerId: selectedDevice || undefined,
        mode: syncMode,
      })
      setShowCreateModal(false)
      setNewFolderName('')
      setNewFolderPath('')
      setSelectedDevice('')
      setActiveTemplate('custom')
      refresh()
      // Note: the engine announces a sync invite and waits for the peer to
      // accept before pushing any file — no triggerSync here, or files would
      // land in the peer's default folder before it can pick a custom one.
      Alert.alert('Sync Folder Created', `"${newFolderName}" is now continuously replicated.`)
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create sync folder.')
    } finally {
      setBusy(false)
    }
  }

  const handleTriggerSync = useCallback(async (lib: SyncLibrary) => {
    setSyncingId(lib.id)
    try {
      await call('triggerSync', { id: lib.id })
      refresh()
    } catch (err: any) {
      Alert.alert('Sync Trigger Error', err?.message || 'Could not trigger rescan.')
    } finally {
      setTimeout(() => setSyncingId(null), 1200)
    }
  }, [refresh])

  const handleTogglePause = useCallback(async (lib: SyncLibrary) => {
    try {
      const nextPaused = !lib.paused
      await call('setSyncLibraryPaused', { id: lib.id, paused: nextPaused })
      setLibraries((prev) =>
        prev.map((l) => (l.id === lib.id ? { ...l, paused: nextPaused } : l))
      )
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not update pause state.')
    }
  }, [])

  const handleDeleteLibrary = useCallback((lib: SyncLibrary) => {
    Alert.alert(
      'Remove Sync Mapping',
      `Stop syncing "${lib.name}"? Files on disk will NOT be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await call('deleteSyncLibrary', { id: lib.id })
              refresh()
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete sync folder.')
            }
          },
        },
      ]
    )
  }, [refresh])

  const totalFiles = libraries.reduce((acc, l) => acc + (l.fileCount || l.itemCount || 0), 0)
  // listSyncLibraries returns totalSize (alias: size), not totalBytes.
  const totalBytes = libraries.reduce((acc, l) => acc + (l.totalSize ?? l.size ?? 0), 0)

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Overview Stat Grid */}
      <View style={styles.statGrid}>
        <StatCard
          label="Sync Folders"
          value={libraries.length}
          icon={FolderSync}
          color={theme.primary}
        />
        <StatCard
          label="Tracked Files"
          value={totalFiles}
          icon={FileText}
          color={theme.accent}
        />
        <StatCard
          label="Total Payload"
          value={formatBytes(totalBytes)}
          icon={HardDrive}
          color={theme.success}
        />
      </View>

      {/* Header & Add Button */}
      <View style={styles.sectionHeaderRow}>
        <SectionHeader
          title="Hypercore Sync Hub"
          badge={libraries.length}
        />
        <TouchableOpacity
          style={styles.addFolderBtn}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.8}
        >
          <Plus size={14} color="#FFFFFF" />
          <Text style={styles.addFolderText}>Add Folder</Text>
        </TouchableOpacity>
      </View>

      {/* Sync Libraries Deck */}
      {libraries.length > 0 ? (
        <View style={styles.libList}>
          {libraries.map((lib) => (
            <SyncLibraryCard
              key={lib.id}
              lib={lib}
              progress={transferProgress[lib.id]}
              phase={phases[lib.id]}
              syncingId={syncingId}
              onTrigger={handleTriggerSync}
              onTogglePause={handleTogglePause}
              onDelete={handleDeleteLibrary}
            />
          ))}
        </View>
      ) : (
        <Card style={styles.emptyCard}>
          <FolderSync size={32} color={theme.primary} style={{ marginBottom: 8 }} />
          <Text style={styles.emptyTitle}>No Synced Folders Yet</Text>
          <Text style={styles.emptySub}>
            Map local folders for automated bidirectional Hypercore replication across your mesh devices.
          </Text>
          <Btn
            label="Create First Sync Folder"
            icon={Plus}
            variant="primary"
            onPress={() => setShowCreateModal(true)}
            style={{ marginTop: 14 }}
          />
        </Card>
      )}

      {/* Add Sync Folder Modal */}
      <SimpleModal
        visible={showCreateModal}
        title="New Sync Library"
        subtitle="Configure Hypercore continuous synchronization"
        onClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalBody}>
          {/* Quick-Select Sync Templates */}
          <Text style={styles.inputLabel}>Quick-Start Template</Text>
          <View style={styles.templateGrid}>
            {SYNC_TEMPLATES.map((tmpl) => {
              const isActive = activeTemplate === tmpl.key
              const IconComp = tmpl.icon
              return (
                <TouchableOpacity
                  key={tmpl.key}
                  style={[
                    styles.templateCard,
                    isActive && styles.templateCardActive,
                  ]}
                  onPress={() => handleApplyTemplate(tmpl)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.templateIconBox,
                      { backgroundColor: tmpl.color + '18' },
                    ]}
                  >
                    <IconComp size={15} color={tmpl.color} />
                  </View>
                  <Text
                    style={[
                      styles.templateTitle,
                      isActive && styles.templateTitleActive,
                    ]}
                    numberOfLines={1}
                  >
                    {tmpl.title}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Already-Saved Trusted Peers Binding */}
          {devices.length > 0 && (
            <View style={styles.peerSection}>
              <Text style={styles.inputLabel}>Bind to Saved Trusted Peer</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.peerScrollList}
              >
                <TouchableOpacity
                  style={[
                    styles.peerChip,
                    !selectedDevice && styles.peerChipActive,
                  ]}
                  onPress={() => setSelectedDevice('')}
                  activeOpacity={0.8}
                >
                  <Radio size={14} color={!selectedDevice ? theme.primary : theme.muted} />
                  <Text
                    style={[
                      styles.peerChipText,
                      !selectedDevice && styles.peerChipTextActive,
                    ]}
                  >
                    All Mesh Peers
                  </Text>
                </TouchableOpacity>

                {devices.map((dev) => {
                  const devKey = (dev as any).publicKey || dev.id
                  const isSelected = selectedDevice === devKey || selectedDevice === dev.id
                  return (
                    <TouchableOpacity
                      key={dev.id}
                      style={[
                        styles.peerChip,
                        isSelected && styles.peerChipActive,
                      ]}
                      onPress={() => setSelectedDevice(devKey)}
                      activeOpacity={0.8}
                    >
                      <DeviceAvatar
                        name={dev.name}
                        isOnline={dev.isOnline}
                        isTrusted={dev.isTrusted}
                        size={22}
                      />
                      <Text
                        style={[
                          styles.peerChipText,
                          isSelected && styles.peerChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {dev.name}
                      </Text>
                      {isSelected && (
                        <Check size={12} color={theme.primary} style={{ marginLeft: 2 }} />
                      )}
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>
          )}

          <Text style={styles.inputLabel}>Folder Display Name</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Work Documents or Camera Roll"
            placeholderTextColor={theme.muted}
            value={newFolderName}
            onChangeText={(t) => {
              setNewFolderName(t)
              setActiveTemplate('custom')
            }}
          />

          <Text style={styles.inputLabel}>Custom Subfolder Path (Optional)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. DCIM/Camera or Documents"
            placeholderTextColor={theme.muted}
            value={newFolderPath}
            onChangeText={(t) => {
              setNewFolderPath(t)
              setActiveTemplate('custom')
            }}
          />

          <Text style={styles.inputLabel}>Replication Mode</Text>
          <View style={styles.modeRow}>
            {[
              { key: 'two-way', label: 'Bidirectional' },
              { key: 'send-only', label: 'Send Only' },
              { key: 'receive-only', label: 'Receive Only' },
            ].map((m) => {
              const isActive = syncMode === m.key
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.modeChip, isActive && styles.modeChipActive]}
                  onPress={() => {
                    setSyncMode(m.key as any)
                    setActiveTemplate('custom')
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.modeChipText,
                      isActive && styles.modeChipTextActive,
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Network Controls */}
          <View style={styles.switchRow}>
            <View style={styles.flex1}>
              <Text style={styles.switchTitle}>Network Policy</Text>
              <Text style={styles.switchSub}>
                Not supported on this build — sync runs over whichever network is available
              </Text>
            </View>
            <Pill label="Any" color={theme.muted} />
          </View>

          <View style={styles.modalCtaWrap}>
            <Btn
              label="Activate Sync Library"
              icon={Sparkles}
              variant="primary"
              onPress={handleCreateLibrary}
              loading={busy}
              size="lg"
            />
          </View>
        </View>
      </SimpleModal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 90,
  },
  statGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  addFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  addFolderText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  libList: {
    gap: 12,
  },
  libCard: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
  },
  libHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  folderIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.2)',
  },
  libTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  libName: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '900',
    flex: 1,
  },
  libPath: {
    color: theme.muted,
    fontSize: 11,
    marginTop: 2,
    fontFamily: fonts.mono,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  telemetryItem: {
    flex: 1,
  },
  telemetryLabel: {
    color: theme.muted,
    fontSize: 10.5,
    fontWeight: '700',
  },
  telemetryValue: {
    color: theme.text,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
    fontFamily: fonts.mono,
  },
  progressWrap: {
    marginBottom: 12,
    // Fixed height so the card layout never shifts when progress appears.
    height: 23,
    justifyContent: 'flex-start',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: theme.primary,
  },
  progressText: {
    color: theme.muted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    fontFamily: fonts.mono,
    textAlign: 'right',
  },
  libActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionPillBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionPillDanger: {
    backgroundColor: theme.dangerBg,
    borderColor: theme.dangerBorder,
  },
  actionPillText: {
    color: theme.text,
    fontSize: 11.5,
    fontWeight: '800',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySub: {
    color: theme.muted,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 290,
  },
  modalBody: {
    paddingVertical: 4,
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  templateCard: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  templateCardActive: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  templateIconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateTitle: {
    color: theme.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
    flex: 1,
  },
  templateTitleActive: {
    color: theme.primary,
    fontWeight: '900',
  },
  peerSection: {
    marginBottom: 12,
  },
  peerScrollList: {
    gap: 8,
    paddingVertical: 2,
  },
  peerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  peerChipActive: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  peerChipText: {
    color: theme.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
    maxWidth: 110,
  },
  peerChipTextActive: {
    color: theme.primary,
    fontWeight: '900',
  },
  inputLabel: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 4,
  },
  textInput: {
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    padding: 12,
    color: theme.text,
    fontSize: 13,
    marginBottom: 10,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  modeChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: theme.radiusSm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  modeChipActive: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  modeChipText: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  modeChipTextActive: {
    color: theme.primary,
    fontWeight: '900',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.hairline,
    marginBottom: 14,
  },
  switchTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '800',
  },
  switchSub: {
    color: theme.muted,
    fontSize: 11,
    marginTop: 1,
  },
  modalCtaWrap: {
    paddingTop: 4,
    paddingBottom: 8,
  },
})
