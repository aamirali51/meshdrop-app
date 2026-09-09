import { useState } from 'react'
import { Network, Copy, Trash2, Plus, LogIn, X, Zap, Globe, Radio, Clock } from 'lucide-react'
import { useTunnels } from '@/hooks/useTunnels'
import { useDevices } from '@/hooks/useDevices'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/ui/primitives/Button'
import { Card, CardContent } from '@/ui/primitives/Card'
import { Input } from '@/ui/primitives/Input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/ui/primitives/Sheet'
import { EmptyState } from '@/ui/primitives/EmptyState'
import { Badge } from '@/ui/primitives/Badge'
import { ConfirmDialog } from '@/components/Modal'
import { cn } from '@/lib/utils'

function isValidPort(v: string) {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 65535
}

export function Tunnels() {
  const { tunnels, codes, createPairedTunnel, acceptTunnel, rejectTunnel, closeTunnel, createCode, joinCode, cancelCode, refresh } = useTunnels()
  const { devices } = useDevices()
  const { toast } = useToast()

  const [shareOpen, setShareOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [portInput, setPortInput] = useState('3000')
  const [nameInput, setNameInput] = useState('')
  const [udpMode, setUdpMode] = useState(false)
  const [pairedPeerId, setPairedPeerId] = useState<string>('')
  const [shareMode, setShareMode] = useState<'paired' | 'code'>('paired')
  const [expirationPreset, setExpirationPreset] = useState('30m')
  const [maxUses, setMaxUses] = useState('0')
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const [confirmCancelCode, setConfirmCancelCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleAccept = async (tunnelId: string) => {
    setBusy(true)
    try {
      await acceptTunnel(tunnelId)
      toast.success('Tunnel Accepted', tunnelId.slice(0, 8))
    } catch (e) {
      toast.error('Accept failed', (e as Error)?.message || '')
    } finally {
      setBusy(false)
    }
  }
  const handleReject = async (tunnelId: string) => {
    try {
      await rejectTunnel(tunnelId)
    } catch {}
  }

  const pairedDevices = devices.filter((d) => d.isTrusted && d.isOnline)

  const handlePairedShare = async () => {
    if (!isValidPort(portInput)) {
      toast.error('Invalid port', 'Use 1-65535')
      return
    }
    if (!pairedPeerId) {
      toast.error('Pick a device', 'Choose a paired, online peer.')
      return
    }
    setBusy(true)
    try {
      const { tunnelId } = await createPairedTunnel({ peerId: pairedPeerId, port: Number(portInput), name: nameInput.trim(), udp: udpMode })
      setShareOpen(false)
      toast.success('Tunnel Offered', `Waiting for ${pairedDevices.find((d) => d.id === pairedPeerId || d.publicKey === pairedPeerId)?.name || 'peer'} to accept (${tunnelId.slice(0, 8)}…)`)
    } catch (e) {
      toast.error('Share failed', (e as Error)?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleCodeShare = async () => {
    if (!isValidPort(portInput)) {
      toast.error('Invalid port', 'Use 1-65535')
      return
    }
    setBusy(true)
    try {
      const rec = await createCode({ port: Number(portInput), name: nameInput.trim(), udp: udpMode, expirationPreset, maxUses: Number(maxUses) || 0 })
      setShareOpen(false)
      toast.success('Tunnel Code Ready', `${rec.code} — expires ${expirationPreset}, share on any network, no pairing`)
      try {
        await navigator.clipboard.writeText(rec.code)
      } catch {}
    } catch (e) {
      toast.error('Create code failed', (e as Error)?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleJoin = async () => {
    const code = joinCodeInput.trim().toUpperCase()
    if (!code) {
      toast.error('Enter code', 'Paste a TUNNEL-XXXX-XXXX code')
      return
    }
    setBusy(true)
    try {
      await joinCode(code)
      setJoinOpen(false)
      setJoinCodeInput('')
      toast.success('Joining Tunnel', 'Looking for host on DHT — offer arrives when found')
    } catch (e) {
      toast.error('Join failed', (e as Error)?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const offered = tunnels.filter((t) => t.state === 'offered' && t.role === 'guest')
  const active = tunnels.filter((t) => t.state === 'open' || t.state === 'connecting')

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Copied', code)
    } catch {
      toast.error('Copy failed', code)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">Holesail-style port tunnels over the mesh — paired pipes (A↔B) + TUNNEL- code shares (any network, no pairing). TCP + UDP.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setJoinOpen(true)} className="gap-1.5">
            <LogIn className="h-4 w-4" />
            Join code
          </Button>
          <Button size="sm" onClick={() => setShareOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Share port
          </Button>
        </div>
      </div>

      {offered.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="space-y-3 pt-4">
            <div className="text-xs font-bold tracking-widest text-amber-600">INCOMING OFFERS · {offered.length}</div>
            {offered.map((t) => (
              <div key={t.tunnelId} className="flex items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">Port {t.port}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.peerName || t.peerId.slice(0, 8)} · {t.code ? `code ${t.code}` : 'paired'}
                    {t.udp ? ' · udp' : ''}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" disabled={busy} onClick={() => handleAccept(t.tunnelId)} className="gap-1.5">
                    <Zap className="h-4 w-4" />
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => handleReject(t.tunnelId)} className="gap-1.5">
                    <X className="h-4 w-4" />
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-widest text-muted-foreground">MY TUNNEL CODES</span>
              <Button variant="ghost" size="sm" onClick={() => refresh()}>
                Refresh
              </Button>
            </div>
            {codes.length === 0 ? (
              <EmptyState
                icon={<Network className="h-5 w-5" />}
                title="No active codes"
                description="Share a port with Code mode to generate a TUNNEL-XXXX-XXXX code."
              />
            ) : (
              <div className="space-y-2">
                {codes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold tracking-widest">{c.code}</span>
                        {c.expired ? <Badge variant="destructive">Expired</Badge> : <Badge variant="success">Active</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.name || '—'} · :{c.port}
                        {c.udp ? ' udp' : ''} · uses {c.uses}
                        {c.maxUses ? `/${c.maxUses}` : ''} · {c.expirationPreset}
                      </div>
                      {c.expiresAt > 0 && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          expires {new Date(c.expiresAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="outline" size="sm" onClick={() => copyCode(c.code)} aria-label="Copy code">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmCancelCode(c.code)} aria-label="Cancel code">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="text-xs font-bold tracking-widest text-muted-foreground">LIVE TUNNELS</div>
            {active.length === 0 && offered.length === 0 ? (
              <EmptyState icon={<Globe className="h-5 w-5" />} title="No live tunnels" description="Share a port or join a code to start." />
            ) : (
              <div className="space-y-2">
                {tunnels
                  .filter((t) => t.state !== 'closed')
                  .map((t) => (
                    <div
                      key={t.tunnelId}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5',
                        t.state === 'open' ? 'border-primary/20 bg-primary/5' : t.state === 'offered' ? 'border-amber-500/20 bg-amber-500/5' : 'bg-card',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-bold">{t.peerName || `Tunnel ${t.tunnelId.slice(0, 8)}`}</span>
                          <Badge variant={t.state === 'open' ? 'success' : t.state === 'connecting' ? 'warning' : 'secondary'} className="capitalize">
                            {t.state}
                          </Badge>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {t.host}:{t.port}
                          {t.udp ? ' udp' : ''} · {t.role}
                          {t.code ? ` · ${t.code}` : ''}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {Math.round(t.bytesUp / 1024)} KB up · {Math.round(t.bytesDown / 1024)} KB down
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmClose(t.tunnelId)} className="gap-1.5">
                        <X className="h-4 w-4" />
                        Close
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="space-y-2 pt-4 text-xs leading-relaxed text-muted-foreground">
          <div className="flex items-center gap-1.5 font-bold text-foreground">
            <Globe className="h-4 w-4" /> How it works
          </div>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>Paired tunnel</b> — choose one of your paired, online devices; they get an offer to Accept. Works over LAN or HyperDHT relay, same as files.
            </li>
            <li>
              <b>Code tunnel (TUNNEL-XXXX-XXXX)</b> — no pairing needed. Host announces on <code className="rounded bg-muted px-1">p2p-tunnel-&lt;code&gt;</code> (like
              DROP-XXXX); guest pastes the code anywhere (different Wi-Fi, CGNAT, mobile).
            </li>
            <li>
              <b>TCP</b> is framed over <code className="rounded bg-muted px-1">meshdrop-tunnel-v1</code> protomux; <b>UDP</b> over{' '}
              <code className="rounded bg-muted px-1">meshdrop-tunnel-udp-v1</code> (Holesail-style framed datagrams). Both are noise-encrypted.
            </li>
            <li>Codes support expiry presets (5m … never) and max-uses; guest auto-accepts the tunneled offer after TUNNEL_CLAIM.</li>
          </ul>
        </CardContent>
      </Card>

      <Sheet open={shareOpen} onOpenChange={(o) => !o && setShareOpen(false)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Share a port</SheetTitle>
            <SheetDescription>Expose a localhost port over the mesh. Paired mode targets one device; Code mode creates a share-anywhere code.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <div className="flex w-fit gap-2 rounded-full bg-muted p-1 text-xs font-bold">
              <button className={cn('rounded-full px-4 py-1.5', shareMode === 'paired' ? 'bg-primary text-primary-foreground' : '')} onClick={() => setShareMode('paired')}>
                Paired device
              </button>
              <button className={cn('rounded-full px-4 py-1.5', shareMode === 'code' ? 'bg-primary text-primary-foreground' : '')} onClick={() => setShareMode('code')}>
                Code (any peer)
              </button>
            </div>

            <label className="block text-xs font-semibold">
              Port (localhost) *
              <Input value={portInput} onChange={(e) => setPortInput(e.target.value)} placeholder="3000" className="mt-1 font-mono text-sm" inputMode="numeric" />
            </label>
            <label className="block text-xs font-semibold">
              Label (optional)
              <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="My dev server" className="mt-1 text-sm" />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={udpMode} onChange={(e) => setUdpMode(e.target.checked)} /> UDP (DNS/game/QUIC) — otherwise TCP
            </label>

            {shareMode === 'paired' ? (
              <label className="block text-xs font-semibold">
                Target paired device *
                <select
                  value={pairedPeerId}
                  onChange={(e) => setPairedPeerId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                >
                  <option value="">— pick a device —</option>
                  {pairedDevices.map((d) => (
                    <option key={d.id || d.publicKey} value={d.publicKey || d.id}>
                      {d.name} {d.isOnline ? '' : '(offline)'} — {String(d.publicKey || d.id).slice(0, 8)}…
                    </option>
                  ))}
                </select>
                {pairedDevices.length === 0 && <span className="text-[11px] font-normal text-muted-foreground">No paired online peers — use Code mode instead.</span>}
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold">
                  Expires
                  <select
                    value={expirationPreset}
                    onChange={(e) => setExpirationPreset(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                  >
                    <option value="5m">5 minutes</option>
                    <option value="15m">15 minutes</option>
                    <option value="30m">30 minutes</option>
                    <option value="1h">1 hour</option>
                    <option value="6h">6 hours</option>
                    <option value="24h">24 hours</option>
                    <option value="never">Never</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold">
                  Max uses (0 = unlimited)
                  <Input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="mt-1 text-sm" inputMode="numeric" placeholder="0" />
                </label>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShareOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={shareMode === 'paired' ? handlePairedShare : handleCodeShare} disabled={busy || !isValidPort(portInput) || (shareMode === 'paired' && !pairedPeerId)} className="gap-1.5">
                {shareMode === 'paired' ? (
                  <>
                    <Radio className="h-4 w-4" />
                    Offer tunnel
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4" />
                    Create code
                  </>
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={joinOpen} onOpenChange={(o) => !o && setJoinOpen(false)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Join tunnel code</SheetTitle>
            <SheetDescription>Paste a TUNNEL- code from another device. Your device will rendezvous on the DHT and receive an offer to accept.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <label className="block text-xs font-semibold">
              TUNNEL code
              <Input
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="TUNNEL-ABCD-EFGH"
                className="mt-1 font-mono text-sm tracking-widest"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setJoinOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={handleJoin} disabled={busy || !joinCodeInput.trim()} className="gap-1.5">
                <LogIn className="h-4 w-4" />
                Join
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!confirmClose}
        onOpenChange={(o) => !o && setConfirmClose(null)}
        onConfirm={async () => {
          if (confirmClose) {
            try {
              await closeTunnel(confirmClose)
            } catch {}
          }
          setConfirmClose(null)
        }}
        title="Close tunnel?"
        description="The local port/forward will be torn down on both sides."
        confirmLabel="Close"
      />
      <ConfirmDialog
        open={!!confirmCancelCode}
        onOpenChange={(o) => !o && setConfirmCancelCode(null)}
        onConfirm={async () => {
          if (confirmCancelCode) {
            try {
              await cancelCode(confirmCancelCode)
            } catch {}
          }
          setConfirmCancelCode(null)
        }}
        title="Cancel tunnel code?"
        description="The code will stop being announced and new guests will be refused."
        confirmLabel="Cancel code"
      />
    </div>
  )
}
