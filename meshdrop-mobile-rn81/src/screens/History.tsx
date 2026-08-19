import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native'
import {
  History as HistoryIcon,
  Search,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  Trash2,
  FileText,
  Clock,
  HardDrive,
  Sparkles,
  Layers,
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

interface TransferHistoryItem {
  id: string
  filename: string
  fileSize?: number
  direction: 'send' | 'receive'
  status: string
  peerName?: string
  peerId?: string
  createdAt?: string
  completedAt?: string
  interruptedAt?: string
  cancelledAt?: string
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

function formatTimestamp(value?: string): string {
  if (!value) return 'Recent'
  const d = new Date(value)
  if (isNaN(d.getTime())) return 'Recent'
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function History() {
  const [transfers, setTransfers] = useState<TransferHistoryItem[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'send' | 'receive' | 'completed' | 'failed'>('all')

  const refresh = useCallback(() => {
    call('listTransfers')
      .then((res: any) => {
        if (Array.isArray(res)) setTransfers(res)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const events = ['transfer:completed', 'transfer:failed', 'transfer:cancelled']
    const unsubs = events.map((e) => on(e, refresh))
    return () => unsubs.forEach((u) => u())
  }, [refresh])

  const handleDeleteRecord = async (id: string) => {
    await call('deleteTransfer', { id }).catch(() => {})
    setTransfers((prev) => prev.filter((t) => t.id !== id))
  }

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Transfer Ledger',
      'Choose which logs to remove from the transmission history:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Finished Logs',
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

  const totals = useMemo(() => {
    let sent = 0
    let recv = 0
    transfers.forEach((t) => {
      if (t.status === 'completed') {
        if (t.direction === 'send') sent += t.fileSize || 0
        else recv += t.fileSize || 0
      }
    })
    return { sent, recv, total: sent + recv }
  }, [transfers])

  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      const matchQuery =
        !query ||
        t.filename?.toLowerCase().includes(query.toLowerCase()) ||
        t.peerName?.toLowerCase().includes(query.toLowerCase())

      if (!matchQuery) return false

      if (filter === 'send') return t.direction === 'send'
      if (filter === 'receive') return t.direction === 'receive'
      if (filter === 'completed') return t.status === 'completed'
      if (filter === 'failed')
        return ['failed', 'cancelled', 'interrupted'].includes(t.status)
      return true
    })
  }, [transfers, query, filter])

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Historical Ledger Stat Grid */}
      <View style={styles.statGrid}>
        <StatCard
          label="Total Volume"
          value={formatBytes(totals.total)}
          icon={HardDrive}
          color={theme.primary}
        />
        <StatCard
          label="Beamed Out"
          value={formatBytes(totals.sent)}
          icon={ArrowUp}
          color={theme.accent}
        />
        <StatCard
          label="Received"
          value={formatBytes(totals.recv)}
          icon={ArrowDown}
          color={theme.success}
        />
      </View>

      {/* Header & Clear Action */}
      <View style={styles.sectionHeaderRow}>
        <SectionHeader
          title="Transmission Ledger"
          badge={transfers.length}
        />
        {transfers.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClearHistory}
            activeOpacity={0.8}
          >
            <Trash2 size={13} color={theme.danger} />
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Search size={15} color={theme.muted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by file or peer name…"
          placeholderTextColor={theme.muted}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={styles.clearSearchText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScroll}
      >
        {[
          { key: 'all', label: `All (${transfers.length})` },
          { key: 'send', label: 'Beamed Out' },
          { key: 'receive', label: 'Received' },
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
      </ScrollView>

      {/* Ledger History List */}
      {filteredTransfers.length > 0 ? (
        <View style={styles.historyList}>
          {filteredTransfers.map((item) => {
            const isSend = item.direction === 'send'
            const isCompleted = item.status === 'completed'
            const isFailed = ['failed', 'cancelled', 'interrupted'].includes(item.status)
            const isActive = !isCompleted && !isFailed

            const timestamp = item.completedAt || item.interruptedAt || item.cancelledAt || item.createdAt

            const label =
              item.status === 'completed'
                ? 'Verified'
                : item.status === 'interrupted'
                ? 'Stopped'
                : item.status === 'failed'
                ? 'Failed'
                : item.status === 'cancelled'
                ? 'Cancelled'
                : item.status === 'paused'
                ? 'Paused'
                : 'Active'

            const pillColor = isCompleted
              ? theme.success
              : isFailed
              ? theme.danger
              : theme.primary

            return (
              <Card key={item.id} style={styles.itemCard}>
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.directionIconBox,
                      isSend ? styles.sendBg : styles.recvBg,
                    ]}
                  >
                    {isSend ? (
                      <ArrowUp size={15} color={theme.primary} />
                    ) : (
                      <ArrowDown size={15} color={theme.accent} />
                    )}
                  </View>

                  <View style={styles.flex1}>
                    <Text style={styles.filename} numberOfLines={1}>
                      {item.filename || 'Transfer'}
                    </Text>
                    <Text style={styles.fileMeta}>
                      {formatBytes(item.fileSize)} · {item.peerName ? `Peer: ${item.peerName}` : 'P2P Direct'}
                    </Text>
                  </View>

                  <View style={styles.statusCol}>
                    <Pill
                      label={label}
                      color={pillColor}
                      dot={isCompleted || item.status === 'active'}
                    />
                    <Text style={styles.timestampText}>
                      {formatTimestamp(timestamp)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.deleteCardBtn}
                    onPress={() => handleDeleteRecord(item.id)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={14} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              </Card>
            )
          })}
        </View>
      ) : (
        <Card style={styles.emptyCard}>
          <HistoryIcon size={32} color={theme.primary} style={{ marginBottom: 8 }} />
          <Text style={styles.emptyTitle}>No Ledger Records Found</Text>
          <Text style={styles.emptySub}>
            Completed and logged transmissions will be permanently recorded in this local audit deck.
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.dangerBg,
    borderColor: theme.dangerBorder,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  clearBtnText: {
    color: theme.danger,
    fontSize: 11.5,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    color: theme.text,
    fontSize: 13,
    padding: 0,
  },
  clearSearchText: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  tabScroll: {
    gap: 8,
    paddingBottom: 14,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterChipActive: {
    backgroundColor: theme.primarySoft,
    borderColor: 'rgba(79, 70, 229, 0.3)',
  },
  filterChipText: {
    color: theme.muted,
    fontSize: 11.5,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: theme.primary,
    fontWeight: '800',
  },
  historyList: {
    gap: 10,
  },
  itemCard: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
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
    fontSize: 13.5,
    fontWeight: '800',
  },
  fileMeta: {
    color: theme.textSecondary,
    fontSize: 11,
    marginTop: 2,
    fontFamily: fonts.mono,
  },
  statusCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  deleteCardBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: theme.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  timestampText: {
    color: theme.muted,
    fontSize: 10,
    fontFamily: fonts.mono,
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
