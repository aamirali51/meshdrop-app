import { useState, useEffect } from 'react'
import { Waypoints, ShieldCheck, Cpu, FileText, Network, KeyRound, Layers, Workflow, Database, Lock, ExternalLink, Server, Heart, Copy, Check, QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import { Card, CardContent } from '@/ui/primitives/Card'
import { Button } from '@/ui/primitives/Button'
import { Badge } from '@/ui/primitives/Badge'
import { useToast } from '@/hooks/useToast'
import { appVersion, hostVersionInfo, isWeb, openExternal, writeClipboard } from '@/lib/capabilities'

const BITCOIN_ADDRESS = '12bNXZEg6vDtJZUMdauhkvUqg92UPeWJfs'

function BitcoinIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#F7931A" />
      <path
        d="M16.667 9.872c.24-1.605-.983-2.468-2.656-3.044l.542-2.176-1.325-.33-.528 2.118c-.348-.087-.706-.17-1.064-.251l.531-2.133-1.324-.33-.543 2.178c-.288-.066-.57-.13-.844-.198l.002-.008-1.828-.456-.353 1.416s.983.225.962.239c.537.134.634.49.618.772l-.619 2.482c.037.01.085.023.138.044-.044-.011-.092-.023-.138-.035l-.868 3.48c-.066.163-.233.407-.61.314.013.018-.962-.24-.962-.24l-.659 1.52 1.725.43c.321.08.636.163.946.242l-.548 2.203 1.324.33.543-2.18c.362.098.713.189 1.057.274l-.54 2.167 1.325.33.548-2.196c2.261.428 3.961.255 4.676-1.789.576-1.646-.029-2.595-1.22-3.214.867-.2 1.52-.77 1.695-1.95zm-3.033 4.254c-.41 1.646-3.184.757-4.085.533l.729-2.922c.901.224 3.784.67 3.356 2.389zm.41-4.275c-.374 1.5-2.684.738-3.434.551l.661-2.65c.75.187 3.16.536 2.773 2.099z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

function GithubIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  )
}

const HOLEPUNCH_STACK: { name: string; version: string; blurb: string; icon: React.ReactNode }[] = [
  { name: 'Hyperswarm', version: '4.x', blurb: 'Encrypted peer discovery and connections — devices find each other directly.', icon: <Network className="h-4 w-4" /> },
  { name: 'HyperDHT', version: '6.x', blurb: 'Serverless distributed hash table with NAT hole-punching — no servers to run.', icon: <Server className="h-4 w-4" /> },
  { name: 'Hypercore', version: '11.x', blurb: 'Append-only, cryptographically verifiable logs — the data backbone.', icon: <Layers className="h-4 w-4" /> },
  { name: 'Corestore', version: '7.x', blurb: 'Local storage engine that manages your hypercores on disk.', icon: <Database className="h-4 w-4" /> },
  { name: 'Hyperbee', version: '2.x', blurb: 'Key-value database built on hypercore — fast, verified reads.', icon: <KeyRound className="h-4 w-4" /> },
  { name: 'Secret Stream', version: '6.x', blurb: 'End-to-end encrypted transport (Noise protocol) for every connection.', icon: <Lock className="h-4 w-4" /> },
  { name: 'Protomux', version: '3.x', blurb: 'Multiplexes many channels over one connection — chat, files, signals.', icon: <Workflow className="h-4 w-4" /> },
]

function openHolepunch() {
  openExternal('https://holepunch.io')
}
function openGithub() {
  openExternal('https://github.com/aamirali51/meshdrop-app')
}

