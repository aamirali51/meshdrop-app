import {
  Waypoints,
  ShieldCheck,
  Cpu,
  FileText,
  Network,
  KeyRound,
  Layers,
  Workflow,
  Database,
  Lock,
  ExternalLink,
  Server
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

function GithubIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <path d='M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4' />
      <path d='M9 18c-4.51 2-5-2-7-2' />
    </svg>
  )
}

// The Holepunch stack this app is built on (ground truth: core/package.json).
const HOLEPUNCH_STACK: { name: string; version: string; blurb: string; icon: React.ReactNode }[] = [
  {
    name: 'Hyperswarm',
    version: '4.x',
    blurb: 'Encrypted peer discovery and connections — devices find each other directly.',
    icon: <Network className='h-4 w-4' />
  },
  {
    name: 'HyperDHT',
    version: '6.x',
    blurb: 'Serverless distributed hash table with NAT hole-punching — no servers to run.',
    icon: <Server className='h-4 w-4' />
  },
  {
    name: 'Hypercore',
    version: '11.x',
    blurb: 'Append-only, cryptographically verifiable logs — the data backbone.',
    icon: <Layers className='h-4 w-4' />
  },
  {
    name: 'Corestore',
    version: '7.x',
    blurb: 'Local storage engine that manages your hypercores on disk.',
    icon: <Database className='h-4 w-4' />
  },
  {
    name: 'Hyperbee',
    version: '2.x',
    blurb: 'Key-value database built on hypercore — fast, verified reads.',
    icon: <KeyRound className='h-4 w-4' />
  },
  {
    name: 'Secret Stream',
    version: '6.x',
    blurb: 'End-to-end encrypted transport (Noise protocol) for every connection.',
    icon: <Lock className='h-4 w-4' />
  },
  {
    name: 'Protomux',
    version: '3.x',
    blurb: 'Multiplexes many channels over one connection — chat, files, signals.',
    icon: <Workflow className='h-4 w-4' />
  }
]

function openHolepunch() {
  if (window.bridge?.openExternal) {
    window.bridge.openExternal('https://holepunch.io')
  }
}

function openGithub() {
  const url = 'https://github.com/aamirali51/MeshDesk'
  if (window.bridge?.openExternal) {
    window.bridge.openExternal(url)
  } else if (typeof window !== 'undefined') {
    window.open(url, '_blank')
  }
}

// Read the live app version from the packaged build (window.bridge.pkg returns
// the real package.json) so the About page never goes stale between releases.
// Falls back to a plain "Open Source" badge in a bare browser (no Electron).
const APP_VERSION = (() => {
  try {
    const v = typeof window !== 'undefined' && window.bridge?.pkg?.()?.version
    return typeof v === 'string' && v ? v : ''
  } catch {
    return ''
  }
})()

