import { useState, useEffect } from 'react'
import { EVENTS, METHODS } from '@/types/protocol'
import { call, on } from '@/lib/ipc'
import { useToast } from '@/hooks/useToast'
import { Folder, FolderPlus, X, Check, ShieldCheck, ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/Modal'

interface SyncInvite {
  id: string
  name: string
  peerId: string
  peerName: string
  defaultPath: string
  fileCount?: number
}

export function SyncInviteModal() {
  const { toast } = useToast()
  const [invites, setInvites] = useState<SyncInvite[]>([])
  const [customPath, setCustomPath] = useState<string>('')
  const [busy, setBusy] = useState<boolean>(false)

  useEffect(() => {
    const fetchInvites = () => {
      call(METHODS.SYNC_LIST_INVITES || 'sync.listInvites')
        .then((res: any) => {
          if (Array.isArray(res) && res.length > 0) {
            setInvites(res)
          }
        })
        .catch(() => {})
    }

    fetchInvites()
    const timer = setInterval(fetchInvites, 3000)

    const onInvite = (data: any) => {
      if (data && data.id) {
        setInvites((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]))
      }
    }

    const unsub1 = on(EVENTS.SYNC_INVITE_RECEIVED, onInvite)
    const unsub2 = on('sync.invite_received', onInvite)
    const unsub3 = on('sync:invite:received', onInvite)

    return () => {
      clearInterval(timer)
      unsub1()
      unsub2()
      unsub3()
    }
  }, [])

  if (invites.length === 0) return null

  const invite = invites[0]
  const totalInvites = invites.length

  const handlePickFolder = async () => {
    if (!window.bridge?.openFolderDialog) {
      toast.error('Unavailable', 'Folder picker is only available in the desktop app.')
      return
    }
    try {
      const picked = await window.bridge.openFolderDialog()
      if (picked) {
        setCustomPath(picked)
      }
    } catch {
      toast.error('Pick Failed', 'Could not open folder picker.')
    }
  }

  const handleAccept = async (pathTarget?: string) => {
    setBusy(true)
    try {
      const chosen = pathTarget || customPath || invite.defaultPath
      await call(METHODS.SYNC_ACCEPT_INVITE || 'sync.acceptInvite', { id: invite.id, customPath: chosen })
      toast.success('Sync Folder Linked', `"${invite.name}" is now syncing to ${chosen}.`)
      setInvites((prev) => prev.filter((x) => x.id !== invite.id))
      setCustomPath('')
    } catch (err: any) {
      toast.error('Accept Failed', err?.message || 'Could not accept sync invitation.')
    } finally {
      setBusy(false)
    }
  }

  const handleDecline = async () => {
    try {
      await call(METHODS.SYNC_DECLINE_INVITE || 'sync.declineInvite', { id: invite.id })
      setInvites((prev) => prev.filter((x) => x.id !== invite.id))
      setCustomPath('')
    } catch {}
  }

  return (
    <Modal
      open={invites.length > 0}
      onOpenChange={() => {}}
      blockClose
      title='Incoming Folder Sync Invitation'
      description={`From ${invite.peerName || 'Remote Peer'}`}
    >
      <div className='space-y-4 pt-1'>
        {/* Folder Card */}
        <div className='rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2'>
          <div className='flex items-center gap-3'>
            <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary'>
              <Folder className='h-5 w-5' />
            </div>
            <div className='min-w-0 flex-1'>
              <p className='truncate text-sm font-bold text-foreground'>{invite.name}</p>
              <p className='truncate text-xs text-muted-foreground'>
                Continuous P2P Folder Sync
              </p>
            </div>
            {totalInvites > 1 && (
              <span className='rounded-full border border-primary/30 bg-primary/15 px-2.5 py-1 text-[10px] font-extrabold text-primary'>
                1 of {totalInvites}
              </span>
            )}
          </div>
        </div>

        {/* Custom Target Folder Picker */}
        <div className='space-y-1.5'>
          <span className='block text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
            Target Folder Location on your PC
          </span>
          <div
            onClick={handlePickFolder}
            className='flex items-center gap-2 rounded-xl border border-hairline/20 bg-card/60 px-3.5 py-2.5 text-xs transition-all hover:border-primary/40 cursor-pointer'
          >
            <FolderPlus className='h-4 w-4 shrink-0 text-primary' />
            <span className='min-w-0 flex-1 truncate font-mono text-foreground'>
              {customPath || invite.defaultPath}
            </span>
            <Button size='sm' variant='ghost' className='h-7 px-2 text-[11px] font-bold'>
              Change…
            </Button>
          </div>
        </div>

        {/* Security badge */}
        <div className='flex items-center gap-1.5 rounded-xl border border-hairline/10 bg-card/40 p-2.5 text-[10px] font-mono text-muted-foreground'>
          <ArrowLeftRight className='h-3.5 w-3.5 shrink-0 text-meshdrop-cyan' />
          Two-way end-to-end encrypted sync stream
          <ShieldCheck className='ml-auto h-3.5 w-3.5 shrink-0 text-status-online' />
        </div>
      </div>

      <div className='flex flex-wrap items-center gap-2 pt-4'>
        <Button
          variant='outline'
          disabled={busy}
          className='flex-1 border-hairline/10 text-destructive hover:bg-destructive/10 cursor-pointer'
          onClick={handleDecline}
        >
          <X className='mr-1.5 h-4 w-4' />
          Decline
        </Button>
        <Button
          disabled={busy}
          className='flex-1 gap-1.5 cursor-pointer font-bold'
          onClick={() => handleAccept()}
        >
          <Check className='mr-1.5 h-4 w-4' />
          Accept & Sync
        </Button>
      </div>
    </Modal>
  )
}