function StandaloneNote() {
  const [standalone, setStandalone] = useState(false)
  useEffect(() => {
    try {
      const m = window.matchMedia('(display-mode: standalone)').matches
      const ios = (window.navigator as unknown as { standalone?: boolean }).standalone
      setStandalone(!!m || !!ios)
    } catch {}
  }, [])
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="space-y-2 p-4 text-xs leading-relaxed">
        <p className="font-bold text-foreground">Web & standalone mode</p>
        <p className="text-muted-foreground">
          When installed, MeshDrop runs in its own window — no browser address bar, its own taskbar icon, and offline shell caching for the UI. Your data and pairing still live on the host; the installed app is a standalone view onto the same host session (open it from the launcher so the one-time token is present).
        </p>
        <p className="text-[11px] text-muted-foreground/80">
          {standalone ? 'You are running in standalone (installed) mode.' : 'Install from the “Install MeshDrop” button in the top bar when your browser offers it, or via the browser menu → Install / Add to Home Screen.'}
        </p>
      </CardContent>
    </Card>
  )
}

const APP_VERSION = appVersion()

export function About() {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [hostInfo, setHostInfo] = useState<{ engineVersion?: string; protocolVersion?: string } | null>(null)

  useEffect(() => {
    if (isWeb) hostVersionInfo().then(setHostInfo).catch(() => {})
  }, [])

  useEffect(() => {
    QRCode.toDataURL(BITCOIN_ADDRESS, { margin: 1, width: 200, color: { dark: '#000000', light: '#FFFFFF' } })
      .then((url) => setQrDataUrl(url))
      .catch(() => {})
  }, [])

  const handleCopyBtc = async () => {
    try {
      await writeClipboard(BITCOIN_ADDRESS)
      setCopied(true)
      toast.success('Address Copied', 'Bitcoin donation address copied to clipboard!')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Copy Failed', 'Could not access clipboard')
    }
  }

  const uiVersion = APP_VERSION ? `v${APP_VERSION}` : null
  const engineVersion = hostInfo?.engineVersion ? `v${hostInfo.engineVersion}` : null

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-border/50">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-md">
              <Waypoints className="h-8 w-8" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-foreground">MeshDrop</h2>
                {uiVersion && <Badge variant="info" className="font-mono">UI {uiVersion}</Badge>}
                {isWeb && engineVersion && <Badge variant="secondary" className="font-mono">Engine {engineVersion}</Badge>}
                {!uiVersion && !engineVersion && <Badge variant="secondary">Open source</Badge>}
              </div>
              <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
                Send files directly between your devices — no accounts, no cloud, no middlemen. End-to-end encrypted, peer-to-peer.
              </p>
              <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>
                  Developed by <span className="font-bold text-foreground">Aamir Abdullah</span>
                </span>
                <span className="text-muted-foreground/50">·</span>
                <span>MIT</span>
                <button onClick={openGithub} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                  <GithubIcon className="h-3.5 w-3.5" />
                  GitHub <ExternalLink className="h-3 w-3" />
                </button>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">UI version</p>
              <p className="mt-1 font-mono text-sm font-bold text-foreground">{uiVersion ?? (isWeb ? 'Browser' : '—')}</p>
              <p className="text-[11px] text-muted-foreground">Renderer bundle</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Engine version</p>
              <p className="mt-1 font-mono text-sm font-bold text-foreground">{engineVersion ?? (isWeb ? 'Loading…' : uiVersion ?? '—')}</p>
              <p className="text-[11px] text-muted-foreground">@mesh/core · host</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Protocol</p>
              <p className="mt-1 font-mono text-sm font-bold text-foreground">{hostInfo?.protocolVersion ? `v${hostInfo.protocolVersion}` : '—'}</p>
              <p className="text-[11px] text-muted-foreground">Wire compatibility</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isWeb && <StandaloneNote />}

      <Card className="overflow-hidden border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-orange-500/5">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/15 text-amber-600 shadow-sm">
                <BitcoinIcon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="flex items-center gap-2 text-sm font-black text-foreground">
                  Support MeshDrop <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
                </h3>
                <p className="text-xs text-muted-foreground">100% free · Open source · No ads · Direct P2P</p>
              </div>
            </div>
            <Badge variant="warning" className="w-fit">Bitcoin (BTC)</Badge>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            If MeshDrop helps you move files and sync folders without cloud subscriptions, consider a Bitcoin tip. Every satoshi helps maintain the project.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              onClick={handleCopyBtc}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-background px-3.5 py-2.5 text-left shadow-xs transition-colors hover:border-amber-500/50 hover:bg-background"
              title="Click to copy Bitcoin address"
            >
              <span className="min-w-0 truncate font-mono text-xs font-bold text-foreground">{BITCOIN_ADDRESS}</span>
              <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-10 gap-1.5 border-amber-500/30 text-xs font-bold hover:bg-amber-500/10 hover:text-amber-600" onClick={handleCopyBtc}>
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy address'}
              </Button>
              <Button variant="ghost" size="sm" className="h-10 gap-1.5 text-xs font-bold" onClick={() => setShowQr((v) => !v)}>
                <QrCode className="h-4 w-4 text-amber-500" />
                {showQr ? 'Hide QR' : 'Show QR'}
              </Button>
            </div>
          </div>
          {showQr && qrDataUrl && (
            <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-amber-500/20 bg-background p-5 text-center">
              <div className="rounded-2xl border border-border/40 bg-white p-3 shadow-md">
                <img src={qrDataUrl} alt="Bitcoin donation QR code" className="h-44 w-44 rounded-lg" />
              </div>
              <p className="text-[11px] font-semibold text-muted-foreground">Scan with any Bitcoin wallet</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Network className="h-4 w-4 text-meshdrop-cyan" />
              Powered by Holepunch
            </h3>
            <Badge variant="info">No servers · No accounts · No telemetry</Badge>
          </div>
          <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
            Built on the{' '}
            <button onClick={openHolepunch} className="inline-flex items-center gap-0.5 font-bold text-meshdrop-cyan hover:underline">
              Holepunch <ExternalLink className="h-3 w-3" />
            </button>{' '}
            peer-to-peer ecosystem. Every transfer runs over this stack — no servers to rent, no accounts, no data at rest elsewhere.
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {HOLEPUNCH_STACK.map((s) => (
              <div key={s.name} className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-card p-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-meshdrop-cyan/25 bg-meshdrop-cyan/10 text-meshdrop-cyan">
                  {s.icon}
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">{s.name}</span>
                    <span className="font-mono text-[10px] font-bold text-muted-foreground/70">{s.version}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{s.blurb}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            How it fits: HyperDHT + Hyperswarm discover and connect devices (hole-punching through NATs), Secret Stream encrypts every connection end-to-end,
            Hypercore/Corestore/Hyperbee store data locally, and Protomux carries file offers, transfer controls, and pairing signals over one multiplexed
            connection.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5 sm:p-6 text-xs">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Cpu className="h-4 w-4 text-primary" />
            Runtime
          </h3>
          <div className="grid grid-cols-1 gap-3 font-mono sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-3 py-3">
              <span className="text-muted-foreground">Desktop</span>
              <span className="font-bold text-foreground">Electron 40.x</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-3 py-3">
              <span className="text-muted-foreground">Security</span>
              <span className="font-bold text-status-online">Noise_XX_25519</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-3 py-3">
              <span className="text-muted-foreground">Integrity</span>
              <span className="font-bold text-status-online">SHA-256</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-3 py-3">
              <span className="text-muted-foreground">Engine</span>
              <span className="font-bold text-foreground">@mesh/core</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5 sm:p-6 text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-bold text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Open source license
            </span>
            <span className="font-mono font-semibold text-muted-foreground">MIT</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            MeshDrop and <span className="font-mono text-foreground">@mesh/core</span> are MIT-licensed. The MeshDrop name and logo are protected by the trademark
            policy.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <FileText className="h-3 w-3" />
              Engine: @mesh/core · No telemetry · No accounts
            </span>
            <button onClick={openGithub} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline">
              <GithubIcon className="h-3.5 w-3.5" />
              github.com/aamirali51/meshdrop-app
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
