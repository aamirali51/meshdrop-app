import { useEffect, useState, useCallback } from 'react'
import {
  Upload,
  FileText,
  Folder,
  Laptop,
  Smartphone,
  Monitor,
  X,
  Send,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { useDevices } from '@/hooks/useDevices'
import { useTransfers } from '@/hooks/useTransfers'
import { useToast } from '@/hooks/useToast'
import { useNavigation } from '@/hooks/useNavigation'
import { METHODS } from '@/types/protocol'
import { call } from '@/lib/ipc'
import type { Device } from '@/types'

interface QuickSendFileItem {
  filePath: string
  filename: string
  fileSize: number
  isDirectory?: boolean
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let val = bytes
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function getDeviceIcon(os?: string) {
  const s = String(os || '').toLowerCase()
  if (s.includes('android') || s.includes('ios') || s.includes('iphone')) return Smartphone
  if (s.includes('mac') || s.includes('win') || s.includes('linux')) return Laptop
  return Monitor
}

export function QuickSendModal() {
  const { devices } = useDevices()
  const { toast } = useToast()
  const { navigate } = useNavigation()

  const [isOpen, setIsOpen] = useState(false)
  const [files, setFiles] = useState<QuickSendFileItem[]>([])
  const [sendingTo, setSendingTo] = useState<string | null>(null)
  const [successPeer, setSuccessPeer] = useState<string | null>(null)

  const dispatchFilesToPeer = useCallback(
    async (peerKey: string, peerName: string, items: QuickSendFileItem[]) => {
      setSendingTo(peerKey)
      try {
        for (const item of items) {
          await call(METHODS.TRANSFERS_START, {
            filename: item.filename,
            filePath: item.filePath,
            fileSize: item.fileSize,
            peerId: peerKey,
            peerName
          })
        }
        setSuccessPeer(peerName)
        toast.success(
          'Dispatched via Context Menu',
          `Sent ${items.length} item(s) to ${peerName}.`
        )
        navigate('/transfers')
        setTimeout(() => {
          setIsOpen(false)
          setFiles([])
          setSendingTo(null)
          setSuccessPeer(null)
        }, 1200)
      } catch (err: any) {
        toast.error('Send Failed', err?.message || 'Could not dispatch transfer offer.')
        setSendingTo(null)
      }
    },
    [navigate, toast]
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !window.bridge?.onQuickSend) return

    const unsub = window.bridge.onQuickSend((payload) => {
      if (!payload || !payload.files?.length) return

      // Direct send to pre-targeted peer (from cascading submenu)
      if (payload.peerId) {
        const targetDev = devices.find(
          (d) => d.id === payload.peerId || d.publicKey === payload.peerId
        )
        const peerName = targetDev?.name || 'Mesh Peer'
        dispatchFilesToPeer(payload.peerId, peerName, payload.files)
        return
      }

      // Root "Send via MeshDrop" -> Open selection modal
      setFiles(payload.files)
      setIsOpen(true)
      setSuccessPeer(null)
    })

    return () => unsub?.()
  }, [devices, dispatchFilesToPeer])

  if (!isOpen || files.length === 0) return null

  const totalBytes = files.reduce((acc, f) => acc + (f.fileSize || 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-card border border-border p-6 shadow-2xl backdrop-blur-xl text-card-foreground">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Send via MeshDrop</h3>
              <p className="text-xs text-muted-foreground">Select destination device from your mesh</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Selected Items Box */}
        <div className="my-4 rounded-xl bg-muted/50 border border-border p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background border border-border text-muted-foreground">
              {files.length === 1 && files[0].isDirectory ? (
                <Folder className="h-4 w-4 text-amber-500" />
              ) : (
                <FileText className="h-4 w-4 text-indigo-500" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {files.length === 1 ? files[0].filename : `${files.length} items selected`}
              </p>
              <p className="text-xs text-muted-foreground">{formatBytes(totalBytes)} total</p>
            </div>
          </div>
        </div>

        {/* Success Banner */}
        {successPeer && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-500 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Dispatched transfer to {successPeer}!</span>
          </div>
        )}

        {/* Device Picker Section */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Target Device
          </p>

          {devices.length === 0 ? (
            <div className="py-8 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium text-foreground">No Paired Devices Found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Pair with another device in MeshDrop before sending files.
              </p>
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {devices.map((device) => {
                const IconComponent = getDeviceIcon(device.os)
                const isOnline = device.isOnline
                const devKey = device.publicKey || device.id
                const isSending = sendingTo === devKey

                return (
                  <button
                    key={device.id}
                    onClick={() => dispatchFilesToPeer(devKey, device.name, files)}
                    disabled={isSending || !!successPeer}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all text-left ${
                      isOnline
                        ? 'bg-card hover:bg-accent/60 border-border hover:border-indigo-500/40 text-card-foreground'
                        : 'bg-muted/30 border-border/40 text-muted-foreground opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <IconComponent className="h-4 w-4 text-indigo-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {device.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isOnline ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-muted-foreground/40'
                            }`}
                          />
                          <span className="text-[11px] text-muted-foreground">
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 transition-colors">
                      <Send className="h-3.5 w-3.5" />
                      <span>Send</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
