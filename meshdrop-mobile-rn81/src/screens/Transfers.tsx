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
import { theme, fonts } from '../theme'

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
    if (filter === 'active') return activeTransfers
    if (filter === 'completed') return transfers.filter((t) => t.status === 'completed')
    if (filter === 'failed')
      return transfers.filter((t) =>
        ['failed', 'cancelled', 'interrupted'].includes(t.status)
      )
    return transfers
  }, [transfers, activeTransfers, filter])

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Live Speed & Activity Telemetry */}
      <View style={styles.statGrid}>
        <StatCard
          label="Active Streams"
          value={activeTransfers.length}
          icon={Activity}
          color={theme.primary}
        />
        <StatCard
          label="Transfer Rate"
          value={formatSpeed(aggregateSpeed)}
          icon={Zap}
          color={theme.success}
        />
        <StatCard
          label="Total History"
          value={transfers.length}
          icon={Layers}
          color={theme.accent}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {[
          { key: 'all', label: `All (${transfers.length})` },
          { key: 'active', label: `Live (${activeTransfers.length})` },
          { key: 'completed', label: 'Completed' },
          { key: 'failed', label: 'Failed' },
        ].map((tab) => {
          const isActive = filter === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setFilter(tab.key as any)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive && styles.filterChipTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Transfers Stream Deck */}
      <SectionHeader
        title="Transfer Queue"
        badge={filteredTransfers.length}
        actionLabel={transfers.length > 0 ? 'Clear Logs' : undefined}
        onAction={handleClear}
      />

      {filteredTransfers.length > 0 ? (
        <View style={styles.transferList}>
          {filteredTransfers.map((t) => {
            const isSend = t.direction === 'send'
            const isFinished = ['completed', 'failed', 'cancelled', 'interrupted'].includes(t.status)
            const speed = t.speed || t.speedBytesPerSec || 0
            const progress = t.progress != null ? Math.round(t.progress > 1 ? t.progress : t.progress * 100) : 0

            return (
              <Card
                key={t.id}
                glow={!isFinished}
                style={[styles.transferCard, isFinished && styles.transferCardFinished]}
              >
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.directionIconBox,
                      isSend ? styles.sendBg : styles.recvBg,
                    ]}
                  >
                    {isSend ? (
                      <ArrowUp size={16} color={theme.primary} />
                    ) : (
                      <ArrowDown size={16} color={theme.accent} />
                    )}
                  </View>

                  <View style={styles.flex1}>
                    <Text style={styles.filename} numberOfLines={1}>
                      {t.filename || 'P2P File Transfer'}
                    </Text>
                    <Text style={styles.fileMeta}>
                      {formatBytes(t.fileSize)} · {t.peerName ? `Peer: ${t.peerName}` : 'P2P Direct'}
                    </Text>
                  </View>

                  <Pill
                    label={
                      t.status === 'active'
                        ? `${progress}%`
                        : t.status === 'completed'
                        ? 'Done'
                        : t.status === 'failed'
                        ? 'Failed'
                        : t.status === 'interrupted'
                        ? 'Stopped'
                        : t.status === 'paused'
                        ? 'Paused'
                        : t.status === 'waiting_peer'
                        ? 'Waiting'
                        : t.status === 'pending_approval'
                        ? 'Approval'
                        : t.status === 'cancelled'
                        ? 'Cancelled'
                        : 'Queued'
                    }
                    color={
                      t.status === 'completed'
                        ? theme.success
                        : t.status === 'failed'
                        ? theme.danger
                        : t.status === 'interrupted'
                        ? theme.danger
                        : t.status === 'paused'
                        ? theme.warning
                        : t.status === 'waiting_peer'
                        ? theme.warning
                        : t.status === 'pending_approval'
                        ? theme.warning
                        : theme.primary
                    }
                    dot={t.status === 'active'}
                  />
                </View>

                {/* Progress Gauge */}
                {!isFinished && (
                  <View style={styles.progressSection}>
                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.max(2, Math.min(100, progress))}%`,
                            backgroundColor: isSend ? theme.primary : theme.accent,
                          },
                        ]}
                      />
                    </View>

                    <View style={styles.progressTelemetry}>
                      <Text style={styles.telemetrySpeed}>
                        {formatSpeed(speed)}
                      </Text>
                      <Text style={styles.telemetryEta}>
                        ETA: {formatEta(t.eta)}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Micro Action Buttons */}
                {!isFinished ? (
                  <View style={styles.actionsRow}>
                    {t.status === 'paused' && (
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleResume(t.id)}
                        activeOpacity={0.7}
                      >
                        <Play size={13} color={theme.success} />
                        <Text style={styles.actionBtnText}>Resume</Text>
                      </TouchableOpacity>
                    )}
                    {t.status === 'active' && (
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handlePause(t.id)}
                        activeOpacity={0.7}
                      >
                        <Pause size={13} color={theme.warning} />
                        <Text style={styles.actionBtnText}>Pause</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnDanger]}
                      onPress={() => handleCancel(t.id)}
                      activeOpacity={0.7}
                    >
                      <X size={13} color={theme.danger} />
                      <Text style={[styles.actionBtnText, { color: theme.danger }]}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnDanger]}
                      onPress={() => handleDelete(t.id)}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={13} color={theme.danger} />
                      <Text style={[styles.actionBtnText, { color: theme.danger }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.actionsRow}>
                    {t.status === 'failed' && (
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleRetry(t.id)}
                        activeOpacity={0.7}
                      >
                        <RotateCcw size={13} color={theme.primary} />
                        <Text style={[styles.actionBtnText, { color: theme.primary }]}>Retry</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnDanger]}
                      onPress={() => handleDelete(t.id)}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={13} color={theme.danger} />
                      <Text style={[styles.actionBtnText, { color: theme.danger }]}>Delete Log</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            )
          })}
        </View>
      ) : (
        <Card style={styles.emptyCard}>
          <Activity size={32} color={theme.primary} style={{ marginBottom: 8 }} />
          <Text style={styles.emptyTitle}>No Active File Streams</Text>
          <Text style={styles.emptySub}>
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: theme.radiusSm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: theme.primarySoft,
    borderColor: 'rgba(79, 70, 229, 0.3)',
  },
  filterChipText: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: theme.primary,
    fontWeight: '900',
  },
  transferList: {
    gap: 10,
    marginTop: 6,
  },
  transferCard: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
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
  },
  sendBg: {
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.2)',
  },
  recvBg: {
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(8, 145, 178, 0.2)',
  },
  filename: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
  },
  fileMeta: {
    color: theme.textSecondary,
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
    backgroundColor: theme.bgElevated,
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
    color: theme.success,
    fontSize: 11,
    fontWeight: '900',
    fontFamily: fonts.mono,
  },
  telemetryEta: {
    color: theme.muted,
    fontSize: 11,
    fontFamily: fonts.mono,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.hairline,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: theme.bgElevated,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionBtnDanger: {
    backgroundColor: theme.dangerBg,
  },
  actionBtnText: {
    color: theme.text,
    fontSize: 11,
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
})
