import { useState } from 'react'
import { Zap, ShieldCheck, ArrowRight, Laptop } from 'lucide-react'
import { useDevices } from '@/hooks/useDevices'
import { useNavigation } from '@/hooks/useNavigation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/Modal'

export function QuickConnectModal() {
  const { isQuickConnectOpen, toggleQuickConnect, pairWithCode } = useDevices()
  const { navigate } = useNavigation()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    const raw = code.trim()
    if (!raw) {
      setError('Enter a pairing code (MD-…) from the other device.')
      return
    }
    try {
      await pairWithCode(raw)
      setCode('')
      setError('')
      toggleQuickConnect()
      navigate('/devices')
    } catch (err: any) {
      setError(err?.message || 'Could not pair with that code.')
    }
  }

  return (
    <Modal
      open={isQuickConnectOpen}
      onOpenChange={(o) => !o && toggleQuickConnect()}
      title='Pair a Device'
      description='Enter the pairing code (MD-…) shown on the device you want to connect to'
    >
      <form onSubmit={handleConnect} className='space-y-4'>
        <div className='space-y-1.5'>
          <label
            htmlFor='quick-connect-code'
            className='text-xs font-bold uppercase tracking-wider text-muted-foreground'
          >
            Pairing Code
          </label>
          <div className='relative'>
            <input
              id='quick-connect-code'
              type='text'
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setError('')
              }}
              placeholder='e.g. MD-ABCD-EFGH-JKLM-NPQR'
              className='w-full rounded-xl border border-border/80 bg-background/80 px-4 py-3 font-mono text-sm font-bold tracking-widest text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20'
              autoFocus
            />
            <Laptop className='absolute right-3.5 top-3.5 h-4 w-4 text-muted-foreground/60' />
          </div>
          {error && <p className='text-xs font-medium text-destructive'>{error}</p>}
        </div>

        {/* Security Note */}
        <div className='flex items-center gap-1.5 rounded-xl border border-border/40 bg-card/40 p-3 text-xs text-muted-foreground'>
          <ShieldCheck className='h-3.5 w-3.5 shrink-0 text-status-online' />
          <span>Pairing is end-to-end encrypted — no account or server involved.</span>
        </div>

        <div className='flex items-center gap-3 pt-2'>
          <Button
            type='button'
            variant='outline'
            onClick={toggleQuickConnect}
            className='flex-1 font-semibold'
          >
            Cancel
          </Button>
          <Button type='submit' className='flex-1 gap-2 font-bold'>
            Pair Now
            <ArrowRight className='h-4 w-4' />
          </Button>
        </div>
      </form>
    </Modal>
  )
}
