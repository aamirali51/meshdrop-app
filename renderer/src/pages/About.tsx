import { useState, useEffect } from 'react'
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
  Server,
  Heart,
  Copy,
  Check,
  QrCode
} from 'lucide-react'
import QRCode from 'qrcode'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'

const BITCOIN_ADDRESS = '12bNXZEg6vDtJZUMdauhkvUqg92UPeWJfs'

function BitcoinIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none'>
      <circle cx='12' cy='12' r='12' fill='#F7931A' />
      <path
        d='M16.667 9.872c.24-1.605-.983-2.468-2.656-3.044l.542-2.176-1.325-.33-.528 2.118c-.348-.087-.706-.17-1.064-.251l.531-2.133-1.324-.33-.543 2.178c-.288-.066-.57-.13-.844-.198l.002-.008-1.828-.456-.353 1.416s.983.225.962.239c.537.134.634.49.618.772l-.619 2.482c.037.01.085.023.138.044-.044-.011-.092-.023-.138-.035l-.868 3.48c-.066.163-.233.407-.61.314.013.018-.962-.24-.962-.24l-.659 1.52 1.725.43c.321.08.636.163.946.242l-.548 2.203 1.324.33.543-2.18c.362.098.713.189 1.057.274l-.54 2.167 1.325.33.548-2.196c2.261.428 3.961.255 4.676-1.789.576-1.646-.029-2.595-1.22-3.214.867-.2 1.52-.77 1.695-1.95zm-3.033 4.254c-.41 1.646-3.184.757-4.085.533l.729-2.922c.901.224 3.784.67 3.356 2.389zm.41-4.275c-.374 1.5-2.684.738-3.434.551l.661-2.65c.75.187 3.16.536 2.773 2.099z'
        fill='#FFFFFF'
      />
    </svg>
  )
}

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
  const url = 'https://github.com/aamirali51/meshdrop-app'
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
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    QRCode.toDataURL(BITCOIN_ADDRESS, {
      margin: 1,
      width: 200,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => {})
  }, [])

  const handleCopyBtc = async () => {
    try {
      if (window.bridge?.writeClipboard) {
        await window.bridge.writeClipboard({ text: BITCOIN_ADDRESS })
      } else if (navigator?.clipboard) {
        await navigator.clipboard.writeText(BITCOIN_ADDRESS)
      }
      setCopied(true)
      toast.success('Address Copied', 'Bitcoin donation address copied to clipboard!')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Copy Failed', 'Could not access clipboard')
    }
  }

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

      {/* Support & Bitcoin Donation Card */}
      <Card className='glass-card overflow-hidden border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card/50 to-orange-500/5 relative p-6 shadow-lg'>
        <div className='absolute -right-16 -bottom-16 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl' />
        <div className='relative space-y-4'>
          <div className='flex flex-col md:flex-row md:items-center justify-between gap-3'>
            <div className='flex items-center gap-3'>
              <div className='flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 shadow-sm shrink-0'>
                <BitcoinIcon className='h-6 w-6' />
              </div>
              <div>
                <h3 className='text-base font-black text-foreground flex items-center gap-2'>
                  Support MeshDrop Development
                  <Heart className='h-4 w-4 text-rose-500 fill-rose-500 animate-pulse' />
                </h3>
                <p className='text-xs text-muted-foreground'>
                  100% Free · Open Source · No Ads · Direct Peer-to-Peer
                </p>
              </div>
            </div>
            <span className='self-start md:self-auto rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 font-mono'>
              Network: Bitcoin (BTC)
            </span>
          </div>

          <p className='text-xs text-muted-foreground leading-relaxed'>
            MeshDrop is built with love for decentralized, private communication. If MeshDrop helps you seamlessly transfer files or continuously sync folders across your devices without cloud subscriptions, consider sending a Bitcoin tip to support ongoing maintenance and new features. Every satoshi is deeply appreciated!
          </p>

          <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1'>
            <div
              onClick={handleCopyBtc}
              className='flex-1 flex items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-background/80 px-3.5 py-2.5 shadow-xs cursor-pointer hover:border-amber-500/50 hover:bg-background transition-all group'
              title='Click to copy Bitcoin address'
            >
              <span className='font-mono text-xs font-bold text-foreground truncate select-all'>
                {BITCOIN_ADDRESS}
              </span>
              <Copy className='h-3.5 w-3.5 text-muted-foreground group-hover:text-amber-500 shrink-0 transition-colors' />
            </div>

            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                className='h-10 text-xs font-bold gap-1.5 border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-500'
                onClick={handleCopyBtc}
              >
                {copied ? <Check className='h-4 w-4 text-emerald-500' /> : <Copy className='h-4 w-4' />}
                {copied ? 'Copied!' : 'Copy BTC Address'}
              </Button>

              <Button
                variant='ghost'
                className='h-10 text-xs font-bold gap-1.5 text-muted-foreground hover:text-foreground'
                onClick={() => setShowQr(!showQr)}
              >
                <QrCode className='h-4 w-4 text-amber-500' />
                {showQr ? 'Hide QR' : 'Show QR'}
              </Button>
            </div>
          </div>

          {/* Expandable QR Code Frame */}
          {showQr && qrDataUrl && (
            <div className='flex flex-col items-center justify-center gap-2.5 p-5 rounded-2xl border border-amber-500/20 bg-background/90 text-center transition-all animate-in fade-in zoom-in-95 duration-200'>
              <div className='p-3 bg-white rounded-2xl shadow-md border border-border/40'>
                <img
                  src={qrDataUrl}
                  alt='Bitcoin Donation QR Code'
                  className='h-44 w-44 rounded-lg'
                />
              </div>
              <p className='text-[11px] font-semibold text-muted-foreground'>
                Scan with any Bitcoin or Lightning-enabled wallet to donate
              </p>
            </div>
          )}
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
            <span>github.com/aamirali51/meshdrop-app</span>
            <ExternalLink className='h-3 w-3' />
          </button>
        </div>
      </Card>
    </div>
  )
}
