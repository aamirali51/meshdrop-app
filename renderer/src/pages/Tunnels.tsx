import { useState } from 'react'
import { Network, Copy, Trash2, Plus, LogIn, X, Zap, Globe, Radio, Clock } from 'lucide-react'
import { useTunnels } from '@/hooks/useTunnels'
import { useDevices } from '@/hooks/useDevices'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Modal, ConfirmDialog } from '@/components/Modal'
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
    try { await acceptTunnel(tunnelId); toast.success('Tunnel Accepted', tunnelId.slice(0, 8)) } catch (e) { toast.error('Accept failed', (e as Error)?.message || '') } finally { setBusy(false) }
  }
  const handleReject = async (tunnelId: string) => {
    try { await rejectTunnel(tunnelId) } catch {}
  }

  const pairedDevices = devices.filter((d) => d.isTrusted && d.isOnline)

  const handlePairedShare = async () => {
    if (!isValidPort(portInput)) { toast.error('Invalid port', 'Use 1-65535'); return }
    if (!pairedPeerId) { toast.error('Pick a device', 'Choose a paired, online peer.'); return }
    setBusy(true)
    try {
      const { tunnelId } = await createPairedTunnel({ peerId: pairedPeerId, port: Number(portInput), name: nameInput.trim(), udp: udpMode })
      setShareOpen(false)
      toast.success('Tunnel Offered', `Waiting for ${pairedDevices.find((d) => d.id === pairedPeerId || d.publicKey === pairedPeerId)?.name || 'peer'} to accept (${tunnelId.slice(0, 8)}…)`)
    } catch (e) { toast.error('Share failed', (e as Error)?.message || String(e)) } finally { setBusy(false) }
  }

  const handleCodeShare = async () => {
    if (!isValidPort(portInput)) { toast.error('Invalid port', 'Use 1-65535'); return }
    setBusy(true)
    try {
      const rec = await createCode({ port: Number(portInput), name: nameInput.trim(), udp: udpMode, expirationPreset, maxUses: Number(maxUses) || 0 })
      setShareOpen(false)
      toast.success('Tunnel Code Ready', `${rec.code} — expires ${expirationPreset}, share on any network, no pairing`)
      try { await navigator.clipboard.writeText(rec.code) } catch {}
    } catch (e) { toast.error('Create code failed', (e as Error)?.message || String(e)) } finally { setBusy(false) }
  }

  const handleJoin = async () => {
    const code = joinCodeInput.trim().toUpperCase()
    if (!code) { toast.error('Enter code', 'Paste a TUNNEL-XXXX-XXXX code'); return }
    setBusy(true)
    try {
      await joinCode(code)
      setJoinOpen(false)
      setJoinCodeInput('')
      toast.success('Joining Tunnel', 'Looking for host on DHT — offer arrives when found')
    } catch (e) { toast.error('Join failed', (e as Error)?.message || String(e)) } finally { setBusy(false) }
  }

  const offered = tunnels.filter((t) => t.state === 'offered' && t.role === 'guest')
  const active = tunnels.filter((t) => t.state === 'open' || t.state === 'connecting')

  const copyCode = async (code: string) => {
    try { await navigator.clipboard.writeText(code); toast.success('Copied', code) } catch { toast.error('Copy failed', code) }
  }

  return (
    <div className="flex h-full flex-col gap-5 p-6 overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight flex items-center gap-2"><Network className="h-5 w-5 text-primary" />Tunnels</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Holesail-style port tunnels over the mesh — paired pipes (A↔B) + TUNNEL- code shares (any network, no pairing). TCP + UDP.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setJoinOpen(true)}><LogIn className="h-4 w-4" />Join Code</Button>
          <Button size="sm" onClick={() => setShareOpen(true)}><Plus className="h-4 w-4" />Share Port</Button>
        </div>
      </div>

      {offered.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-4 space-y-3">
            <div className="text-xs font-bold tracking-widest text-amber-600">INCOMING OFFERS · {offered.length}</div>
            {offered.map((t) => (
              <div key={t.tunnelId} className="flex items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{t.name || `Port ${t.port}`} <span className="font-mono text-xs text-muted-foreground">{t.port}{t.udp ? ' udp' : ''}</span></div>
                  <div className="text-xs text-muted-foreground">From {t.peerName || t.peerId.slice(0, 8)} · {t.code ? `code ${t.code}` : 'paired'}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" disabled={busy} onClick={() => handleAccept(t.tunnelId)}><Zap className="h-4 w-4" />Accept</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => handleReject(t.tunnelId)}><X className="h-4 w-4" />Decline</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold tracking-widest text-muted-foreground">MY TUNNEL CODES</span>
              <Button variant="ghost" size="sm" onClick={() => refresh()}>Refresh</Button>
            </div>
            {codes.length === 0 ? (
              <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No active codes — Share Port with mode “Code” to generate one.<br /><span className="text-xs">TUNNEL-XXXX-XXXX · DHT topic p2p-tunnel-… · works without pairing.</span></div>
            ) : (
              <div className="space-y-2">
                {codes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 bg-card">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-bold tracking-widest">{c.code}</div>
                      <div className="text-xs text-muted-foreground">{c.name || '—'} · :{c.port}{c.udp ? ' udp' : ''} · uses {c.uses}{c.maxUses ? `/${c.maxUses}` : ''} · {c.expirationPreset}</div>
                      {c.expiresAt > 0 && <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />expires {new Date(c.expiresAt).toLocaleString()}</div>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => copyCode(c.code)}><Copy className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmCancelCode(c.code)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="mb-3 text-xs font-bold tracking-widest text-muted-foreground">LIVE TUNNELS</div>
            {active.length === 0 && offered.length === 0 ? (
              <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No live tunnels. Share a port or join a code.</div>
            ) : (
              <div className="space-y-2">
                {[...offered, ...active].length === 0 ? null : null}
                {tunnels.filter((t) => t.state !== 'closed').map((t) => (
                  <div key={t.tunnelId} className={cn('flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5', t.state === 'open' ? 'bg-primary/5 border-primary/20' : t.state === 'offered' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-card')}>
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{t.name || `Tunnel ${t.tunnelId.slice(0, 8)}`}</div>
                      <div className="text-xs text-muted-foreground font-mono">{t.host}:{t.port}{t.udp ? ' udp' : ''} · {t.role} · {t.state}{t.code ? ` · ${t.code}` : ''}</div>
                      <div className="text-[11px] text-muted-foreground">{Math.round(t.bytesUp / 1024)} KB up · {Math.round(t.bytesDown / 1024)} KB down</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmClose(t.tunnelId)}><X className="h-4 w-4" />Close</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="pt-4 text-xs leading-relaxed text-muted-foreground">
          <div className="font-bold text-foreground flex items-center gap-1.5"><Globe className="h-4 w-4" /> How it works</div>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li><b>Paired tunnel</b> — choose one of your paired, online devices; they get an offer to Accept. Works over LAN or HyperDHT relay, same as files.</li>
            <li><b>Code tunnel (TUNNEL-XXXX-XXXX)</b> — no pairing needed. Host announces on <code className="rounded bg-muted px-1">p2p-tunnel-&lt;code&gt;</code> (like DROP-XXXX); guest pastes the code anywhere (different Wi-Fi, CGNAT, mobile). Multiple guests may join until maxUses/expiry.</li>
            <li><b>TCP</b> is framed over <code className="rounded bg-muted px-1">meshdrop-tunnel-v1</code> protomux; <b>UDP</b> over <code className="rounded bg-muted px-1">meshdrop-tunnel-udp-v1</code> (Holesail-style framed datagrams). Both are noise-encrypted.</li>
            <li>Codes support expiry presets (5m … never) and max-uses; guest auto-accepts the tunneled offer after TUNNEL_CLAIM. Host can expose as local forward on guest via Accept’s localPort.</li>
          </ul>
        </CardContent>
      </Card>

      <Modal open={shareOpen} onOpenChange={(o) => !o && setShareOpen(false)} title="Share a Port">
        <div className="space-y-4">
          <div className="flex gap-2 rounded-full bg-muted p-1 text-xs font-bold w-fit">
            <button className={cn('rounded-full px-4 py-1.5', shareMode === 'paired' ? 'bg-primary text-primary-foreground' : '')} onClick={() => setShareMode('paired')}>Paired Device</button>
            <button className={cn('rounded-full px-4 py-1.5', shareMode === 'code' ? 'bg-primary text-primary-foreground' : '')} onClick={() => setShareMode('code')}>Code (any peer)</button>
          </div>

          <label className="block text-xs font-semibold">Port (localhost) *
            <input value={portInput} onChange={(e) => setPortInput(e.target.value)} placeholder="3000" className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 font-mono text-sm" inputMode="numeric" />
          </label>
          <label className="block text-xs font-semibold">Label (optional)
            <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="My dev server" className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={udpMode} onChange={(e) => setUdpMode(e.target.checked)} /> UDP (DNS/game/QUIC) — otherwise TCP</label>

          {shareMode === 'paired' ? (
            <label className="block text-xs font-semibold">Target paired device *
              <select value={pairedPeerId} onChange={(e) => setPairedPeerId(e.target.value)} className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm">
                <option value="">— pick a device —</option>
                {pairedDevices.map((d) => <option key={d.id || d.publicKey} value={d.publicKey || d.id}>{d.name} {d.isOnline ? '' : '(offline)'} — {String(d.publicKey || d.id).slice(0, 8)}…</option>)}
              </select>
              {pairedDevices.length === 0 && <span className="text-[11px] font-normal text-muted-foreground">No paired online peers — use Code mode instead.</span>}
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold">Expires
                <select value={expirationPreset} onChange={(e) => setExpirationPreset(e.target.value)} className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm">
                  <option value="5m">5 minutes</option><option value="15m">15 minutes</option><option value="30m">30 minutes</option><option value="1h">1 hour</option><option value="6h">6 hours</option><option value="24h">24 hours</option><option value="never">Never</option>
                </select>
              </label>
              <label className="block text-xs font-semibold">Max uses (0 = unlimited)
                <input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm" inputMode="numeric" placeholder="0" />
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShareOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={shareMode === 'paired' ? handlePairedShare : handleCodeShare} disabled={busy || !isValidPort(portInput) || (shareMode === 'paired' && !pairedPeerId)}>{shareMode === 'paired' ? <><Radio className="h-4 w-4" />Offer Tunnel</> : <><Globe className="h-4 w-4" />Create Code</>}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={joinOpen} onOpenChange={(o) => !o && setJoinOpen(false)} title="Join Tunnel Code">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Paste a TUNNEL- code from another device. Your device will rendezvous on the DHT (no pairing needed) and receive an offer to accept.</p>
          <label className="block text-xs font-semibold">TUNNEL Code
            <input value={joinCodeInput} onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())} placeholder="TUNNEL-ABCD-EFGH" className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 font-mono text-sm tracking-widest" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setJoinOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleJoin} disabled={busy || !joinCodeInput.trim()}><LogIn className="h-4 w-4" />Join</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmClose} onOpenChange={(o) => !o && setConfirmClose(null)} onConfirm={async () => { if (confirmClose) { try { await closeTunnel(confirmClose) } catch {} } setConfirmClose(null) }} title="Close tunnel?" description="The local port/forward will be torn down on both sides." confirmLabel="Close" />
      <ConfirmDialog open={!!confirmCancelCode} onOpenChange={(o) => !o && setConfirmCancelCode(null)} onConfirm={async () => { if (confirmCancelCode) { try { await cancelCode(confirmCancelCode) } catch {} } setConfirmCancelCode(null) }} title="Cancel tunnel code?" description="The code will stop being announced and new guests will be refused." confirmLabel="Cancel code" />
    </div>
  )
}
