import { useState, useEffect } from 'react'
import { EVENTS, METHODS } from '@/types/protocol'
import { call, on } from '@/lib/ipc'
import { pickFolder } from '@/lib/capabilities'
import { useToast } from '@/hooks/useToast'
import { Folder, FolderPlus, X, Check, ShieldCheck, ArrowLeftRight, ArrowUpRight, ArrowDownLeft, Users, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/Modal'

interface SyncInvite {
  id: string
  name: string
  peerId: string
  peerName: string
  defaultPath: string
  mode?: string
  fileCount?: number
}

export function SyncInviteModal() {
  const { toast } = useToast()
  const [invites, setInvites] = useState<SyncInvite[]>([])
  const [customPath, setCustomPath] = useState<string>('')
  const [busy, setBusy] = useState<boolean>(false)

  useEffect(() => {
    call(METHODS.SYNC_LIST_INVITES)
      .then((res: unknown) => { if (Array.isArray(res)) setInvites(res as SyncInvite[]) })
      .catch(() => toast.error('Sync Invites', 'Could not load incoming sync invitations.'))
    const onInvite = (data: unknown) => {
      const d = data as SyncInvite | null
      if (d && d.id) setInvites((prev) => (prev.some((x) => x.id === d.id) ? prev : [...prev, d]))
    }
    const unsub1 = on(EVENTS.SYNC_INVITE_RECEIVED, onInvite)
    const unsub2 = on(EVENTS.SYNC_LIBRARY_ADDED, () => {})
    return () => { unsub1(); unsub2() }
  }, [])

  if (invites.length === 0) return null

  const invite = invites[0]
  const totalInvites = invites.length

  const handlePickFolder = async () => {
    try {
      const picked = await pickFolder(invite.defaultPath)
      if (picked) setCustomPath(picked)
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

  const modeBadge =
    invite.mode === 'push' ? 'Receive copy — the other device sends to you' :
    invite.mode === 'receive_only' ? 'Send backup — you send to the other device' :
    'Two-way — changes flow both ways'

  return (
    <Modal
      open={invites.length > 0}
      onOpenChange={() => {}}
      blockClose
      title='Incoming sync invite'
      description={invite.peerName ? `From ${invite.peerName}` : 'A peer wants to sync a folder with you'}
    >
      <div className='space-y-4 pt-1'>
        <div className='rounded-2xl border border-primary/20 bg-primary/[0.06] p-4 space-y-3'>
          <div className='flex items-center gap-3'>
            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary'>
              <Folder className='h-5 w-5' />
            </span>
            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-1.5'>
                <p className='truncate text-sm font-bold text-foreground'>{invite.name}</p>
                {invite.mode && (
                  <span className='rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-primary'>
                    {invite.mode === 'push' ? 'Receive copy' : invite.mode === 'receive_only' ? 'Send backup' : 'Two-way'}
                  </span>
                )}
              </div>
              <p className='text-xs text-muted-foreground'>{modeBadge}</p>
              <p className='mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground'>
                {invite.fileCount != null && <span>{invite.fileCount} file(s) · </span>}
                <span>Continuous P2P sync</span>
              </p>
            </div>
            {totalInvites > 1 && (
              <span className='shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-extrabold text-primary'>
                1 of {totalInvites}
              </span>
            )}
          </div>
          <p className='flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground'>
            <ShieldCheck className='h-3.5 w-3.5 shrink-0 text-status-online' />
            Accepting creates a local folder and starts syncing — nothing is shared until you accept.
          </p>
        </div>

        <div className='space-y-1.5'>
          <span className='block text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Where to sync it on this device</span>
          <button
            type='button'
            onClick={handlePickFolder}
            className='flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.04] cursor-pointer'
          >
            <FolderPlus className='h-4 w-4 shrink-0 text-primary' />
            <span className='min-w-0 flex-1 truncate font-mono text-xs text-foreground' title={customPath || invite.defaultPath}>{customPath || invite.defaultPath}</span>
            <span className='shrink-0 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] font-bold text-muted-foreground'>Change…</span>
          </button>
          <p className='text-[11px] text-muted-foreground flex items-center gap-1'><Clock3 className='h-3 w-3' /> You can choose a custom folder — the picker uses the in-app browser view on web.</p>
        </div>

        <div className='flex items-center gap-1.5 rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground'>
          {invite.mode === 'push' ? <ArrowDownLeft className='h-3.5 w-3.5 shrink-0 text-purple-400' /> : invite.mode === 'receive_only' ? <ArrowUpRight className='h-3.5 w-3.5 shrink-0 text-meshdrop-cyan' /> : <ArrowLeftRight className='h-3.5 w-3.5 shrink-0 text-meshdrop-cyan' />}
          <span className='font-medium text-foreground'>{invite.mode === 'push' ? 'You will receive a copy' : invite.mode === 'receive_only' ? 'You will send a backup' : 'Changes flow both ways'}</span>
          <Users className='ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/60' />
        </div>
      </div>

      <div className='flex items-center gap-2 pt-4'>
        <Button variant='outline' disabled={busy} className='flex-1 cursor-pointer' onClick={handleDecline}>
          <X className='mr-1.5 h-4 w-4' /> Decline
        </Button>
        <Button disabled={busy} className='flex-1 gap-1.5 cursor-pointer font-bold' onClick={() => handleAccept()}>
          <Check className='mr-1.5 h-4 w-4' /> Accept & sync
        </Button>
      </div>
    </Modal>
  )
}
