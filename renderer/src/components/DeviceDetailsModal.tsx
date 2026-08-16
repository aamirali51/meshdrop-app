import { useState } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  Cpu,
  HardDrive,
  KeyRound,
  Edit3,
  Trash2,
  Check,
  ArrowLeftRight,
  Copy,
  Waypoints,
  Zap
} from 'lucide-react'
import { useDevices } from '@/hooks/useDevices'
import { useTransfers } from '@/hooks/useTransfers'
import { Button } from '@/components/ui/button'
import { Modal, ConfirmDialog } from '@/components/Modal'

export function DeviceDetailsModal() {
  const {
    inspectingDevice,
    setInspectingDevice,
    toggleTrustDevice,
    renameDevice,
    removeDevice
  } = useDevices()
  const { sendFileToDevice } = useTransfers()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [keyCopied, setKeyCopied] = useState(false)

  if (!inspectingDevice) return null
  const device = inspectingDevice

  const handleStartEditing = () => {
    setEditName(device.name)
    setIsEditing(true)
  }

  const handleSaveName = () => {
    if (!editName.trim()) return
    renameDevice(device.id, editName)
    setIsEditing(false)
  }

  const handleCopyKey = () => {
    if (!device.publicKey) return
    navigator.clipboard.writeText(device.publicKey)
    setKeyCopied(true)
    setTimeout(() => setKeyCopied(false), 2000)
  }

  return (
    <>
      <Modal
        open={!!device}
        onOpenChange={(o) => !o && setInspectingDevice(null)}
        className='max-w-lg'
        title={
          isEditing ? (
            <form
              className='flex items-center gap-2'
              onSubmit={(e) => {
                e.preventDefault()
                handleSaveName()
              }}
            >
              <input
                type='text'
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsEditing(false)
                    setEditName(device.name)
                  }
                }}
                className='rounded-lg border border-primary bg-background px-2.5 py-1 text-sm font-bold text-foreground outline-none'
                autoFocus
              />
              <button
                type='submit'
                className='rounded-lg bg-primary p-1 text-white hover:bg-primary/90'
                aria-label='Save name'
              >
                <Check className='h-4 w-4' />
              </button>
            </form>
          ) : (
            <span className='flex items-center gap-2'>
              {device.name}
              <button
                onClick={handleStartEditing}
                className='text-muted-foreground transition-colors hover:text-foreground'
                aria-label='Rename device'
              >
                <Edit3 className='h-3.5 w-3.5' />
              </button>
            </span>
          )
        }
        description={`${device.osVersion} • ${device.ipAddress}`}
      >
        {/* Quick Metrics */}
        <div className='grid grid-cols-3 gap-3'>
          <div className='space-y-1 rounded-xl border border-border/50 bg-card/40 p-3'>
            <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
              Status
            </p>
            <p
              className={`flex items-center gap-1.5 text-xs font-bold ${
                device.isOnline ? 'text-status-online' : 'text-muted-foreground'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  device.isOnline ? 'bg-status-online' : 'bg-muted-foreground/40'
                }`}
              />
              {device.isOnline ? 'Online' : 'Offline'}
            </p>
          </div>
          <div className='space-y-1 rounded-xl border border-border/50 bg-card/40 p-3'>
            <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
              P2P Latency
            </p>
            <p className='font-mono text-xs font-bold text-foreground'>
              {device.isOnline ? `${device.latencyMs} ms` : '—'}
            </p>
          </div>
          <div className='space-y-1 rounded-xl border border-border/50 bg-card/40 p-3'>
            <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
              Trust Status
            </p>
            <p className='flex items-center gap-1 text-xs font-bold text-primary'>
              {device.isTrusted ? (
                <>
                  <ShieldCheck className='h-3.5 w-3.5 text-primary' /> Trusted
                </>
              ) : (
                <>
                  <ShieldAlert className='h-3.5 w-3.5 text-status-away' /> Not trusted
                </>
              )}
            </p>
          </div>
        </div>

        {/* System Details List */}
        <div className='mt-4 space-y-3 rounded-2xl border border-border/60 bg-card/30 p-4'>
          <h4 className='text-xs font-bold uppercase tracking-wider text-foreground'>
            Device Details
          </h4>
          <div className='space-y-2 text-xs'>
            <div className='flex justify-between border-b border-border/30 pb-2'>
              <span className='flex items-center gap-1.5 text-muted-foreground'>
                <Cpu className='h-3.5 w-3.5 text-muted-foreground/70' /> CPU Usage
              </span>
              <span className='font-mono font-semibold text-foreground'>
                {device.cpuUsage != null ? `${device.cpuUsage}%` : '—'}
              </span>
            </div>
            <div className='flex justify-between border-b border-border/30 pb-2'>
              <span className='flex items-center gap-1.5 text-muted-foreground'>
                <HardDrive className='h-3.5 w-3.5 text-muted-foreground/70' /> Memory Usage
              </span>
              <span className='font-mono font-semibold text-foreground'>
                {device.ramUsage != null ? `${device.ramUsage}%` : '—'}
              </span>
            </div>
            <div className='flex items-center justify-between'>
              <span className='flex items-center gap-1.5 text-muted-foreground'>
                <Waypoints className='h-3.5 w-3.5 text-muted-foreground/70' /> Connection
              </span>
              <span
                className={`flex items-center gap-1 font-mono font-semibold ${
                  device.relayed ? 'text-status-away' : 'text-status-online'
                }`}
              >
                {device.relayed ? (
                  <>
                    <Waypoints className='h-3 w-3' /> Relayed
                  </>
                ) : (
                  <>
                    <Zap className='h-3 w-3' /> Direct
                  </>
                )}
              </span>
            </div>
            <div className='flex items-center justify-between'>
              <span className='flex items-center gap-1.5 text-muted-foreground'>
                <KeyRound className='h-3.5 w-3.5 text-muted-foreground/70' /> Public Key
              </span>
              <span className='flex items-center gap-1.5'>
                <span className='max-w-[200px] truncate font-mono text-[10px] text-muted-foreground'>
                  {device.publicKey || '—'}
                </span>
                {device.publicKey && (
                  <button
                    onClick={handleCopyKey}
                    className='flex items-center gap-1 text-[10px] font-bold text-primary hover:underline'
                  >
                    {keyCopied ? (
                      <Check className='h-3 w-3 text-status-online' />
                    ) : (
                      <Copy className='h-3 w-3' />
                    )}
                    {keyCopied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className='mt-4 flex items-center gap-3'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => toggleTrustDevice(device.id)}
            className='text-xs font-semibold'
          >
            {device.isTrusted ? 'Untrust Device' : 'Trust Device'}
          </Button>
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setConfirmRemove(true)}
            className='h-9 gap-1.5 px-3 text-xs'
          >
            <Trash2 className='h-3.5 w-3.5' />
            Remove
          </Button>
          <Button
            size='sm'
            disabled={!device.isOnline}
            onClick={() => {
              sendFileToDevice(device)
              setInspectingDevice(null)
            }}
            className='ml-auto gap-2 bg-primary font-bold text-white hover:bg-primary/90'
          >
            Send Files
            <ArrowLeftRight className='h-4 w-4' />
          </Button>
        </div>
        <p className='mt-3 text-[11px] leading-relaxed text-muted-foreground'>
          Trusted devices can send you files (and sync folders) directly. Devices you've paired
          with a code are trusted automatically.
        </p>
      </Modal>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${device.name}?`}
        description='The device will be unpaired and removed from your device list. This cannot be undone.'
        confirmLabel='Remove Device'
        onConfirm={() => {
          removeDevice(device.id)
          setInspectingDevice(null)
        }}
      />
    </>
  )
}
