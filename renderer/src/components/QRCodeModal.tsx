import { useState, useEffect } from 'react'
import { QrCode, Copy, Check, ShieldCheck } from 'lucide-react'
import QRCode from 'qrcode'
import { useDevices } from '@/hooks/useDevices'
import { useTheme } from '@/hooks/useTheme'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/Modal'

interface QRCodeModalProps {
  isOpen: boolean
  onClose: () => void
}

export function QRCodeModal({ isOpen, onClose }: QRCodeModalProps) {
  const { identity } = useDevices()
  const { theme } = useTheme()
  const { toast } = useToast()
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)

  const pairingCode = identity.pairingCode || ''
  const publicKey = identity.publicKey || ''

  // Generate QR from the RAW pairing code so any MeshDrop scanner
  // (desktop or mobile) can decode it — previously the payload was a JSON
  // envelope the scanner did not understand.
  //
  // In dark theme the dots render white (#ffffff) on transparent so they
  // show against the slate-900 card. In light theme they render dark
  // (#0f172a) on transparent so they stay visible against the white card.
  useEffect(() => {
    if (!isOpen) return
    if (!pairingCode) return

    const isDark = theme === 'dark'
    QRCode.toDataURL(pairingCode, {
      width: 250,
      margin: 2,
      color: {
        dark: isDark ? '#ffffff' : '#0f172a',
        light: '#0f172a00' // transparent background
      }
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('[QRCode] Error generating QR data URL:', err))
  }, [isOpen, pairingCode, theme])

  if (!isOpen) return null

  const handleCopyCode = () => {
    if (!pairingCode) return
    navigator.clipboard.writeText(pairingCode)
    setCopiedCode(true)
    toast.success('Pairing Code Copied', `${pairingCode} copied to clipboard.`)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const handleCopyKey = () => {
    if (!publicKey) return
    navigator.clipboard.writeText(publicKey)
    setCopiedKey(true)
    toast.success('Public Key Copied', 'Identity key copied to clipboard.')
    setTimeout(() => setCopiedKey(false), 2000)
  }

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title='Device Pairing QR Code'
      description='Scan with another MeshDrop device or share the short code'
      className='max-w-lg'
    >
      {/* Consistent vertical rhythm between the four logical sections */}
      <div className='flex flex-col gap-y-6'>
        {/* ── 1. QR Code block ─────────────────────────── */}
        <div className='flex flex-col items-center gap-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-inner dark:border-border/60 dark:bg-black/40'>
          {qrDataUrl ? (
            <div className='rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-hairline/10 dark:bg-slate-900'>
              <img src={qrDataUrl} alt='Pairing QR Code' className='h-44 w-44 object-contain' />
            </div>
          ) : (
            <div className='flex h-44 w-44 animate-pulse items-center justify-center rounded-lg bg-slate-100 dark:bg-muted/40'>
              <QrCode className='h-10 w-10 text-slate-400 dark:text-muted-foreground/40' />
            </div>
          )}

          {/* ── 2. Short Pairing Code block — copy icon now INSIDE the box */}
          <div className='w-full space-y-1.5'>
            <span className='block text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground'>
              Short Pairing Code
            </span>
            <div className='flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 dark:border-primary/30 dark:bg-primary/10'>
              <span className='min-w-0 whitespace-nowrap overflow-x-auto font-mono text-lg font-black tracking-widest text-blue-700 dark:text-primary'>
                {pairingCode || 'Loading…'}
              </span>
              <Button
                size='icon'
                variant='ghost'
                onClick={handleCopyCode}
                className='h-8 w-8 shrink-0 text-blue-600 hover:bg-blue-100 hover:text-blue-700 dark:text-primary/80 dark:hover:bg-primary/15 dark:hover:text-primary'
                aria-label='Copy pairing code'
              >
                {copiedCode ? (
                  <Check className='h-4 w-4 text-status-online' />
                ) : (
                  <Copy className='h-4 w-4' />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* ── 3. Public Identity Key section ──────────────────────────── */}
        <div className='space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-border/40 dark:bg-card/40'>
          <div className='flex items-center justify-between'>
            <span className='flex items-center gap-1.5 font-semibold text-slate-600 dark:text-muted-foreground'>
              <ShieldCheck className='h-3.5 w-3.5 text-blue-600 dark:text-primary' /> Public
              Identity Key
            </span>
            <button
              onClick={handleCopyKey}
              className='flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline dark:text-primary'
            >
              {copiedKey ? (
                <Check className='h-3 w-3 text-emerald-600 dark:text-status-online' />
              ) : (
                <Copy className='h-3 w-3' />
              )}
              {copiedKey ? 'Copied' : 'Copy Key'}
            </button>
          </div>
          <p className='rounded-lg border border-gray-200 bg-white p-2 font-mono text-[10px] text-slate-600 truncate dark:border-border/30 dark:bg-background/50 dark:text-muted-foreground'>
            {publicKey || 'Loading…'}
          </p>
        </div>

        {/* ── 4. Close button ─────────────────────────────────────────── */}
        <Button variant='outline' onClick={onClose} className='w-full font-semibold'>
          Close
        </Button>
      </div>
    </Modal>
  )
}
