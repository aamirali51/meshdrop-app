import { useState, useMemo, useEffect } from 'react'
import {
  Monitor,
  Search,
  Grid,
  List,
  Plus,
  ShieldCheck,
  Send,
  Info,
  Trash2,
  ArrowRight,
  KeyRound,
  Copy,
  Check,
  QrCode,
  RefreshCw
} from 'lucide-react'
import { useDevices } from '@/hooks/useDevices'
import { useTransfers } from '@/hooks/useTransfers'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DeviceCard } from '@/components/DeviceCard'
import { DeviceAvatar } from '@/components/DeviceAvatar'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { ConfirmDialog } from '@/components/Modal'
import { PairDeviceModal } from '@/components/PairDeviceModal'
import type { Device } from '@/types'

// Plain-language labels for raw network-type values from the engine.
const NETWORK_LABEL: Record<string, string> = {
  direct_lan: 'Direct (LAN)',
  direct_internet: 'Direct (Internet)',
  p2p_dht: 'Internet',
  relay: 'Relayed',
  lan: 'Direct (LAN)'
}

export function Devices() {
  const {
    devices,
    toggleTrustDevice,
    toggleFavoriteDevice,
    setInspectingDevice,
    removeDevice,
    getPairingCode,
    toggleQRCodeModal
  } = useDevices()
  const { sendFileToDevice, sendFilePath } = useTransfers()
  const { toast } = useToast()

  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'online' | 'trusted' | 'desktops' | 'mobile'>(
    'all'
  )
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [pairOpen, setPairOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Device | null>(null)
  const [rowMenu, setRowMenu] = useState<{ device: Device; x: number; y: number } | null>(null)
  const [myCode, setMyCode] = useState('')
  const [codeCopied, setCodeCopied] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)

  // The live pairing code for THIS device — pair first, then send files.
  const refreshMyCode = () => {
    setCodeLoading(true)
    getPairingCode()
      .then((res: any) => {
        if (res && res.code) setMyCode(res.code)
      })
      .catch(() => {})
      .finally(() => setCodeLoading(false))
  }
  useEffect(() => {
    refreshMyCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const copyMyCode = async () => {
    if (!myCode) return
    try {
      await navigator.clipboard.writeText(myCode)
      setCodeCopied(true)
      toast.success('Code Copied', `${myCode} copied — send it to the device you want to pair.`)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      toast.error('Copy Failed', 'Could not copy the pairing code.')
    }
  }

  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      const matchesQuery =
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        d.osVersion.toLowerCase().includes(query.toLowerCase()) ||
        d.ipAddress.includes(query)
      if (!matchesQuery) return false

      if (activeTab === 'online') return d.isOnline
      if (activeTab === 'trusted') return d.isTrusted
      if (activeTab === 'desktops') return d.deviceType === 'desktop' || d.deviceType === 'laptop'
      if (activeTab === 'mobile') return d.deviceType === 'mobile'
      return true
    })
  }, [devices, query, activeTab])

  const handleSendDrop = async (dev: Device, file: File) => {
    try {
      await sendFilePath(dev, file)
    } catch (err: any) {
      toast.error('Send Failed', err?.message || 'Could not start the transfer.')
    }
  }

  const rowMenuItems = (dev: Device): ContextMenuItem[] => [
    {
      label: 'Details',
      icon: <Info className='h-3.5 w-3.5' />,
      onClick: () => setInspectingDevice(dev)
    },
    {
      label: 'Send Files',
      icon: <Send className='h-3.5 w-3.5' />,
      onClick: () => sendFileToDevice(dev),
      disabled: !dev.isOnline
    },
    { separator: true },
    {
      label: dev.isTrusted ? 'Untrust Device' : 'Trust Device',
      icon: <ShieldCheck className='h-3.5 w-3.5' />,
      onClick: () => toggleTrustDevice(dev.id)
    },
    {
      label: 'Remove Device',
      icon: <Trash2 className='h-3.5 w-3.5' />,
      onClick: () => setRemoveTarget(dev),
      destructive: true
    }
  ]

  return (
    <div className='space-y-6 pb-12'>
      {/* Header & Controls Bar */}
      <div className='flex flex-col justify-between gap-4 md:flex-row md:items-center'>
        <div>
          <h2 className='text-xl font-black text-foreground'>My Devices</h2>
          <p className='text-xs text-muted-foreground'>
            Pair your other devices for direct, encrypted transfers between them.
          </p>
        </div>

        <div className='flex items-center gap-3'>
          <Button onClick={() => setPairOpen(true)} className='gap-2 text-xs font-bold'>
            <Plus className='h-4 w-4' />
            Pair New Device
          </Button>
        </div>
      </div>

      {/* Your Pairing Code — pair first, then send files */}
      <Card className='glass-card border-hairline/10'>
        <CardContent className='p-4 md:p-5'>
          <div className='flex flex-col md:flex-row md:items-center gap-4'>
            <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary'>
              <KeyRound className='h-5 w-5' />
            </div>
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <p className='text-sm font-bold text-foreground'>Your Pairing Code</p>
                <span className='hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground'>
                  <ShieldCheck className='h-3 w-3 text-meshdrop-cyan' />
                  Give this to the device you want to pair
                </span>
              </div>
              <p className='mt-1 font-mono text-2xl font-black tracking-[0.14em] text-primary'>
                {codeLoading ? '…' : myCode || 'No code yet — refresh'}
              </p>
              <p className='mt-1 text-[11px] text-muted-foreground'>
                On the other device, enter this code (or scan the QR) to pair. Your pairing code is
                permanent for this device and stays fixed unless refreshed.
              </p>
            </div>
            <div className='flex shrink-0 items-center gap-2'>
              <Button
                size='sm'
                variant='outline'
                className='h-8 gap-1.5 text-xs font-bold'
                onClick={copyMyCode}
                disabled={!myCode}
              >
                {codeCopied ? (
                  <Check className='h-3.5 w-3.5 text-status-online' />
                ) : (
                  <Copy className='h-3.5 w-3.5' />
                )}
                {codeCopied ? 'Copied!' : 'Copy Code'}
              </Button>
              <Button
                size='sm'
                variant='outline'
                className='h-8 gap-1.5 text-xs font-bold'
                onClick={toggleQRCodeModal}
              >
                <QrCode className='h-3.5 w-3.5' />
                Show QR
              </Button>
              <Button
                size='icon'
                variant='ghost'
                className='h-8 w-8'
                title='Get a fresh pairing code'
                onClick={refreshMyCode}
                disabled={codeLoading}
              >
                <RefreshCw className={codeLoading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search, Filter Tabs & View Toggle */}
      <div className='flex flex-col items-stretch justify-between gap-3 md:flex-row md:items-center'>
        {/* Search Bar */}
        <div className='relative max-w-md flex-1'>
          <Search className='absolute left-3.5 top-3 h-4 w-4 text-muted-foreground' />
          <input
            type='text'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Filter devices by name, OS, IP address...'
            className='w-full rounded-xl border border-border/60 bg-card/40 py-2 pl-10 pr-4 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary'
          />
        </div>

        {/* Filter Tabs */}
        <div className='flex items-center gap-1 overflow-x-auto rounded-xl border border-border/40 bg-muted/40 p-1 text-xs'>
          {(['all', 'online', 'trusted', 'desktops', 'mobile'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap rounded-lg px-3 py-1 text-xs font-bold capitalize transition-all ${
                activeTab === tab
                  ? 'border border-border/60 bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* View Mode Toggle */}
        <div className='flex items-center gap-1 rounded-xl border border-border/40 bg-muted/40 p-1'>
          <button
            onClick={() => setViewMode('grid')}
            className={`rounded-lg p-1.5 transition-all ${
              viewMode === 'grid'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            }`}
            title='Grid View'
          >
            <Grid className='h-4 w-4' />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`rounded-lg p-1.5 transition-all ${
              viewMode === 'table'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            }`}
            title='Table View'
          >
            <List className='h-4 w-4' />
          </button>
        </div>
      </div>

      {/* Content Rendering */}
      {filteredDevices.length === 0 ? (
        <div className='rounded-2xl border border-dashed border-hairline/10 p-12 text-center space-y-3'>
          <Monitor className='mx-auto h-10 w-10 text-muted-foreground/40' />
          <p className='text-sm font-bold text-foreground'>
            {devices.length === 0 ? 'No devices paired yet' : 'No devices match your filter'}
          </p>
          <p className='mx-auto max-w-sm text-xs text-muted-foreground'>
            {devices.length === 0
              ? 'Share a code with anyone. Pair the devices you own: open MeshDrop on your other device and enter the code shown here (or scan its QR code). Paired devices can send files and sync folders directly.'
              : 'Try adjusting your search query or filter category.'}
          </p>
          {devices.length === 0 && (
            <Button onClick={() => setPairOpen(true)} className='mt-1 gap-2 text-xs font-bold'>
              <Plus className='h-4 w-4' /> Pair New Device
            </Button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Layout */
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
          {filteredDevices.map((dev) => (
            <DeviceCard
              key={dev.id}
              device={dev}
              onSend={(d) => d.isOnline && sendFileToDevice(d)}
              onSendDrop={handleSendDrop}
              onViewDetails={setInspectingDevice}
              onToggleTrust={(d) => toggleTrustDevice(d.id)}
              onToggleFavorite={(d) => toggleFavoriteDevice(d.id)}
              onRemove={setRemoveTarget}
            />
          ))}
        </div>
      ) : (
        /* Table Layout */
        <Card className='glass-card overflow-hidden border-border/60'>
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-xs'>
              <thead className='border-b border-border/50 bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                <tr>
                  <th className='p-3.5'>Device</th>
                  <th className='p-3.5'>Status</th>
                  <th className='p-3.5'>Network Type</th>
                  <th className='p-3.5'>IP Address</th>
                  <th className='p-3.5'>Latency</th>
                  <th className='p-3.5 text-right'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border/30 font-medium'>
                {filteredDevices.map((dev) => (
                  <tr
                    key={dev.id}
                    className='transition-colors hover:bg-card/60'
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setRowMenu({ device: dev, x: e.clientX, y: e.clientY })
                    }}
                  >
                    <td className='p-3.5'>
                      <div className='flex items-center gap-2.5'>
                        <DeviceAvatar name={dev.name} os={dev.os} size='sm' />
                        <div>
                          <p className='flex items-center gap-1 font-bold text-foreground'>
                            {dev.name}
                            {dev.isTrusted && <ShieldCheck className='h-3 w-3 text-primary' />}
                          </p>
                          <p className='text-[10px] text-muted-foreground'>{dev.osVersion || dev.os || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className='p-3.5'>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                          dev.isOnline ? 'text-status-online' : 'text-muted-foreground'
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            dev.isOnline ? 'bg-status-online' : 'bg-muted-foreground/40'
                          }`}
                        />
                        {dev.isOnline ? 'Online' : 'Offline'}
                        {dev.relayed && (
                          <span className='ml-1 rounded-full bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] font-bold text-muted-foreground'>
                            relay
                          </span>
                        )}
                      </span>
                    </td>
                    <td className='p-3.5 font-mono text-[10px] uppercase text-muted-foreground'>
                      {(dev.networkType && (NETWORK_LABEL[dev.networkType] || dev.networkType.replace('_', ' '))) || 'Direct'}
                    </td>
                    <td className='p-3.5 font-mono text-foreground'>{dev.ipAddress || '—'}</td>
                    <td className='p-3.5 font-mono font-bold text-status-online'>
                      {dev.isOnline ? (dev.latencyMs != null ? `${dev.latencyMs} ms` : '—') : '—'}
                    </td>
                    <td className='space-x-2 p-3.5 text-right'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => setInspectingDevice(dev)}
                        className='h-7 text-xs'
                      >
                        Details
                      </Button>
                      <Button
                        size='sm'
                        disabled={!dev.isOnline}
                        onClick={() => sendFileToDevice(dev)}
                        className='h-7 gap-1 text-xs font-bold'
                      >
                        Send Files
                        <ArrowRight className='h-3 w-3' />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pair Device Modal */}
      <PairDeviceModal isOpen={pairOpen} onClose={() => setPairOpen(false)} defaultTab='pair' />

      {/* Remove Confirmation */}
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.name ?? 'Device'}?`}
        description='The device will be unpaired and removed from your device list. This cannot be undone.'
        confirmLabel='Remove Device'
        onConfirm={() => removeTarget && removeDevice(removeTarget.id)}
      />

      {/* Table Row Context Menu */}
      {rowMenu && (
        <ContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          onClose={() => setRowMenu(null)}
          items={rowMenuItems(rowMenu.device)}
        />
      )}
    </div>
  )
}
