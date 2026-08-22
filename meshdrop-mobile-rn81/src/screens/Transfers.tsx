import React, { useCallback, useEffect, useState, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native'
import {
  ArrowUp,
  ArrowDown,
  Check,
  X,
  RefreshCw,
  Zap,
  Activity,
  FileText,
  Pause,
  Play,
  Clock,
  Sparkles,
  Layers,
  Trash2,
  RotateCcw,
} from 'lucide-react-native'
import { call, on } from '../bridge'
import {
  Card,
  StatCard,
  Btn,
  Pill,
  SectionHeader,
} from '../components'
import { useTheme, fonts, theme } from '../theme'

interface Transfer {
  id: string
  filename: string
  fileSize?: number
  bytesTransferred?: number
  progress?: number
  direction: 'send' | 'receive'
  status:
    | 'queued'
    | 'active'
    | 'pending_approval'
    | 'waiting_peer'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'interrupted'
  peerName?: string
  peerId?: string
  speed?: number
  speedBytesPerSec?: number
  eta?: number
  error?: string
}

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

function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return '0 KB/s'
  return `${formatBytes(bps)}/s`
}

function formatEta(seconds?: number): string {
  if (!seconds || seconds <= 0) return '--'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

export function Transfers() {
  const { theme } = useTheme()
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all')

  const refresh = useCallback(() => {
    call('listTransfers')
      .then((t) => setTransfers((t as Transfer[]) || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const discreteEvents = [
      'transfer:queued',
      'transfer:started',
      'transfer:completed',
      'transfer:failed',
      'transfer:cancelled',
      'transfer:paused',
      'transfer:resumed',
    ]
    const unsubs = discreteEvents.map((e) => on(e, refresh))

    let lastProgress = 0
    const unsubProgress = on('transfer:progress', (delta: any) => {
      const now = Date.now()
      if (now - lastProgress > 100) {
        lastProgress = now
        if (delta && delta.id) {
          setTransfers((prev) =>
            prev.map((t) => (t.id === delta.id ? { ...t, ...delta } : t))
          )
        }
      }
    })

    return () => {
      unsubs.forEach((u) => u())
      unsubProgress()
    }
  }, [refresh])

  const handlePause = (id: string) => {
    call('pauseTransfer', { id }).catch(() => {})
  }

  const handleResume = (id: string) => {
    call('resumeTransfer', { id }).catch(() => {})
  }

  const handlePauseResume = (transfer: Transfer) => {
    if (transfer.status === 'paused') {
      handleResume(transfer.id)
    } else {
      handlePause(transfer.id)
    }
  }

  const handleCancel = (id: string) => {
    call('cancelTransfer', { id }).catch(() => {})
  }

  const handleRetry = (id: string) => {
    call('retryTransfer', { id }).catch(() => {})
  }

  const handleDelete = async (id: string) => {
    await call('deleteTransfer', { id }).catch(() => {})
    setTransfers((prev) => prev.filter((t) => t.id !== id))
  }

  const handleClear = () => {
    Alert.alert(
      'Clear Transfer Logs',
      'Choose which transfer logs to clear from the list:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Finished Only',
          onPress: async () => {
            await call('clearTransfers').catch(() => {})
            refresh()
          },
        },
        {
          text: 'Clear All (Inc. Awaiting)',
          style: 'destructive',
          onPress: async () => {
            await call('clearTransfers', { includePending: true }).catch(() => {})
            refresh()
          },
        },
      ]
    )
  }

  const activeTransfers = useMemo(
    () =>
      transfers.filter((t) =>
        ['active', 'queued', 'waiting_peer', 'paused', 'pending_approval'].includes(t.status)
      ),
    [transfers]
  )

  const aggregateSpeed = useMemo(() => {
    return activeTransfers.reduce(
      (acc, t) => acc + (t.speed || t.speedBytesPerSec || 0),
      0
    )
  }, [activeTransfers])

  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      if (filter === 'active') {
        return (
          t.status === 'active' ||
          t.status === 'queued' ||
          t.status === 'waiting_peer' ||
          t.status === 'paused'
        )
      }
      if (filter === 'completed') return t.status === 'completed'
      if (filter === 'failed') {
        return (
          t.status === 'failed' ||
          t.status === 'cancelled' ||
          t.status === 'interrupted'
        )
      }
      return true
    })
  }, [transfers, filter])

  const activeCount = useMemo(
    () =>
      transfers.filter(
        (t) =>
          t.status === 'active' ||
          t.status === 'queued' ||
          t.status === 'waiting_peer' ||
          t.status === 'paused'
      ).length,
    [transfers]
  )

  const activeSpeed = useMemo(
    () =>
      transfers
        .filter((t) => t.status === 'active')
        .reduce((acc, t) => acc + (t.speed || t.speedBytesPerSec || 0), 0),
    [transfers]
  )

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Live Metrics Grid */}
      <View style={styles.statGrid}>
        <StatCard
          label="Active Streams"
          value={activeCount}
          icon={Activity}
          color={activeCount > 0 ? theme.primary : theme.muted}
        />
        <StatCard
          label="Live Speed"
          value={activeSpeed > 0 ? `${formatBytes(activeSpeed)}/s` : '0 B/s'}
          icon={Zap}
          color={activeSpeed > 0 ? theme.success : theme.muted}
        />
        <StatCard
          label="Total Tracked"
          value={transfers.length}
          icon={Layers}
          color={theme.accent}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {[
          { key: 'all', label: `All (${transfers.length})` },
          { key: 'active', label: `Live (${activeCount})` },
          {
            key: 'completed',
            label: `Done (${transfers.filter((t) => t.status === 'completed').length})`,
          },
          {
            key: 'failed',
            label: `Failed (${transfers.filter((t) => ['failed', 'cancelled', 'interrupted'].includes(t.status)).length})`,
          },
        ].map((tab) => {
          const isActive = filter === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.filterChip,
                { backgroundColor: theme.bgCard, borderColor: theme.border },
                isActive && { backgroundColor: theme.primarySoft, borderColor: theme.primary + '50' },
              ]}
              onPress={() => setFilter(tab.key as any)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: theme.muted },
                  isActive && { color: theme.primary, fontWeight: '900' },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Active Transfer Stream Deck */}
      <SectionHeader title="Payload Streams" badge={filteredTransfers.length} />

      {filteredTransfers.length > 0 ? (
        <View style={styles.transferList}>
          {filteredTransfers.map((item) => {
            const isSend = item.direction === 'send'
            const isCompleted = item.status === 'completed'
            const isPaused = item.status === 'paused'
            const isFailed =
              item.status === 'failed' ||
              item.status === 'cancelled' ||
              item.status === 'interrupted'

            const pct = Math.round(item.progress || 0)
            const speed = item.speed || item.speedBytesPerSec || 0

            return (
              <Card
                key={item.id}
                glow={item.status === 'active'}
                style={[
                  styles.transferCard,
                  { backgroundColor: theme.bgCard, borderColor: theme.border },
                  isCompleted && styles.transferCardFinished,
                ]}
              >
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.directionIconBox,
                      isSend
                        ? { backgroundColor: theme.primarySoft, borderColor: theme.primary + '35' }
                        : { backgroundColor: theme.accentSoft, borderColor: theme.accent + '35' },
                    ]}
                  >
                    {isSend ? (
                      <ArrowUp size={18} color={theme.primary} />
                    ) : (
                      <ArrowDown size={18} color={theme.accent} />
                    )}
                  </View>

                  <View style={styles.flex1}>
                    <Text style={[styles.filename, { color: theme.text }]} numberOfLines={1}>
                      {item.filename}
                    </Text>
                    <Text style={[styles.fileMeta, { color: theme.textSecondary }]}>
                      {formatBytes(item.bytesTransferred)} / {formatBytes(item.fileSize)} ·{' '}
                      {isSend ? 'To' : 'From'} {item.peerName || 'Mesh Peer'}
                    </Text>
                  </View>

                  <Pill
                    label={
                      isCompleted
                        ? '100% Synced'
                        : isPaused
                        ? 'Paused'
                        : isFailed
                        ? 'Failed'
                        : `${pct}%`
                    }
                    color={
                      isCompleted
                        ? theme.success
                        : isPaused
                        ? theme.warning
                        : isFailed
                        ? theme.danger
                        : theme.primary
                    }
                    dot={!isCompleted && !isFailed}
                  />
                </View>

                {/* Progress Indicator */}
                {!isCompleted && !isFailed && (
                  <View style={styles.progressSection}>
                    <View style={[styles.progressBarBg, { backgroundColor: theme.bgElevated }]}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.min(100, pct)}%`,
                            backgroundColor: isPaused ? theme.warning : theme.primary,
                          },
                        ]}
                      />
                    </View>

                    <View style={styles.progressTelemetry}>
                      <Text style={[styles.telemetrySpeed, { color: theme.success }]}>
                        {speed > 0 ? `${formatBytes(speed)}/s` : 'Connecting…'}
                      </Text>
                      {item.eta ? (
                        <Text style={[styles.telemetryEta, { color: theme.muted }]}>{item.eta}s remaining</Text>
                      ) : null}
                    </View>
                  </View>
                )}

                {/* Actions */}
                {!isCompleted && (
                  <View style={[styles.actionsRow, { borderTopColor: theme.hairline }]}>
                    {!isFailed && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: theme.bgElevated }]}
                        onPress={() => handlePauseResume(item)}
                        activeOpacity={0.7}
                      >
                        {isPaused ? (
                          <Play size={12} color={theme.success} />
                        ) : (
                          <Pause size={12} color={theme.warning} />
                        )}
                        <Text style={[styles.actionBtnText, { color: theme.text }]}>
                          {isPaused ? 'Resume' : 'Pause'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnDanger, { backgroundColor: theme.dangerBg }]}
                      onPress={() => handleCancel(item.id)}
                      activeOpacity={0.7}
                    >
                      <X size={12} color={theme.danger} />
                      <Text style={[styles.actionBtnText, { color: theme.danger }]}>
                        {isFailed ? 'Dismiss' : 'Cancel'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            )
          })}
        </View>
      ) : (
        <Card style={[styles.emptyCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Activity size={32} color={theme.muted} style={{ marginBottom: 8 }} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Active Payload Streams</Text>
          <Text style={[styles.emptySub, { color: theme.muted }]}>
            Files currently being transmitted or received across your mesh swarm will appear here in real time.
          </Text>
        </Card>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  container: {
    flex: 1,
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  transferList: {
    gap: 10,
    marginTop: 6,
  },
  transferCard: {
    padding: 14,
  },
  transferCardFinished: {
    opacity: 0.9,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  directionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  filename: {
    fontSize: 14,
    fontWeight: '800',
  },
  fileMeta: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: fonts.mono,
  },
  progressSection: {
    marginTop: 12,
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressTelemetry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  telemetrySpeed: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: fonts.mono,
  },
  telemetryEta: {
    fontSize: 11,
    fontFamily: fonts.mono,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionBtnDanger: {},
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 290,
  },
})
