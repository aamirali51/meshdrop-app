import { useEffect, useState } from 'react'
import { Radio, ShieldCheck, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/Modal'
import * as ipc from '@/lib/ipc'
import { EVENTS, METHODS } from '@/types/protocol'

interface DetectedDevice {
  publicKey: string
  name: string | null
}

// One-tap confirm for the two-tier trust model: a peer was heard on the local
// network (autoTrustLAN enabled) and is recognized at the 'lan' level only —
// identity exchange + display. Pairing (file exchange, sync, relay) happens
// ONLY when the user confirms here. Dismissing is safe: the prompt may re-fire
// on the next detection event, but nothing ever pairs automatically.
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
    <Modal
      open={!!device}
      onOpenChange={(o) => !o && dismiss()}
      title='Device detected on your network'
      description='A nearby device announced itself on your local network.'
    >
      <div className='space-y-3'>
        <div className='flex items-center gap-3 rounded-xl border border-hairline/10 bg-muted/50 p-3'>
          <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-meshdrop-cyan/30 bg-meshdrop-cyan/10 text-meshdrop-cyan'>
            <Radio className='h-5 w-5 animate-pulse' />
          </div>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-bold text-foreground'>
              {device?.name && device.name !== 'Connecting...' ? device.name : 'Unknown device'}
            </p>
            <p className='truncate font-mono text-[10px] text-muted-foreground'>
              {device?.publicKey.slice(0, 16)}…
            </p>
          </div>
        </div>

        <div className='flex items-start gap-1.5 rounded-xl border border-hairline/10 bg-card/40 p-3 text-[10px] font-mono text-muted-foreground'>
          <ShieldCheck className='mt-0.5 h-3.5 w-3.5 shrink-0 text-meshdrop-cyan' />
          Pairing lets this device exchange files and sync folders with you. Until you confirm, it
          can only be seen — nothing is shared.
        </div>
      </div>

      <div className='flex items-center gap-3 pt-4'>
        <Button
          variant='outline'
          className='flex-1 border-hairline/10'
          onClick={dismiss}
          disabled={pairing}
        >
          Not now
        </Button>
        <Button className='flex-1 gap-1.5' onClick={confirmPair} disabled={pairing}>
          <UserPlus className='h-4 w-4' />
          {pairing ? 'Pairing…' : 'Pair'}
        </Button>
      </div>
    </Modal>
  )
}
