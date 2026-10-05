import { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, Plus, ShieldCheck, Send, Info, ArrowRight, Copy, Check, RefreshCw, QrCode, Monitor, Smartphone } from 'lucide-react'
import { useDevices } from '@/hooks/useDevices'
import { useTransfers } from '@/hooks/useTransfers'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/ui/primitives/Button'
import { Card, CardContent } from '@/ui/primitives/Card'
import { EmptyState } from '@/ui/primitives/EmptyState'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/ui/primitives/Sheet'
import { DeviceCard } from '@/components/DeviceCard'
import { DeviceAvatar } from '@/ui/primitives/DeviceAvatar'
import { PairingCeremonySheet } from '@/components/PairingCeremonySheet'
import { ConfirmDialog } from '@/components/Modal'
import { onSessionResynced } from '@/lib/ipc'
import { formatTime } from '@/lib/format'
import type { Device } from '@/types'

const NETWORK_LABEL: Record<string, string> = {
  direct_lan: 'Direct (LAN)',
  direct_internet: 'Direct (Internet)',
  p2p_dht: 'Internet',
  relay: 'Relayed',
  lan: 'Direct (LAN)',
}

export function Devices() {
  const { devices, toggleTrustDevice, toggleFavoriteDevice, setInspectingDevice, removeDevice, getPairingCode, renameDevice, pairWithCode } =
    useDevices()
  const { sendFileToDevice, sendFilePath } = useTransfers()
  const { toast } = useToast()

  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'online' | 'offline'>('all')
  const [ceremonyOpen, setCeremonyOpen] = useState(false)
  const [pairByCodeOpen, setPairByCodeOpen] = useState(false)
  const [pairCodeInput, setPairCodeInput] = useState('')
  const [pairing, setPairing] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Device | null>(null)
  const [myCode, setMyCode] = useState('')
  const [codeCopied, setCodeCopied] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)

  const refreshMyCode = useCallback(() => {
    setCodeLoading(true)
    getPairingCode()
      .then((res: any) => {
        if (res?.code) setMyCode(res.code)
      })
      .catch(() => {})
      .finally(() => setCodeLoading(false))
  }, [getPairingCode])

  useEffect(() => {
    refreshMyCode()
  }, [refreshMyCode])

  // F06 resync: pairing code refills after reconnect without remount
  useEffect(() => {
    return onSessionResynced(() => refreshMyCode())
  }, [refreshMyCode])

  const copyMyCode = async () => {
    if (!myCode) return
    try {
      await navigator.clipboard.writeText(myCode)
      setCodeCopied(true)
      toast.success('Code Copied', `${myCode} copied — send it to the device you want to pair.`)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      toast.error('Copy Failed', 'Could not copy the pairing code.')
    }
  }

  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      const q = query.toLowerCase()
      const matchesQuery =
        d.name.toLowerCase().includes(q) ||
        (d.osVersion || '').toLowerCase().includes(q) ||
        (d.ipAddress || '').includes(query)
      if (!matchesQuery) return false
      if (activeTab === 'online') return d.isOnline
      if (activeTab === 'offline') return !d.isOnline
      return true
    })
  }, [devices, query, activeTab])

  const handleSendDrop = async (dev: Device, file: File) => {
    try {
      await sendFilePath(dev, file)
    } catch (err: any) {
      toast.error('Send Failed', err?.message || 'Could not start the transfer.')
    }
  }

  const handleRename = useCallback(
    (dev: Device, newName: string) => {
      renameDevice(dev.id, newName)
    },
    [renameDevice],
  )

  const handleRemoveWithFlag = useCallback(
    (dev: Device, opts?: { cancelDropCodes?: boolean }) => {
      removeDevice(dev.id, { cancelDropCodes: opts?.cancelDropCodes === true })
    },
    [removeDevice],
  )

  const handlePairByCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = pairCodeInput.trim().toUpperCase()
    if (!clean || pairing) return
    setPairing(true)
    try {
      await pairWithCode(clean)
      toast.success('Pairing…', 'Exchanging handshake — your device will appear shortly.')
      setPairByCodeOpen(false)
      setPairCodeInput('')
    } catch (err: any) {
      toast.error('Pair Failed', err?.message || 'Could not pair with that code.')
    } finally {
      setPairing(false)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-xl font-black tracking-tight text-foreground">My Devices</h2>
          <p className="text-xs text-muted-foreground">Presence-first · paired devices can send files and sync directly.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs font-bold" onClick={() => setPairByCodeOpen(true)}>
            Pair by code
          </Button>
          <Button onClick={() => setCeremonyOpen(true)} className="gap-2 text-xs font-bold shadow-sm">
            <Plus className="h-4 w-4" />
            Pair a device
          </Button>
        </div>
      </div>

      {/* Pairing code card — compact, with QR affordance via ceremony */}
      <Card className="overflow-hidden border-border/50">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <QrCode className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-foreground">Your pairing code</p>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-[rgb(var(--success)/0.2)] bg-[rgb(var(--success)/0.08)] px-2 py-0.5 text-[10px] font-bold text-[rgb(var(--success))]">
                  <ShieldCheck className="h-3 w-3" />
                  Encrypted
                </span>
              </div>
              <p className="mt-1 font-mono text-2xl font-black tracking-[0.14em] text-primary truncate">{codeLoading ? '…' : myCode || '—'}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Share this with the other device — or open Pair a device for a giant QR and the waiting ceremony.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs font-bold" onClick={copyMyCode} disabled={!myCode}>
                {codeCopied ? <Check className="h-3.5 w-3.5 text-[rgb(var(--success))]" /> : <Copy className="h-3.5 w-3.5" />}
                {codeCopied ? 'Copied!' : 'Copy'}
              </Button>
              <Button size="sm" className="h-8 gap-1.5 text-xs font-bold" onClick={() => setCeremonyOpen(true)}>
                <QrCode className="h-3.5 w-3.5" />
                QR & Ceremony
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Refresh code" onClick={refreshMyCode} disabled={codeLoading}>
                <RefreshCw className={codeLoading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters: segmented control All / Online / Offline + text filter */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, OS, IP…"
            className="w-full rounded-xl border border-border/60 bg-card/60 py-2 pl-10 pr-4 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-border/50 bg-muted/30 p-1 text-xs">
            {(['all', 'online', 'offline'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-bold capitalize transition-all ${
                  activeTab === tab ? 'bg-card text-foreground shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          {(query || activeTab !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs font-semibold text-muted-foreground"
              onClick={() => {
                setQuery('')
                setActiveTab('all')
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {filteredDevices.length === 0 ? (
        devices.length === 0 ? (
          <EmptyState
            icon={<Smartphone className="h-7 w-7" />}
            title="No devices paired yet"
            description="Pair your phone or another computer to send files directly"
            action={
              <Button onClick={() => setCeremonyOpen(true)} className="gap-2 text-xs font-bold">
                <Plus className="h-4 w-4" /> Pair a device
              </Button>
            }
          />
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-10 text-center space-y-2">
              <Monitor className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-bold text-foreground">No devices match your filter</p>
              <p className="mx-auto max-w-sm text-xs text-muted-foreground">Try adjusting your search or switch to All.</p>
              <Button variant="outline" size="sm" className="mt-1 text-xs font-semibold" onClick={() => { setQuery(''); setActiveTab('all') }}>
                Clear filters
              </Button>
            </CardContent>
          </Card>
        )
      ) : (
        <>
          {/* Grid — presence-first cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredDevices.map((dev) => (
              <DeviceCard
                key={dev.id}
                device={dev}
                onSend={(d) => d.isOnline && sendFileToDevice(d)}
                onSendDrop={handleSendDrop}
                onViewDetails={setInspectingDevice}
                onToggleTrust={(d) => toggleTrustDevice(d.id)}
                onToggleFavorite={(d) => toggleFavoriteDevice(d.id)}
                onRemove={handleRemoveWithFlag}
                onRename={handleRename}
              />
            ))}
          </div>

          {/* Table alternative — preserves same data for larger fleets */}
          {filteredDevices.length > 3 && (
            <Card className="overflow-hidden border-border/50">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border/50 bg-muted/20 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="p-3.5">Device</th>
                      <th className="p-3.5">Presence</th>
                      <th className="p-3.5">Network</th>
                      <th className="p-3.5">Address</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30 font-medium">
                    {filteredDevices.map((dev) => (
                      <tr key={dev.id} className="transition-colors hover:bg-muted/20">
                        <td className="p-3.5">
                          <div className="flex items-center gap-2.5">
                            <DeviceAvatar name={dev.name} os={String(dev.os || 'windows')} size="sm" presence={dev.isOnline ? 'online' : 'offline'} pulse={dev.isOnline} />
                            <div className="min-w-0">
                              <p className="flex items-center gap-1 truncate font-bold text-foreground">
                                {dev.name}
                                {dev.isTrusted && <ShieldCheck className="h-3 w-3 text-[rgb(var(--success))]" />}
                              </p>
                              <p className="truncate text-[10px] capitalize text-muted-foreground">{dev.os || 'device'} · {dev.osVersion || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${dev.isOnline ? 'text-[rgb(var(--success))]' : 'text-muted-foreground'}`}>
                            <span className={`h-2 w-2 rounded-full ${dev.isOnline ? 'bg-[rgb(var(--success))]' : 'bg-muted-foreground/40'}`} />
                            {dev.isOnline ? 'Online now' : dev.lastSeen ? `Last seen ${formatTime(dev.lastSeen)}` : 'Offline'}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-[11px] text-muted-foreground">
                          {(dev.networkType && (NETWORK_LABEL[dev.networkType] || dev.networkType.replace(/_/g, ' '))) || '—'}
                        </td>
                        <td className="p-3.5 font-mono text-foreground">{dev.ipAddress || '—'}</td>
                        <td className="space-x-1.5 p-3.5 text-right">
                          <Button size="sm" variant="outline" onClick={() => setInspectingDevice(dev)} className="h-7 text-xs">
                            <Info className="mr-1 h-3 w-3" />
                            Details
                          </Button>
                          <Button size="sm" disabled={!dev.isOnline} onClick={() => sendFileToDevice(dev)} className="h-7 gap-1 text-xs font-bold">
                            <Send className="h-3 w-3" />
                            Send
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Pairing ceremony Sheet */}
      <PairingCeremonySheet open={ceremonyOpen} onOpenChange={setCeremonyOpen} />

      {/* Pair by code Sheet — preserves pairWithCode flow, no lib changes */}
      <PairByCodeSheet open={pairByCodeOpen} onOpenChange={setPairByCodeOpen} value={pairCodeInput} onChange={setPairCodeInput} onSubmit={handlePairByCode} pairing={pairing} />

      {/* Remove confirmation (table fallback for non-card removes) */}
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.name ?? 'Device'}?`}
        description="The device will be unpaired and removed from your device list. This cannot be undone."
        confirmLabel="Remove Device"
        onConfirm={() => removeTarget && removeDevice(removeTarget.id)}
      />
    </div>
  )
}

function PairByCodeSheet({
  open,
  onOpenChange,
  value,
  onChange,
  onSubmit,
  pairing,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  value: string
  onChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  pairing: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Pair by code</SheetTitle>
          <SheetDescription>Enter the MD- code from the other device. Works for any peer — no QR needed.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <label htmlFor="pair-code" className="text-xs font-semibold text-foreground">
              Pairing code
            </label>
            <input
              id="pair-code"
              value={value}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              placeholder="MD-XXXX-XXXX-XXXX-XXXX"
              className="w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-center font-mono text-sm tracking-[0.12em] uppercase text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">The other device shows this code in its Pair a device sheet.</p>
          </div>
          <Button type="submit" className="w-full gap-1.5 font-bold" disabled={pairing || !value.trim()}>
            {pairing ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Pairing…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Pair Now
              </>
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
