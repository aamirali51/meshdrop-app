import { useEffect, useState, useRef, useCallback } from 'react'
import { Copy, Check, RefreshCw, CheckCircle2, QrCode, ShieldCheck, Radio } from 'lucide-react'
import QRCode from 'qrcode'
import { useDevices } from '@/hooks/useDevices'
import { useToast } from '@/hooks/useToast'
import { useTheme } from '@/hooks/useTheme'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/ui/primitives/Sheet'
import { Button } from '@/ui/primitives/Button'
import * as ipc from '@/lib/ipc'
import { EVENTS } from '@/types/protocol'
import type { Device } from '@/types'

type CeremonyStep = 1 | 2 | 3

interface PairingCeremonySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PairingCeremonySheet({ open, onOpenChange }: PairingCeremonySheetProps) {
  const { getPairingCode } = useDevices()
  const { toast } = useToast()
  const { theme } = useTheme()

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [step, setStep] = useState<CeremonyStep>(1)
  const [pairedDevice, setPairedDevice] = useState<Device | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')

  const stepRef = useRef<CeremonyStep>(1)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshCode = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await getPairingCode()
      if (res?.code) setCode(res.code)
    } catch {
      /* keep previous code */
    } finally {
      setLoading(false)
    }
  }, [getPairingCode])

  // QR generation
  useEffect(() => {
    if (!code) {
      setQrDataUrl('')
      return
    }
    const isDark = theme === 'dark'
    QRCode.toDataURL(code, {
      width: 280,
      margin: 2,
      color: {
        dark: isDark ? '#ffffff' : '#0f172a',
        light: '#0f172a00',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''))
  }, [code, theme])

  // Open lifecycle + F06 resync re-fetch without remount
  useEffect(() => {
    if (!open) return
    stepRef.current = 1
    setStep(1)
    setPairedDevice(null)
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current)
      successTimerRef.current = null
    }
    refreshCode()

    const unsubResync = ipc.onSessionResynced(() => {
      refreshCode()
    })

    // Pairing success driven by device.paired / peer.connected / device.updated
    const handlePaired = (data: unknown) => {
      const dev = data as Device
      if (!dev?.id || !dev?.name || dev.name === 'Connecting...') return
      if (stepRef.current === 3) return
      stepRef.current = 3
      setPairedDevice(dev)
      setStep(3)
      // auto-close after celebration — device already appears in list via DevicesProvider
      successTimerRef.current = setTimeout(() => {
        successTimerRef.current = null
        onOpenChange(false)
      }, 2200)
    }
    const u1 = ipc.on(EVENTS.DEVICE_PAIRED, handlePaired)
    const u2 = ipc.on(EVENTS.PEER_CONNECTED, handlePaired)
    const u3 = ipc.on(EVENTS.DEVICE_UPDATED, handlePaired)

    return () => {
      u1()
      u2()
      u3()
      unsubResync()
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
        successTimerRef.current = null
      }
    }
  }, [open, refreshCode, onOpenChange])

  // After code is ready, gracefully advance from step 1 to step 2 (waiting pulse).
  // This keeps the QR visible but moves the dot, fulfilling the 3-step ceremony
  // without requiring an engine event for the intermediate state.
  useEffect(() => {
    if (!open) return
    if (!code || loading) return
    if (stepRef.current !== 1) return
    const t = setTimeout(() => {
      if (stepRef.current !== 1) return
      stepRef.current = 2
      setStep(2)
    }, 900)
    return () => clearTimeout(t)
  }, [open, code, loading])

  const handleCopy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success('Code Copied', `${code} copied — share it with the other device.`)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy Failed', 'Could not copy the pairing code.')
    }
  }

  const handleRefresh = async () => {
    setStep(1)
    stepRef.current = 1
    await refreshCode()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <QrCode className="h-4 w-4" />
            </span>
            Pair a device
          </SheetTitle>
          <SheetDescription>Share this code — the other device scans or enters it to pair directly.</SheetDescription>
        </SheetHeader>

        {/* Step dots */}
        <div className="mt-1 flex items-center justify-center gap-2">
          {([1, 2, 3] as CeremonyStep[]).map((s, idx) => {
            const active = step === s
            const done = step > s
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-black transition-all ${
                    done
                      ? 'border-[rgb(var(--success))] bg-[rgb(var(--success))] text-white'
                      : active
                        ? 'border-primary bg-primary text-primary-foreground shadow-md scale-105'
                        : 'border-border bg-muted text-muted-foreground'
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : s}
                </div>
                {idx < 2 && (
                  <div className={`h-0.5 w-8 rounded-full transition-colors ${step > s ? 'bg-[rgb(var(--success))]/60' : 'bg-border'}`} />
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-1.5 flex justify-center gap-6 text-[10px] font-bold tracking-widest uppercase">
          <span className={step === 1 ? 'text-primary' : step > 1 ? 'text-[rgb(var(--success))]' : 'text-muted-foreground'}>Share</span>
          <span className={step === 2 ? 'text-primary' : step > 2 ? 'text-[rgb(var(--success))]' : 'text-muted-foreground'}>Waiting</span>
          <span className={step === 3 ? 'text-[rgb(var(--success))]' : 'text-muted-foreground'}>Paired</span>
        </div>

        <div className="mt-6 flex flex-col items-center">
          {/* Step 1 & 2: Giant QR + MD- code */}
          {step !== 3 ? (
            <div className="flex w-full flex-col items-center gap-4">
              <div className="relative">
                {/* soft glow behind QR */}
                <div className="absolute -inset-3 -z-10 rounded-[28px] bg-gradient-to-br from-primary/15 via-[rgb(var(--meshdrop-cyan)/0.08)] to-primary/10 blur-2xl" />
                <div className="rounded-[20px] border border-border/60 bg-white p-3 shadow-lg dark:bg-slate-900">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt={`QR for ${code}`} className="h-[220px] w-[220px] object-contain" />
                  ) : (
                    <div className="flex h-[220px] w-[220px] items-center justify-center rounded-xl bg-muted/40">
                      <QrCode className="h-10 w-10 animate-pulse text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                {step === 2 && (
                  <span className="pointer-events-none absolute -right-1 -top-1 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[rgb(var(--meshdrop-cyan))] opacity-50" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-[rgb(var(--meshdrop-cyan))]" />
                  </span>
                )}
              </div>

              <div className="w-full max-w-sm space-y-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Your pairing code</p>
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-3">
                  <span className="min-w-0 flex-1 text-center font-mono text-[18px] font-black tracking-[0.14em] text-primary">
                    {loading ? '…' : code || 'MD-••••'}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={handleCopy}
                    disabled={!code || loading}
                    aria-label="Copy code"
                  >
                    {copied ? <Check className="h-4 w-4 text-[rgb(var(--success))]" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs font-bold" onClick={handleCopy} disabled={!code}>
                    {copied ? <Check className="h-3.5 w-3.5 text-[rgb(var(--success))]" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied!' : 'Copy code'}
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 text-xs font-bold" onClick={handleRefresh} disabled={loading}>
                    <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                    Refresh
                  </Button>
                </div>
                <p className="mx-auto max-w-[28ch] text-[11px] leading-relaxed text-muted-foreground">
                  On the other device, enter this code or scan the QR. No account, no cloud — direct encrypted pairing.
                </p>
              </div>

              {/* Step 2 waiting pulse band */}
              <div
                className={`w-full max-w-sm rounded-2xl border px-4 py-3 text-center transition-all ${
                  step === 2
                    ? 'border-[rgb(var(--meshdrop-cyan)/0.25)] bg-[rgb(var(--meshdrop-cyan)/0.08)]'
                    : 'border-border/40 bg-muted/20 opacity-60'
                }`}
              >
                <div className="flex items-center justify-center gap-2 text-xs font-bold">
                  <span className="relative flex h-2 w-2">
                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${step === 2 ? 'animate-ping bg-[rgb(var(--meshdrop-cyan))]' : 'bg-muted-foreground/40'}`} />
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${step === 2 ? 'bg-[rgb(var(--meshdrop-cyan))]' : 'bg-muted-foreground/40'}`} />
                  </span>
                  <span className={step === 2 ? 'text-[rgb(var(--meshdrop-cyan))]' : 'text-muted-foreground'}>Waiting for the other device…</span>
                  <Radio className={`h-3.5 w-3.5 ${step === 2 ? 'animate-pulse text-[rgb(var(--meshdrop-cyan))]' : 'text-muted-foreground/50'}`} />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Keep this open — you’ll feel it pop when they pair.</p>
              </div>

              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-[rgb(var(--success))]" />
                End-to-end encrypted · code never leaves the mesh
              </div>
            </div>
          ) : (
            /* Step 3: success moment */
            <div className="flex w-full flex-col items-center gap-4 py-6 text-center">
              <div className="relative">
                <div className="absolute -inset-6 -z-10 rounded-full bg-[rgb(var(--success)/0.14)] blur-2xl" />
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[rgb(var(--success)/0.3)] bg-[rgb(var(--success)/0.12)] shadow-lg animate-scale-up">
                  <CheckCircle2 className="h-10 w-10 text-[rgb(var(--success))]" />
                </div>
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[rgb(var(--success))] text-white shadow-md">
                  <Check className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-lg font-black text-foreground">Paired!</p>
                <p className="text-sm text-muted-foreground">
                  {pairedDevice ? (
                    <>
                      Connected to <span className="font-bold text-foreground">“{pairedDevice.name}”</span>
                    </>
                  ) : (
                    'Device appeared in your list.'
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">Closing — your new device is ready to send files.</p>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-[rgb(var(--success)/0.2)] bg-[rgb(var(--success)/0.08)] px-3 py-1 text-[11px] font-bold text-[rgb(var(--success))]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Encrypted link established
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <Button variant="ghost" size="sm" className="text-xs font-semibold text-muted-foreground" onClick={() => onOpenChange(false)}>
            {step === 3 ? 'Done' : 'Close'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
