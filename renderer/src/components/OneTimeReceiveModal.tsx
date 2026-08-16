import { useEffect, useState } from 'react'
import { Download, ShieldCheck, ArrowRight, XCircle } from 'lucide-react'
import { useShares } from '@/hooks/useShares'
import { useNavigation } from '@/hooks/useNavigation'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/Modal'

function normalizeCode(raw: string): string | null {
  const clean = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  // Accept both the canonical "DROP-ABCD-EFGH" and a bare 8-char code.
  const body = clean.startsWith('DROP') ? clean.slice(4) : clean
  if (body.length !== 8) return null
  return `DROP-${body.slice(0, 4)}-${body.slice(4)}`
}

export function OneTimeReceiveModal() {
  const {
    isOneTimeReceiveOpen,
    toggleOneTimeReceiveModal,
    claimFileWithCode,
    deepLinkCode,
    clearDeepLinkCode
  } = useShares()
  const { navigate } = useNavigation()
  const { toast } = useToast()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  // A deep link (meshdrop://drop/…) stashes the code in context — pre-fill
  // the field once, then clear it so a later link still lands here.
  useEffect(() => {
    if (!deepLinkCode) return
    setCode(deepLinkCode)
    setError('')
    clearDeepLinkCode()
  }, [deepLinkCode, clearDeepLinkCode])

  const handleClose = () => {
    setCode('')
    setError('')
    toggleOneTimeReceiveModal()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = normalizeCode(code)
    if (!clean) {
      setError('Enter a DROP code, e.g. DROP-ABCD-EFGH')
      return
    }
    try {
      await claimFileWithCode(clean)
      handleClose()
      // The claim runs in the background: take the user straight to the
      // Transfers tab, where the download appears once the sender is online.
      navigate('/transfers')
      toast.info(
        'Waiting for Sender',
        `${clean} — the download starts automatically when the sender's device comes online.`
      )
    } catch (err: any) {
      setError(err?.message || 'Could not process that code.')
    }
  }

  return (
    <Modal
      open={isOneTimeReceiveOpen}
      onOpenChange={(o) => !o && handleClose()}
      title='One-Time Receive'
      description='Enter a DROP code to download a file anonymously — no pairing needed'
    >
      <form onSubmit={handleSubmit} className='space-y-4'>
        <div className='space-y-1.5'>
          <label
            htmlFor='one-time-receive-code'
            className='text-xs font-bold uppercase tracking-wider text-muted-foreground'
          >
            DROP Code
          </label>
          <input
            id='one-time-receive-code'
            type='text'
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setError('')
            }}
            placeholder='e.g. DROP-ABCD-EFGH'
            className='w-full rounded-xl border border-border/80 bg-background/80 px-4 py-3 font-mono text-sm font-bold tracking-widest text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20'
            autoFocus
          />
          {error && <p className='text-xs font-medium text-destructive'>{error}</p>}
        </div>

        <div className='flex items-center gap-1.5 rounded-xl border border-border/40 bg-card/40 p-3 text-xs text-muted-foreground'>
          <ShieldCheck className='h-3.5 w-3.5 shrink-0 text-status-online' />
          <span>
            The sender is never added to your device list — the connection exists only for the
            transfer.
          </span>
        </div>

        <div className='flex items-center gap-3 pt-2'>
          <Button
            type='button'
            variant='outline'
            onClick={handleClose}
            className='flex-1 font-semibold'
          >
            <XCircle className='mr-1.5 h-4 w-4' /> Cancel
          </Button>
          <Button type='submit' className='flex-1 gap-2 font-bold'>
            Receive File
            <ArrowRight className='h-4 w-4' />
          </Button>
        </div>
      </form>
    </Modal>
  )
}
