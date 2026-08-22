import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native'
import {
  Activity,
  Zap,
  Wifi,
  Radio,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Check,
  Cpu,
  Layers,
  Server,
  Sparkles,
} from 'lucide-react-native'
import { call } from '../bridge'
import {
  Card,
  StatCard,
  Btn,
  Pill,
  SectionHeader,
} from '../components'
import { useTheme, fonts } from '../theme'

export function Diagnostics({ identity }: { identity?: any }) {
  const { theme } = useTheme()
  const [status, setStatus] = useState<any>(null)
  const [paths, setPaths] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [pingResult, setPingResult] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    Promise.all([call('getStatus'), call('getPaths')])
      .then(([s, p]) => {
        setStatus(s)
        setPaths(p)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleRefresh = async () => {
    setPingResult('Refreshing swarm telemetry…')
    try {
      const s: any = await call('getStatus')
      setStatus(s)
      const peers = s?.peerCount || 0
      setPingResult(
        `Swarm synchronized: ${peers} peer${peers === 1 ? '' : 's'} linked on DHT.`
      )
    } catch {
      setPingResult('Telemetry refresh failed.')
    }
  }

  const isRunning = status?.running !== false

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Swarm Diagnostics</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Real-time telemetry, Hyperswarm DHT, & engine status
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, { backgroundColor: theme.primarySoft, borderColor: theme.primary + '35' }]}
          onPress={refresh}
          activeOpacity={0.7}
        >
          <RefreshCw size={16} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Top Stat Grid */}
      <View style={styles.statGrid}>
        <StatCard
          label="Engine Status"
          value={isRunning ? 'Online' : 'Stopped'}
          icon={Activity}
          color={isRunning ? theme.success : theme.danger}
        />
        <StatCard
          label="Swarm Peers"
          value={status?.peerCount ?? 0}
          icon={Radio}
          color={theme.primary}
        />
        <StatCard
          label="DHT State"
          value={status?.dhtReady ? 'Ready' : 'Binding'}
          icon={Zap}
          color={theme.accent}
        />
      </View>

      {/* Node Cryptographic Identity */}
      <SectionHeader title="Cryptographic Identity" />
      <Card style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <View style={styles.cardTitleRow}>
          <ShieldCheck size={16} color={theme.primary} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>Noise Sovereign Key</Text>
        </View>

        <View style={[styles.infoRow, { borderBottomColor: theme.hairline }]}>
          <Text style={[styles.infoLabel, { color: theme.muted }]}>Node Name</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{identity?.name || status?.deviceName || '—'}</Text>
        </View>

        <View style={[styles.infoRow, { borderBottomColor: theme.hairline }]}>
          <Text style={[styles.infoLabel, { color: theme.muted }]}>Pairing Code</Text>
          <Text style={[styles.infoValueMono, { color: theme.primary }]}>{identity?.pairingCode || '—'}</Text>
        </View>

        <View style={[styles.infoRow, { borderBottomColor: 'transparent' }]}>
          <Text style={[styles.infoLabel, { color: theme.muted }]}>Public Key (Ed25519/Noise)</Text>
          <Text
            style={[styles.infoValueMono, { color: theme.primary }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {identity?.publicKey || status?.publicKey || '—'}
          </Text>
        </View>
      </Card>

      {/* Network & Protocol Transport */}
      <SectionHeader title="Network Transport" />
      <Card style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <View style={styles.cardTitleRow}>
          <Server size={16} color={theme.accent} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>Protocol Subsystem</Text>
        </View>

        <View style={[styles.infoRow, { borderBottomColor: theme.hairline }]}>
          <Text style={[styles.infoLabel, { color: theme.muted }]}>Discovery Subsystem</Text>
          <Pill label="Hyperswarm DHT" color={theme.accent} />
        </View>

        <View style={[styles.infoRow, { borderBottomColor: theme.hairline }]}>
          <Text style={[styles.infoLabel, { color: theme.muted }]}>DHT Bootstrap State</Text>
          <Pill
            label={status?.dhtReady ? 'Bootstrapped' : 'Connecting'}
            color={status?.dhtReady ? theme.success : theme.warning}
            dot
          />
        </View>

        <View style={[styles.infoRow, { borderBottomColor: theme.hairline }]}>
          <Text style={[styles.infoLabel, { color: theme.muted }]}>Peer Discovery Rate</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>
            {status?.peerCount ? `${status.peerCount} Active Nodes` : 'Listening on DHT…'}
          </Text>
        </View>

        <View style={[styles.infoRow, { borderBottomColor: 'transparent' }]}>
          <Text style={[styles.infoLabel, { color: theme.muted }]}>Relay Connection</Text>
          <Pill
            label={status?.relayConnected ? 'Relay Active' : 'Direct P2P'}
            color={status?.relayConnected ? theme.purple : theme.primary}
          />
        </View>
      </Card>

      {/* Storage & Environment Paths */}
      <SectionHeader title="Storage & Environment" />
      <Card style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <View style={styles.cardTitleRow}>
          <HardDrive size={16} color={theme.purple} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>Filesystem Layout</Text>
        </View>

        <View style={[styles.infoRow, { borderBottomColor: theme.hairline }]}>
          <Text style={[styles.infoLabel, { color: theme.muted }]}>Downloads Inbound</Text>
          <Text
            style={[styles.infoValueMono, { color: theme.primary }]}
            numberOfLines={1}
            ellipsizeMode="head"
          >
            {paths?.downloads || '/storage/emulated/0/Download'}
          </Text>
        </View>

        <View style={[styles.infoRow, { borderBottomColor: 'transparent' }]}>
          <Text style={[styles.infoLabel, { color: theme.muted }]}>Engine Core DB</Text>
          <Text
            style={[styles.infoValueMono, { color: theme.primary }]}
            numberOfLines={1}
            ellipsizeMode="head"
          >
            {paths?.appData || paths?.downloads || 'Internal Engine Store'}
          </Text>
        </View>
      </Card>

      {/* Test / Trigger Actions */}
      <Card style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <View style={styles.cardTitleRow}>
          <Cpu size={16} color={theme.primary} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>Engine Telemetry Ping</Text>
        </View>

        <Btn
          label={loading ? 'Probing Hyperswarm…' : 'Ping Hyperswarm DHT'}
          icon={Zap}
          variant="primary"
          onPress={handleRefresh}
          loading={loading}
        />

        {pingResult && (
          <View style={[styles.pingResultBox, { backgroundColor: theme.primarySoft, borderColor: theme.primary + '35' }]}>
            <Text style={[styles.pingResultText, { color: theme.primary }]}>{pingResult}</Text>
          </View>
        )}
      </Card>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 90,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  card: {
    padding: 16,
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  infoValue: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  infoValueMono: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: fonts.mono,
    maxWidth: 190,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  pingResultBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  pingResultText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: fonts.mono,
  },
})
