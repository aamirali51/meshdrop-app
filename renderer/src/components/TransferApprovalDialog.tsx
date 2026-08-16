import { useTransfers } from '@/hooks/useTransfers'
import { formatBytes } from '@/lib/format'
import { FileText, X, ShieldCheck, Download, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/Modal'

export function TransferApprovalDialog() {
  const { pendingOffers, acceptTransfer, declineTransfer } = useTransfers()

  if (!pendingOffers || pendingOffers.length === 0) return null

  const offer = pendingOffers[0]
  const totalOffers = pendingOffers.length

  return (
    <Modal
      open={pendingOffers.length > 0}
      onOpenChange={() => {}}
      blockClose
      title='Incoming Transfer Request'
      description={`From ${offer.senderIdentity?.name || 'Remote Peer'}`}
    >
      <div className='space-y-3'>
        {/* File summary */}
        <div className='flex items-center gap-3 rounded-xl border border-hairline/10 bg-muted/50 p-3'>
          <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-meshdrop-cyan/30 bg-meshdrop-cyan/10 text-meshdrop-cyan'>
            <FileText className='h-5 w-5' />
          </div>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-bold text-foreground'>{offer.filename}</p>
            <p className='font-mono text-xs text-muted-foreground'>{formatBytes(offer.fileSize)}</p>
          </div>
          {totalOffers > 1 && (
            <span className='rounded-full border border-primary/20 bg-primary/15 px-2.5 py-1 text-[10px] font-extrabold text-primary'>
              1 of {totalOffers}
            </span>
          )}
        </div>

        {/* Security badge */}
        <div className='flex items-center gap-1.5 rounded-xl border border-hairline/10 bg-card/40 p-3 text-[10px] font-mono text-muted-foreground'>
          <Radio className='h-3 w-3 shrink-0 text-meshdrop-cyan animate-pulse' />
          End-to-end encrypted stream · Verify the sender before accepting
          <ShieldCheck className='ml-auto h-3.5 w-3.5 shrink-0 text-meshdrop-cyan' />
        </div>
      </div>

      <div className='flex items-center gap-3 pt-4'>
        <Button
          variant='outline'
          className='flex-1 border-hairline/10 text-destructive hover:bg-destructive/10'
          onClick={() => declineTransfer(offer.transferId)}
        >
          <X className='mr-1.5 h-4 w-4' />
          Decline
        </Button>
        <Button className='flex-1 gap-1.5' onClick={() => acceptTransfer(offer.transferId)}>
          <Download className='mr-1.5 h-4 w-4' />
          Accept & Save
        </Button>
      </div>
    </Modal>
  )
}
