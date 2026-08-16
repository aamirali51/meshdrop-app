import { useState } from 'react'
import { FolderDown, FolderOpen, Loader2, Monitor, PlaySquare, Sparkles } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'
import type { PortableInstallOptions } from '@/types/bridge'

interface PortableInstallModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PortableInstallModal({ open, onOpenChange }: PortableInstallModalProps) {
  const { toast } = useToast()
  const [targetDir, setTargetDir] = useState<string>('')
  const [desktopShortcut, setDesktopShortcut] = useState(true)
  const [startMenuShortcut, setStartMenuShortcut] = useState(true)
  const [autoStart, setAutoStart] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleBrowse = async () => {
    try {
      const picked = await window.bridge?.portablePickFolder?.()
      if (picked) setTargetDir(picked)
    } catch (err: any) {
      console.warn('Failed to pick folder:', err?.message)
    }
  }

  const handleInstall = async () => {
    setBusy(true)
    try {
      const opts: PortableInstallOptions = {
        targetDir: targetDir.trim() || undefined,
        desktopShortcut,
        startMenuShortcut,
        autoStart
      }
      const res = await window.bridge?.portableInstall?.(opts)
      if (res?.canceled) {
        setBusy(false)
      } else if (!res?.ok) {
        setBusy(false)
        toast.error('Install Failed', res?.error || 'Could not install to a folder.')
      }
    } catch (err: any) {
      setBusy(false)
      toast.error('Install Failed', err?.message || 'Could not install to a folder.')
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(val) => !busy && onOpenChange(val)}
      title={
        <div className='flex items-center gap-2'>
          <div className='flex h-7 w-7 items-center justify-center rounded-lg gradient-brand text-white'>
            <FolderDown className='h-4 w-4' />
          </div>
          <span>Install MeshDrop to a Folder</span>
        </div>
      }
      description='Copy MeshDrop to a dedicated folder for fast startup, automatic updates, and co-located data storage.'
      blockClose={busy}
    >
      <div className='space-y-4 text-xs'>
        {/* Target Folder Selection */}
        <div className='space-y-1.5'>
          <label className='font-bold text-foreground'>Installation Folder</label>
          <div className='flex items-center gap-2'>
            <input
              type='text'
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              placeholder='Default (Documents/MeshDrop)'
              disabled={busy}
              className='h-9 flex-1 rounded-xl border border-input bg-background/50 px-3 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60'
            />
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={handleBrowse}
              disabled={busy}
              className='h-9 gap-1.5 rounded-xl border-input px-3 text-xs font-semibold'
            >
              <FolderOpen className='h-3.5 w-3.5 text-primary' />
              Browse…
            </Button>
          </div>
          <p className='text-[11px] text-muted-foreground/80'>
            If left blank, MeshDrop installs to your Documents directory inside a clean <code>MeshDrop/</code> subfolder.
          </p>
        </div>

        {/* Goodies & Options */}
        <div className='space-y-2.5 rounded-xl border border-border/50 bg-accent/30 p-3.5'>
          <div className='flex items-center gap-1.5 text-foreground font-bold'>
            <Sparkles className='h-3.5 w-3.5 text-primary' />
            <span>Install Options & Shortcuts</span>
          </div>

          <label className='flex cursor-pointer items-center gap-2.5 text-muted-foreground transition-colors hover:text-foreground'>
            <input
              type='checkbox'
              checked={desktopShortcut}
              onChange={(e) => setDesktopShortcut(e.target.checked)}
              disabled={busy}
              className='h-4 w-4 rounded border-input text-primary focus:ring-primary'
            />
            <div className='flex items-center gap-1.5'>
              <Monitor className='h-3.5 w-3.5 text-primary/80' />
              <span>Create Desktop Shortcut</span>
            </div>
          </label>

          <label className='flex cursor-pointer items-center gap-2.5 text-muted-foreground transition-colors hover:text-foreground'>
            <input
              type='checkbox'
              checked={startMenuShortcut}
              onChange={(e) => setStartMenuShortcut(e.target.checked)}
              disabled={busy}
              className='h-4 w-4 rounded border-input text-primary focus:ring-primary'
            />
            <div className='flex items-center gap-1.5'>
              <PlaySquare className='h-3.5 w-3.5 text-primary/80' />
              <span>Add to Start Menu / Programs</span>
            </div>
          </label>

          <label className='flex cursor-pointer items-center gap-2.5 text-muted-foreground transition-colors hover:text-foreground'>
            <input
              type='checkbox'
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              disabled={busy}
              className='h-4 w-4 rounded border-input text-primary focus:ring-primary'
            />
            <div className='flex items-center gap-1.5'>
              <FolderDown className='h-3.5 w-3.5 text-primary/80' />
              <span>Launch automatically on Windows startup</span>
            </div>
          </label>
        </div>

        {/* Action Buttons */}
        <div className='flex items-center justify-end gap-2.5 pt-2'>
          <Button
            type='button'
            variant='ghost'
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className='h-9 rounded-xl px-4 text-xs font-semibold'
          >
            Cancel
          </Button>
          <Button
            type='button'
            onClick={handleInstall}
            disabled={busy}
            className='h-9 gap-1.5 rounded-xl gradient-brand px-4 text-xs font-bold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-60'
          >
            {busy ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <FolderDown className='h-3.5 w-3.5' />}
            {busy ? 'Installing MeshDrop…' : 'Install MeshDrop'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
