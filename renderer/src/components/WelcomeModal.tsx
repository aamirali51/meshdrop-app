import { useEffect, useState } from 'react'
import { Link2, Network, Download, RefreshCw, ShieldCheck } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/button'

// One-time first-run modal: teaches the core concepts in ~10 seconds.
// Shows once (flag persisted in localStorage — no account, no server).
const WELCOME_KEY = 'meshdrop.welcomeSeen'

const STEPS = [
  {
    icon: Link2,
    title: 'Share a file with a link',
    body: 'Drop a file, get a link. It travels device-to-device — no account, no cloud, no size limits.'
  },
  {
    icon: Network,
    title: 'Pair your own devices',
    body: 'Use your code or QR so your laptop and phone can send files directly.'
  },
  {
    icon: RefreshCw,
    title: 'Sync folders between devices',
    body: 'Keep folders like Photos and Music in sync automatically — two-way, encrypted, no cloud.'
  },
  {
    icon: Download,
    title: 'Receive with a code',
    body: 'Someone shares a DROP code — enter it to get the file, no pairing needed.'
  }
]

export function WelcomeModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(WELCOME_KEY)) return
      const t = setTimeout(() => setOpen(true), 800)
      return () => clearTimeout(t)
    } catch {
      return
    }
  }, [])

  const dismiss = () => {
    try {
      localStorage.setItem(WELCOME_KEY, '1')
    } catch {}
    setOpen(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) dismiss()
      }}
      title='Welcome to MeshDrop'
      description='Peer-to-peer file sharing — no accounts, no cloud.'
    >
      <div className='space-y-4'>
        {STEPS.map((s, i) => (
          <div key={s.title} className='flex items-start gap-3'>
            <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary'>
              <s.icon className='h-5 w-5' />
            </div>
            <div className='space-y-0.5'>
              <p className='text-sm font-bold text-foreground'>
                <span className='mr-1 text-primary'>{i + 1}.</span>
                {s.title}
              </p>
              <p className='text-xs leading-relaxed text-muted-foreground'>{s.body}</p>
            </div>
          </div>
        ))}

        <div className='flex items-center gap-2 rounded-xl border border-status-online/20 bg-status-online/5 p-2.5 text-[11px] text-muted-foreground'>
          <ShieldCheck className='h-3.5 w-3.5 shrink-0 text-status-online' />
          End-to-end encrypted and open source (MIT) — your files never touch a server.
        </div>

        <Button onClick={dismiss} className='w-full gap-2 font-bold'>
          Get Started
        </Button>
      </div>
    </Modal>
  )
}
