import { useTransfers } from '@/hooks/useTransfers'
import { formatBytes } from '@/lib/format'
import { FileText, X, ShieldCheck, Download, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/ui/primitives/Sheet'

export function TransferApprovalDialog() {
  const { pendingOffers, acceptTransfer, declineTransfer } = useTransfers()

  if (!pendingOffers || pendingOffers.length === 0) return null

  const offer = pendingOffers[0]
  const totalOffers = pendingOffers.length

  return (
    <Sheet open={pendingOffers.length > 0} onOpenChange={() => {}}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-[20px] md:rounded-xl">
        <SheetHeader className="pr-8">
          <SheetTitle className="flex items-center gap-2 text-[15px] font-black">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
              <Download className="h-3.5 w-3.5" />
            </span>
            Incoming transfer
            {totalOffers > 1 && (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                1 of {totalOffers}
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs">
            From <span className="font-semibold text-foreground">{offer.senderIdentity?.name || 'Remote peer'}</span> — verify the sender before you accept.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 py-1">
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground" title={offer.filename}>
                {offer.filename}
              </p>
              <p className="font-mono text-xs text-muted-foreground">{formatBytes(offer.fileSize)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-[rgb(var(--meshdrop-cyan)/0.22)] bg-[rgb(var(--meshdrop-cyan)/0.08)] px-3 py-2.5 text-[11px] font-medium text-muted-foreground">
            <Radio className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--meshdrop-cyan))] animate-pulse" aria-hidden />
            <span>End-to-end encrypted · SHA-256 verified stream</span>
            <ShieldCheck className="ml-auto h-4 w-4 shrink-0 text-[rgb(var(--success))]" aria-hidden />
          </div>

          <div className="flex gap-2.5 pt-1">
            <Button
              variant="outline"
              className="flex-1 h-10 gap-1.5 rounded-xl border-border/70 font-bold"
              onClick={() => declineTransfer(offer.transferId)}
            >
              <X className="h-4 w-4" /> Decline
            </Button>
            <Button className="flex-1 h-10 gap-1.5 rounded-xl font-bold shadow-sm" onClick={() => acceptTransfer(offer.transferId)}>
              <Download className="h-4 w-4" /> Accept & Save
            </Button>
          </div>
          {totalOffers > 1 && (
            <p className="text-center text-[11px] text-muted-foreground">
              {totalOffers - 1} more waiting — they will appear after you decide.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
