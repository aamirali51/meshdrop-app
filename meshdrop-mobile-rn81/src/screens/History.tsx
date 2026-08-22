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
  Pill,
  SectionHeader,
} from '../components'
import { useTheme, fonts } from '../theme'

interface TransferHistoryItem {
  id: string
  filename: string
  fileSize?: number
  direction: 'send' | 'receive'
  status: string
  peerName?: string
  completedAt?: string
  createdAt?: string
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

function formatDate(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const month = d.toLocaleString('en-US', { month: 'short' })
    const day = d.getDate()
    const hours = d.getHours().toString().padStart(2, '0')
    const mins = d.getMinutes().toString().padStart(2, '0')
    return `${month} ${day}, ${hours}:${mins}`
  } catch {
    return iso.slice(0, 10)
  }
}

export function History() {
  const { theme } = useTheme()
  const [history, setHistory] = useState<TransferHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'send' | 'receive'>('all')

  const refresh = useCallback(() => {
    setLoading(true)
    call('getTransferHistory')
      .then((res: any) => {
        if (Array.isArray(res)) setHistory(res)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()

    const unsubComplete = on('transfer:complete', () => {
      refresh()
    })

    return () => {
      unsubComplete()
    }
  }, [refresh])

  const handleClearHistory = () => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear all completed and failed transfer records?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            call('clearTransferHistory')
              .then(() => setHistory([]))
              .catch(() => {})
          },
        },
      ]
    )
  }

  const handleDeleteItem = (id: string) => {
    call('deleteHistoryItem', { id })
      .then(() => {
        setHistory((prev) => prev.filter((item) => item.id !== id))
      })
      .catch(() => {})
  }

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchQuery =
        !query ||
        item.filename.toLowerCase().includes(query.toLowerCase()) ||
        (item.peerName && item.peerName.toLowerCase().includes(query.toLowerCase()))

      if (!matchQuery) return false
      if (filterType === 'send') return item.direction === 'send'
      if (filterType === 'receive') return item.direction === 'receive'
      return true
    })
  }, [history, query, filterType])

  const totalBytesTransferred = useMemo(() => {
    return history
      .filter((h) => h.status === 'complete' || h.status === 'completed')
      .reduce((acc, h) => acc + (h.fileSize || 0), 0)
  }, [history])

  const completedCount = useMemo(() => {
    return history.filter((h) => h.status === 'complete' || h.status === 'completed').length
  }, [history])

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.statGrid}>
        <StatCard
          label="Total Volume"
          value={formatBytes(totalBytesTransferred)}
          icon={HardDrive}
          color={theme.primary}
        />
        <StatCard
          label="Completed"
          value={completedCount}
          icon={Check}
          color={theme.success}
        />
        <StatCard
          label="Total Records"
          value={history.length}
          icon={Layers}
          color={theme.accent}
        />
      </View>

      <View style={styles.actionHeaderRow}>
        <SectionHeader title="Transfer Ledger" badge={history.length} />
        {history.length > 0 && (
          <TouchableOpacity
            style={[styles.clearBtn, { backgroundColor: theme.dangerBg, borderColor: theme.dangerBorder }]}
            onPress={handleClearHistory}
            activeOpacity={0.7}
          >
            <Trash2 size={13} color={theme.danger} />
            <Text style={[styles.clearBtnText, { color: theme.danger }]}>Clear Ledger</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.searchBar, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <Search size={15} color={theme.muted} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search transfer history by filename or peer…"
          placeholderTextColor={theme.muted}
          value={query}
          onChangeText={setQuery}
        />
        {!!query && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={[styles.clearSearchText, { color: theme.muted }]}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScroll}
      >
        {[
          { key: 'all', label: `All (${history.length})` },
          { key: 'send', label: 'Sent' },
          { key: 'receive', label: 'Received' },
        ].map((tab) => {
          const isActive = filterType === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.filterChip,
                { backgroundColor: theme.bgCard, borderColor: theme.border },
                isActive && { backgroundColor: theme.primarySoft, borderColor: theme.primary + '50' },
              ]}
              onPress={() => setFilterType(tab.key as any)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: theme.muted },
                  isActive && { color: theme.primary, fontWeight: '800' },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {filteredHistory.length === 0 ? (
        <Card style={[styles.emptyCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <HistoryIcon size={36} color={theme.muted} style={{ marginBottom: 12 }} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Transfer Records</Text>
          <Text style={[styles.emptySub, { color: theme.muted }]}>
            {query
              ? 'No transfers match your search query.'
              : 'Completed, canceled, and interrupted transfers will appear in this ledger.'}
          </Text>
        </Card>
      ) : (
        <View style={styles.historyList}>
          {filteredHistory.map((item) => {
            const isSend = item.direction === 'send'
            const isSuccess = item.status === 'complete' || item.status === 'completed'
            const isCanceled = item.status === 'cancelled' || item.status === 'canceled'

            return (
              <Card key={item.id} style={[styles.itemCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
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
                      {formatBytes(item.fileSize)} · {isSend ? 'To' : 'From'}{' '}
                      {item.peerName || 'Mesh Peer'}
                    </Text>
                  </View>

                  <View style={styles.statusCol}>
                    <Pill
                      label={
                        isSuccess
                          ? 'Completed'
                          : isCanceled
                          ? 'Canceled'
                          : 'Interrupted'
                      }
                      color={
                        isSuccess
                          ? theme.success
                          : isCanceled
                          ? theme.muted
                          : theme.danger
                      }
                    />
                    <Text style={[styles.timestampText, { color: theme.muted }]}>
                      {formatDate(item.completedAt || item.createdAt)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.deleteCardBtn, { backgroundColor: theme.dangerBg }]}
                    onPress={() => handleDeleteItem(item.id)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={12} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              </Card>
            )
          })}
        </View>
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
  actionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  clearBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  clearSearchText: {
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
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  historyList: {
    gap: 10,
  },
  itemCard: {
    padding: 12,
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
    fontSize: 13.5,
    fontWeight: '800',
  },
  fileMeta: {
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
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  timestampText: {
    fontSize: 10,
    fontFamily: fonts.mono,
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
