import { useEffect, useState } from 'react'
import { Radio, ShieldCheck, UserPlus, Smartphone, Wifi, CheckCircle2 } from 'lucide-react'
import { Button } from '@/ui/primitives/Button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/ui/primitives/Sheet'
import * as ipc from '@/lib/ipc'
import { EVENTS, METHODS } from '@/types/protocol'

interface DetectedDevice {
  publicKey: string
  name: string | null
}

export function LanPairPrompt() {
  const [device, setDevice] = useState<DetectedDevice | null>(null)
  const [pairing, setPairing] = useState(false)

  useEffect(() => {
    const unsubscribe = ipc.on(EVENTS.DEVICE_DISCOVERED, (data: unknown) => {
      const d = data as { publicKey?: string; name?: string | null }
      const pk = d?.publicKey
      if (typeof pk !== 'string' || pk.length !== 64) return
      setDevice((prev) => (prev && prev.publicKey === pk ? prev : { publicKey: pk, name: d.name || null }))
      setPairing(false)
    })
    return unsubscribe
  }, [])

  const dismiss = () => setDevice(null)

  const confirmPair = async () => {
    if (!device || pairing) return
    setPairing(true)
    try {
      await ipc.call(METHODS.DEVICES_CONFIRM_LAN, { publicKey: device.publicKey })
      setDevice(null)
    } catch (err) {
      console.warn('LAN pairing confirmation failed:', err)
      setPairing(false)
    }
  }

  return (
    <Sheet open={!!device} onOpenChange={(o) => !o && dismiss()}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-[15px]">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Radio className="h-4 w-4 animate-pulse" />
            </span>
            Device nearby
            <span className="ml-auto hidden sm:inline-flex items-center gap-1 rounded-full border border-meshdrop-cyan/20 bg-meshdrop-cyan/10 px-2 py-0.5 text-[10px] font-bold text-meshdrop-cyan">
              <Wifi className="h-3 w-3" /> LAN detected
            </span>
          </SheetTitle>
          <SheetDescription>A nearby device on your local network is ready to pair. Confirm to allow file exchange and folder sync.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/20 p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
              <Smartphone className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-foreground">
                {device?.name && device.name !== 'Connecting...' ? device.name : 'Unknown device'}
              </p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{device?.publicKey.slice(0, 20)}…</p>
              <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-meshdrop-cyan">
                <span className="h-1.5 w-1.5 rounded-full bg-meshdrop-cyan animate-pulse" />
                On your network · direct LAN available
              </p>
            </div>
            <span className="hidden sm:inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-online/10 text-status-online border border-status-online/20">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-border/40 bg-card px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-status-online" />
            <span>Pairing lets this device exchange files and sync folders with you. Until you confirm, it can only be seen — nothing is shared. You can also pair by code from the Devices page.</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex-1" onClick={dismiss} disabled={pairing}>
              Not now
            </Button>
            <Button className="flex-1 gap-1.5" onClick={confirmPair} disabled={pairing}>
              <UserPlus className="h-4 w-4" />
              {pairing ? 'Pairing…' : 'Pair'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