export function About() {
  return (
    <div className='space-y-6 pb-12'>
      {/* Product Hero */}
      <Card className='glass-card overflow-hidden border-hairline/10 relative glow-primary p-6'>
        <div className='absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl' />
        <div className='relative flex flex-col md:flex-row items-center gap-6'>
          <div className='flex h-20 w-20 items-center justify-center rounded-3xl gradient-brand text-white shadow-xl shrink-0'>
            <Waypoints className='h-10 w-10' />
          </div>
          <div className='space-y-1.5 text-center md:text-left'>
            <div className='flex flex-wrap items-center justify-center md:justify-start gap-2'>
              <h2 className='text-2xl font-black text-foreground'>MeshDrop</h2>
              <span className='rounded-md bg-primary/20 px-2 py-0.5 text-xs font-mono font-bold text-primary border border-primary/30'>
                {APP_VERSION ? `v${APP_VERSION}` : 'Open Source'}
              </span>
              <button
                onClick={openGithub}
                className='inline-flex items-center gap-1.5 rounded-md bg-card/80 hover:bg-card border border-hairline/20 px-2.5 py-0.5 text-xs font-semibold text-foreground hover:text-primary transition-colors cursor-pointer shadow-xs'
                title='View source code on GitHub'
              >
                <GithubIcon className='h-3.5 w-3.5 text-primary' />
                <span>GitHub</span>
                <ExternalLink className='h-3 w-3 text-muted-foreground' />
              </button>
            </div>
            <p className='text-xs text-muted-foreground leading-relaxed'>
              Send files directly between your devices — no accounts, no cloud, no middlemen.
              Everything is end-to-end encrypted and travels peer-to-peer over the public network.
            </p>
            <p className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
              Developed by <span className='font-bold text-foreground'>Aamir Abdullah</span>
              <span className='text-muted-foreground/50'>·</span> Open source (MIT)
            </p>
          </div>
        </div>
      </Card>

      {/* Powered by Holepunch */}
      <Card className='glass-card overflow-hidden border-hairline/10 relative'>
        <div className='absolute -left-20 -top-20 h-56 w-56 rounded-full bg-meshdrop-cyan/10 blur-3xl' />
        <CardContent className='relative p-6 space-y-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='space-y-1'>
              <h3 className='text-sm font-bold text-foreground flex items-center gap-2'>
                <Network className='h-4 w-4 text-meshdrop-cyan' />
                Powered by Holepunch
              </h3>
              <p className='text-[11px] text-muted-foreground leading-relaxed max-w-xl'>
                MeshDrop is built on the{' '}
                <button
                  onClick={openHolepunch}
                  className='inline-flex items-center gap-0.5 font-bold text-meshdrop-cyan hover:underline'
                  title='Open holepunch.io'
                >
                  Holepunch <ExternalLink className='h-3 w-3' />
                </button>{' '}
                peer-to-peer ecosystem — the same open-source infrastructure used by apps like
                Keet. Every transfer runs over this stack, so there are no servers to rent, no
                accounts to create, and no data at rest on anyone else's machine.
              </p>
            </div>
            <span className='rounded-full border border-meshdrop-cyan/30 bg-meshdrop-cyan/10 px-3 py-1 text-[10px] font-mono font-bold text-meshdrop-cyan'>
              No servers · No accounts · No telemetry
            </span>
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5'>
            {HOLEPUNCH_STACK.map((s) => (
              <div
                key={s.name}
                className='flex items-start gap-2.5 rounded-xl border border-hairline/10 bg-card/40 p-3'
              >
                <div className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-meshdrop-cyan/25 bg-meshdrop-cyan/10 text-meshdrop-cyan'>
                  {s.icon}
                </div>
                <div className='min-w-0 space-y-0.5'>
                  <div className='flex items-center gap-2'>
                    <span className='text-xs font-bold text-foreground'>{s.name}</span>
                    <span className='font-mono text-[9px] font-bold text-muted-foreground/70'>
                      {s.version}
                    </span>
                  </div>
                  <p className='text-[10px] text-muted-foreground leading-relaxed'>{s.blurb}</p>
                </div>
              </div>
            ))}
          </div>

          <p className='text-[10px] text-muted-foreground/70 leading-relaxed'>
            How it fits together: HyperDHT + Hyperswarm discover and connect devices (punching
            through NATs where possible), Secret Stream encrypts every connection end-to-end,
            Hypercore/Corestore/Hyperbee store data and metadata locally, and Protomux carries
            file offers, transfer controls, and pairing signals over a single multiplexed
            connection.
          </p>
        </CardContent>
      </Card>

      {/* Core Runtime Stack */}
      <Card className='glass-card border-hairline/10'>
        <CardContent className='p-6 space-y-4 text-xs'>
          <h3 className='text-sm font-bold text-foreground flex items-center gap-2'>
            <Cpu className='h-4 w-4 text-primary' />
            Runtime
          </h3>

          <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 font-mono'>
            <div className='rounded-xl border border-hairline/10 bg-card/40 p-3 flex justify-between items-center'>
              <span className='text-muted-foreground'>Desktop Framework</span>
              <span className='font-bold text-foreground'>Electron 40.x</span>
            </div>
            <div className='rounded-xl border border-hairline/10 bg-card/40 p-3 flex justify-between items-center'>
              <span className='text-muted-foreground'>Cryptographic Security</span>
              <span className='font-bold text-status-online'>Noise_XX_25519</span>
            </div>
            <div className='rounded-xl border border-hairline/10 bg-card/40 p-3 flex justify-between items-center'>
              <span className='text-muted-foreground'>Transfer Integrity</span>
              <span className='font-bold text-status-online'>SHA-256 manifests</span>
            </div>
            <div className='rounded-xl border border-hairline/10 bg-card/40 p-3 flex justify-between items-center'>
              <span className='text-muted-foreground'>Engine</span>
              <span className='font-bold text-foreground'>@mesh/core</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* License & Information */}
      <Card className='glass-card border-hairline/10 p-6 space-y-3 text-xs'>
        <div className='flex items-center justify-between'>
          <span className='font-bold text-foreground flex items-center gap-2'>
            <ShieldCheck className='h-4 w-4 text-primary' />
            Open Source License
          </span>
          <span className='font-mono text-muted-foreground font-semibold'>MIT</span>
        </div>
        <p className='text-muted-foreground text-[11px] leading-relaxed'>
          MeshDrop is open-source software under the MIT License. The peer-to-peer engine (
          <span className='font-mono text-foreground'>@mesh/core</span>) powers both MeshDrop
          Desktop and MeshDrop Mobile. The MeshDrop name and logo are protected by the trademark
          policy.
        </p>
        <div className='flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-hairline/10'>
          <div className='flex items-center gap-1.5 text-[10px] text-muted-foreground'>
            <FileText className='h-3 w-3' />
            <span>Engine: @mesh/core · No telemetry · No accounts</span>
          </div>
          <button
            onClick={openGithub}
            className='inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline cursor-pointer'
            title='Open repository on GitHub'
          >
            <GithubIcon className='h-3.5 w-3.5' />
            <span>github.com/aamirali51/MeshDesk</span>
            <ExternalLink className='h-3 w-3' />
          </button>
        </div>
      </Card>
    </div>
  )
}
