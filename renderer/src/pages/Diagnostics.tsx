import {
  Activity,
  ShieldCheck,
  Wifi,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  Network,
  Cpu,
  HardDrive
} from 'lucide-react'
import { useApp } from '@/hooks/useAppState'
import { Card, CardContent } from '@/components/ui/card'
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

  const uptime = diagnostics.uptimeMs != null ? formatUptime(diagnostics.uptimeMs) : '—'
  const hasPeers = (diagnostics.connectedPeersCount ?? 0) > 0
  const isOnline = diagnostics.connected !== false

  return (
    <div className='space-y-6 pb-12'>
      <div>
        <h2 className='text-xl font-black text-foreground'>Network Diagnostics</h2>
        <p className='text-xs text-muted-foreground'>
          Live connection metrics for advanced troubleshooting.
        </p>
      </div>

      {!isOnline && (
        <div className='rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs'>
          <p className='font-bold text-amber-600 dark:text-amber-400'>Mesh is connecting…</p>
          <p className='text-muted-foreground mt-1'>Pair a device or check your network. Metrics below populate once peers connect.</p>
        </div>
      )}
      {!hasPeers && isOnline && (
        <div className='rounded-xl border border-border/40 bg-card/40 p-4 text-xs'>
          <p className='font-bold text-foreground'>No peers connected yet</p>
          <p className='text-muted-foreground mt-1'>Latency, packet loss and throughput appear once a device links.</p>
        </div>
      )}

      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <Card className='glass-card border-border/60'>
          <CardContent className='p-4 space-y-2'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-semibold text-muted-foreground'>Connection Mode</span>
              <ShieldCheck className='h-4 w-4 text-status-online' />
            </div>
            <p className='text-xl font-bold text-status-online'>{diagnostics.natType || '—'}</p>
            <p className='text-[11px] text-muted-foreground'>
              How your devices reach each other directly.
            </p>
          </CardContent>
        </Card>

        <Card className='glass-card border-border/60'>
          <CardContent className='p-4 space-y-2'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-semibold text-muted-foreground'>Connected Peers</span>
              <Wifi className='h-4 w-4 text-primary' />
            </div>
            <p className='text-xl font-mono font-bold text-primary'>
              {diagnostics.connectedPeersCount != null ? `${diagnostics.connectedPeersCount}` : '—'}
            </p>
            <p className='text-[11px] text-muted-foreground'>Devices currently connected to you.</p>
          </CardContent>
        </Card>

        <Card className='glass-card border-border/60'>
          <CardContent className='p-4 space-y-2'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-semibold text-muted-foreground'>
                Encryption Protocol
              </span>
              <Activity className='h-4 w-4 text-accent' />
            </div>
            <p className='text-sm font-mono font-bold text-accent truncate'>
              {diagnostics.noiseProtocol}
            </p>
            <p className='text-[11px] text-muted-foreground'>
              All connections are end-to-end encrypted.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className='glass-card border-border/60 p-6 space-y-3'>
        <h3 className='text-sm font-bold text-foreground flex items-center gap-2'>
          <Activity className='h-4 w-4 text-primary' />
          Live Metrics
        </h3>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-xs'>
          <div className='rounded-xl border border-border/40 bg-card/40 p-4 flex items-center justify-between'>
            <span className='text-muted-foreground'>Average Latency</span>
            <span className='font-mono font-bold text-foreground'>
              {diagnostics.avgLatencyMs != null ? `${diagnostics.avgLatencyMs} ms` : '—'}
            </span>
          </div>
          <div className='rounded-xl border border-border/40 bg-card/40 p-4 flex items-center justify-between'>
            <span className='text-muted-foreground'>Throughput</span>
            <span className='font-mono font-bold text-foreground'>
              {diagnostics.bandwidthMbps != null ? `${diagnostics.bandwidthMbps} Mbps` : '—'}
            </span>
          </div>
          <div className='rounded-xl border border-border/40 bg-card/40 p-4 flex items-center justify-between'>
            <span className='flex items-center gap-1 text-muted-foreground'>
              Packet Loss
              <span
                title='Approximated from PING/PONG success rate over the signaling channel'
                className='cursor-help rounded-full bg-muted/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60'
              >
                approx.
              </span>
            </span>
            <span className='font-mono font-bold text-foreground'>
              {diagnostics.packetLossPercent != null ? `${diagnostics.packetLossPercent} %` : '—'}
            </span>
          </div>
          <div className='rounded-xl border border-border/40 bg-card/40 p-4 flex items-center justify-between'>
            <span className='text-muted-foreground'>DHT Nodes</span>
            <span className='font-mono font-bold text-foreground flex items-center gap-1'>
              <Network className='h-3.5 w-3.5 text-purple-400' />
              {diagnostics.dhtNodes != null ? diagnostics.dhtNodes : '—'}
            </span>
          </div>
          <div className='rounded-xl border border-border/40 bg-card/40 p-4 flex items-center justify-between'>
            <span className='text-muted-foreground'>CPU Usage</span>
            <span className='font-mono font-bold text-foreground flex items-center gap-1'>
              <Cpu className='h-3.5 w-3.5 text-cyan-400' />
              {diagnostics.systemCpuUsage != null ? `${diagnostics.systemCpuUsage}%` : '—'}
            </span>
          </div>
          <div className='rounded-xl border border-border/40 bg-card/40 p-4 flex items-center justify-between'>
            <span className='text-muted-foreground'>Memory Usage</span>
            <span className='font-mono font-bold text-foreground flex items-center gap-1'>
              <HardDrive className='h-3.5 w-3.5 text-emerald-400' />
              {diagnostics.systemRamUsage != null ? `${diagnostics.systemRamUsage}%` : '—'}
            </span>
          </div>
          <div className='rounded-xl border border-border/40 bg-card/40 p-4 flex items-center justify-between'>
            <span className='text-muted-foreground'>Node Uptime</span>
            <span className='font-mono font-bold text-foreground'>{uptime}</span>
          </div>
          <div className='rounded-xl border border-border/40 bg-card/40 p-4 flex items-center justify-between'>
            <span className='text-muted-foreground'>Data Received</span>
            <span className='font-mono font-bold text-foreground flex items-center gap-1'>
              <ArrowDownToLine className='h-3.5 w-3.5 text-cyan-400' />
              {diagnostics.bytesReceived != null ? formatBytes(diagnostics.bytesReceived) : '—'}
            </span>
          </div>
          <div className='rounded-xl border border-border/40 bg-card/40 p-4 flex items-center justify-between'>
            <span className='text-muted-foreground'>Data Sent</span>
            <span className='font-mono font-bold text-foreground flex items-center gap-1'>
              <ArrowUpFromLine className='h-3.5 w-3.5 text-purple-400' />
              {diagnostics.bytesSent != null ? formatBytes(diagnostics.bytesSent) : '—'}
            </span>
          </div>
          <div className='rounded-xl border border-border/40 bg-card/40 p-4 flex items-center justify-between'>
            <span className='text-muted-foreground'>Relay</span>
            <span
              className={`font-mono font-bold flex items-center gap-1 ${
                diagnostics.relayStatus && diagnostics.relayStatus !== 'Disabled'
                  ? 'text-status-away'
                  : 'text-muted-foreground'
              }`}
            >
              <Clock className='h-3.5 w-3.5' />
              {diagnostics.relayStatus || 'Disabled'}
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
