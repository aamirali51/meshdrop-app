import { useState } from 'react'
import { Activity, ShieldCheck, Wifi, Network, Cpu, HardDrive, ChevronDown, EyeOff } from 'lucide-react'
import { useApp } from '@/hooks/useAppState'
import { Card, CardContent } from '@/ui/primitives/Card'
import { StatTile } from '@/ui/primitives/StatTile'
import { formatBytes } from '@/lib/format'

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function Diagnostics() {
  const { diagnostics } = useApp()
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const uptime = diagnostics.uptimeMs != null ? formatUptime(diagnostics.uptimeMs) : '—'
  const hasPeers = (diagnostics.connectedPeersCount ?? 0) > 0
  const isOnline = diagnostics.connected !== false
  const connectedLabel = diagnostics.connectedPeersCount != null ? String(diagnostics.connectedPeersCount) : '—'
  const reachability = diagnostics.natType || '—'
  const relayUsage =
    diagnostics.connectedPeersCount != null && (diagnostics as { relayedPeersCount?: number }).relayedPeersCount != null
      ? String((diagnostics as { relayedPeersCount?: number }).relayedPeersCount)
      : '—'
  const cpuMem =
    diagnostics.systemCpuUsage != null || diagnostics.systemRamUsage != null
      ? `${diagnostics.systemCpuUsage != null ? `${diagnostics.systemCpuUsage}% CPU` : '—'} · ${diagnostics.systemRamUsage != null ? `${diagnostics.systemRamUsage}% mem` : '—'}`
      : '—'

  return (
    <div className="space-y-5">
      {!isOnline && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs">
          <p className="font-bold text-amber-600 dark:text-amber-400">You are not connected yet</p>
          <p className="mt-1 text-muted-foreground">Pair a device or check your network. Metrics below populate once peers connect.</p>
        </div>
      )}
      {!hasPeers && isOnline && (
        <div className="rounded-xl border border-border/40 bg-card/40 p-4 text-xs">
          <p className="font-bold text-foreground">No devices connected yet</p>
          <p className="mt-1 text-muted-foreground">Latency, transfer speed and loss appear once a device links.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Connected peers" value={connectedLabel} hint="Devices currently connected to you." icon={<Wifi className="h-4 w-4" />} />
        <StatTile label="Network reachability" value={reachability} hint="How your devices reach each other directly." icon={<ShieldCheck className="h-4 w-4" />} />
        <StatTile label="Relay usage" value={relayUsage} hint="Peers currently relayed vs direct." icon={<Network className="h-4 w-4" />} />
        <StatTile label="CPU / Memory" value={cpuMem} hint={`Uptime ${uptime} · running time`} icon={<Cpu className="h-4 w-4" />} />
      </div>

      <Card>
        <CardContent className="space-y-3 p-5 sm:p-6">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Activity className="h-4 w-4 text-primary" />
            Live metrics
          </h3>
          <p className="text-xs text-muted-foreground">Plain-language snapshot; technical detail lives under Advanced. Polls every 4 seconds.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
            <Metric label="Average latency" value={diagnostics.avgLatencyMs != null ? `${diagnostics.avgLatencyMs} ms` : '—'} />
            <Metric label="Transfer speed" value={diagnostics.bandwidthMbps != null ? `${diagnostics.bandwidthMbps} Mbps` : '—'} />
            <Metric
              label="Packet loss"
              approx
              approxTitle="Estimated — how often devices answer network check-ins"
              value={diagnostics.packetLossPercent != null ? `${diagnostics.packetLossPercent} %` : '—'}
            />
            <Metric label="Known devices" value={diagnostics.dhtNodes != null ? String(diagnostics.dhtNodes) : '—'} icon={<Network className="h-3.5 w-3.5 text-violet-500" />} />
            <Metric label="CPU usage" value={diagnostics.systemCpuUsage != null ? `${diagnostics.systemCpuUsage}%` : '—'} icon={<Cpu className="h-3.5 w-3.5 text-cyan-500" />} />
            <Metric label="Memory usage" value={diagnostics.systemRamUsage != null ? `${diagnostics.systemRamUsage}%` : '—'} icon={<HardDrive className="h-3.5 w-3.5 text-emerald-500" />} />
            <Metric label="Running time" value={uptime} />
            <Metric label="Data received" value={diagnostics.bytesReceived != null ? formatBytes(diagnostics.bytesReceived) : '—'} />
            <Metric label="Data sent" value={diagnostics.bytesSent != null ? formatBytes(diagnostics.bytesSent) : '—'} />
          </div>

          <div className="border-t border-border/40 pt-3">
            <button
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {advancedOpen ? <EyeOff className="h-3.5 w-3.5" /> : <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />}
              {advancedOpen ? 'Hide advanced' : 'Advanced'}
            </button>
            {advancedOpen && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                  <p className="font-semibold text-foreground">Encryption</p>
                  <p className="mt-1 break-all font-mono text-muted-foreground">{diagnostics.noiseProtocol || '—'}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">All connections are end-to-end encrypted.</p>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                  <p className="font-semibold text-foreground">DHT / topics</p>
                  <p className="mt-1 font-mono text-muted-foreground">Known nodes: {diagnostics.dhtNodes ?? '—'}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Distributed hash table peers used for discovery.</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({
  label,
  value,
  icon,
  approx,
  approxTitle,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  approx?: boolean
  approxTitle?: string
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/40 px-4 py-3">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {label}
        {approx && (
          <span title={approxTitle} className="cursor-help rounded-full bg-muted/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
            approx.
          </span>
        )}
      </span>
      <span className="inline-flex items-center gap-1 font-mono text-sm font-bold text-foreground">
        {icon}
        {value}
      </span>
    </div>
  )
}
