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
  PulseIndicator,
} from '../components'
import { theme, fonts } from '../theme'

export function Diagnostics({ identity }: { identity?: any }) {
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
      const lat = s?.avgLatencyMs != null ? `${s.avgLatencyMs}ms` : '--'
      setPingResult(`Swarm telemetry · ${peers} peer(s) · ${lat} avg latency`)
    } catch {
      setPingResult('Swarm telemetry unavailable')
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.flex1}>
          <Text style={styles.title}>Network Sentinel</Text>
          <Text style={styles.subtitle}>
            Hyperswarm DHT, UDX transport, and Hypercore storage telemetry
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={refresh}
          disabled={loading}
          activeOpacity={0.7}
        >
          <RefreshCw size={15} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Overview Stat Grid */}
      <View style={styles.statGrid}>
        <StatCard
          label="Swarm Peers"
          value={status?.peerCount || 0}
          icon={Radio}
          color={theme.success}
        />
        <StatCard
          label="Engine Status"
          value={
            status?.ready
              ? 'Ready'
              : status === null
              ? 'Booting…'
              : status?.connected
              ? 'Mesh Connected'
              : 'Starting'
          }
          icon={Activity}
          color={theme.primary}
        />
        <StatCard
          label="Protocol"
          value="v2.0"
          icon={Cpu}
          color={theme.accent}
        />
      </View>

      {/* Node Cryptographic Identity Card */}
      <Card glow style={styles.card}>
        <View style={styles.cardTitleRow}>
          <ShieldCheck size={18} color={theme.primary} />
          <Text style={styles.cardTitle}>Cryptographic Node Identity</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Node Name</Text>
          <Text style={styles.infoValue}>{identity?.name || 'Local Mesh Node'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Device ID</Text>
          <Text style={styles.infoValueMono}>
            {identity?.id ? `${identity.id.slice(0, 16)}…` : 'Generating…'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Noise Public Key</Text>
          <Text style={styles.infoValueMono}>
            {identity?.publicKey ? `${identity.publicKey.slice(0, 16)}…` : 'Generating…'}
          </Text>
        </View>
      </Card>

      {/* Hyperswarm DHT Telemetry Card */}
      <Card style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Radio size={18} color={theme.primary} />
          <Text style={styles.cardTitle}>Hyperswarm DHT Swarm</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Transport Layer</Text>
          <Pill label="UDX Encrypted Sockets" color={theme.primary} dot />
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>NAT Traversal</Text>
          <Text style={styles.infoValue}>
            {status?.relayStatus === 'Enabled' ? 'DHT Relay assisted' : 'Direct UDP holepunching'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Avg Latency</Text>
          <Text style={styles.infoValueMono}>
            {status?.avgLatencyMs != null ? `${status.avgLatencyMs}ms` : '--'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Packet Loss</Text>
          <Text style={styles.infoValueMono}>
            {status?.packetLossPercent != null ? `${status.packetLossPercent}%` : '--'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Relay Status</Text>
          <Text style={styles.infoValue}>
            {status?.relayStatus === 'Enabled' ? 'Enabled' : status ? status.relayStatus : '--'}
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <Btn
            label="Refresh Swarm Stats"
            icon={Zap}
            variant="primary"
            size="sm"
            onPress={handleRefresh}
            style={styles.flex1}
          />
        </View>

        {pingResult && (
          <View style={styles.pingResultBox}>
            <Text style={styles.pingResultText}>{pingResult}</Text>
          </View>
        )}
      </Card>

      {/* Local Storage System Card */}
      <Card style={styles.card}>
        <View style={styles.cardTitleRow}>
          <HardDrive size={18} color={theme.success} />
          <Text style={styles.cardTitle}>Hypercore Storage Matrix</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Storage Root</Text>
          <Text style={styles.infoValueMono} numberOfLines={1}>
            {paths?.userData || 'Internal Mesh DB'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Downloads Destination</Text>
          <Text style={styles.infoValueMono} numberOfLines={1}>
            {paths?.downloads || 'Device Storage/Downloads'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Integrity Protocol</Text>
          <Text style={styles.infoValue}>Hypercore Merkle Verification</Text>
        </View>
      </Card>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.2)',
  },
  statGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  card: {
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    color: theme.text,
    fontSize: 14.5,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: theme.hairline,
  },
  infoLabel: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  infoValue: {
    color: theme.text,
    fontSize: 12.5,
    fontWeight: '800',
  },
  infoValueMono: {
    color: theme.primary,
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
    backgroundColor: theme.primarySoft,
    borderColor: 'rgba(79, 70, 229, 0.25)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  pingResultText: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: fonts.mono,
  },
})
