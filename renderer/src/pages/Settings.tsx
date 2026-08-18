import { useState, useEffect, useCallback } from 'react'
import {
  Sliders,
  Moon,
  Sun,
  Shield,
  RefreshCw,
  Check,
  Lock,
  Download,
  Rocket,
  AlertTriangle,
  Info,
  FolderOpen,
  Fingerprint,
  KeyRound,
  ClipboardCopy,
  FolderDown,
  Loader2
} from 'lucide-react'
import { PortableInstallModal } from '@/components/PortableInstallModal'
import { useTheme } from '@/hooks/useTheme'
import { useToast } from '@/hooks/useToast'
import { useDevices } from '@/hooks/useDevices'
import { call, on } from '@/lib/ipc'
import { METHODS, EVENTS } from '@/types/protocol'
import { formatBytes } from '@/lib/format'
import type { PortableStatus, UpdateStatusData } from '@/types/bridge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'

interface AppSettings {
  theme: 'dark' | 'light'
  deviceName: string
  autoTrustLAN: boolean
  /** @mesh/core auto-accept flag — inverted by the "Require Manual File Acceptance" toggle. */
  autoAcceptOffers: boolean
  /** Prefer an online paired desktop as relay before public bootstrap nodes. */
  preferOwnRelay: boolean
  noiseEncryption: boolean
  autoUpdate: boolean
  releaseChannel: string
  notifications: { transfer: boolean; device: boolean; sound: boolean }
  downloadDir: string | null
  launchAtStartup: boolean
  startMinimized: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  deviceName: '',
  autoTrustLAN: false,
  autoAcceptOffers: true,
  preferOwnRelay: false,
  noiseEncryption: true,
  autoUpdate: true,
  releaseChannel: 'stable',
  notifications: { transfer: true, device: true, sound: false },
  downloadDir: null,
  launchAtStartup: false,
  startMinimized: true
}

export function Settings() {
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const { identity } = useDevices()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    call(METHODS.SETTINGS_GET, null)
      .then((res: any) => {
        if (res && typeof res === 'object') setSettings({ ...DEFAULT_SETTINGS, ...res })
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    const unsub = on(EVENTS.SETTINGS_UPDATED, (data: any) => {
      if (data && typeof data === 'object') {
        setSettings((prev) => ({ ...prev, ...data }))
      }
    })

    return () => unsub()
  }, [])

  const set = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = async () => {
    try {
      await call(METHODS.SETTINGS_UPDATE, settings)
      if (settings.theme !== theme) setTheme(settings.theme)
      toast.success('Settings Saved', 'Your preferences were saved.')
    } catch (err: any) {
      toast.error('Save Failed', err?.message || 'Could not save settings.')
    }
  }

  const handleThemeSelect = (t: 'dark' | 'light') => {
    set('theme', t)
    setTheme(t)
  }

  const [updateStatus, setUpdateStatus] = useState<UpdateStatusData | null>(null)
  const [checking, setChecking] = useState(false)
  const [portableInfo, setPortableInfo] = useState<PortableStatus | null>(null)
  const [showPortableModal, setShowPortableModal] = useState(false)

  useEffect(() => {
    window.bridge?.portableStatus?.().then(setPortableInfo).catch(() => {})
  }, [])

  // Live updater progress/state pushed from the main process.
  useEffect(() => {
    const unsub = window.bridge?.onUpdateStatus?.((data) => {
      setUpdateStatus(data)
      if (data.status === 'error' && data.message) {
        toast.error('Update Failed', data.message)
      }
    })
    return () => unsub?.()
  }, [toast])

  const handleCheckForUpdates = async () => {
    if (!window.bridge?.checkForUpdates) {
      toast.error('Unavailable', 'Update checks are only available in the desktop app')
      return
    }
    setChecking(true)
    try {
      const res = await window.bridge.checkForUpdates()
      setUpdateStatus(res as UpdateStatusData)
      if (res?.status === 'unconfigured') {
        toast.info(
          'Updates Not Configured',
          res.message || 'No release feed is set for this build.'
        )
      }
    } catch (err: any) {
      toast.error('Update Check Failed', err?.message || 'Could not check for updates.')
    } finally {
      setChecking(false)
    }
  }

  const handleDownloadUpdate = async () => {
    try {
      await window.bridge?.downloadUpdate()
    } catch (err: any) {
      toast.error('Download Failed', err?.message || 'Could not start the update download.')
    }
  }

  const handleQuitAndInstall = async () => {
    try {
      await window.bridge?.quitAndInstall()
    } catch (err: any) {
      toast.error('Install Failed', err?.message || 'Could not restart to install the update.')
    }
  }

  const persistDownloadDir = async (dir: string | null) => {
    const prev = settings.downloadDir
    set('downloadDir', dir)
    try {
      await call(METHODS.SETTINGS_UPDATE, { downloadDir: dir })
      toast.success(
        'Download Directory Set',
        dir ?? 'Received files will use the default app folder.'
      )
    } catch (err: any) {
      set('downloadDir', prev)
      toast.error('Save Failed', err?.message || 'Could not save the download directory.')
    }
  }

  const handleChangeDirectory = async () => {
    if (!window.bridge?.openFolderDialog) {
      toast.error('Unavailable', 'Folder pickers are only available in the desktop app')
      return
    }
    try {
      const dir = await window.bridge.openFolderDialog()
      if (dir) await persistDownloadDir(dir)
    } catch (err: any) {
      toast.error('Folder Pick Failed', err?.message || 'Could not open the folder picker.')
    }
  }

  const updateMeta: Record<
    UpdateStatusData['status'],
    { title: string; styles: string; icon: React.ReactNode }
  > = {
    checking: {
      title: 'Checking for updates…',
      styles: 'border-primary/20 bg-primary/10',
      icon: <RefreshCw className='h-3.5 w-3.5 animate-spin text-primary' />
    },
    update_available: {
      title: 'Update available',
      styles: 'border-primary/20 bg-primary/10',
      icon: <Download className='h-3.5 w-3.5 text-primary' />
    },
    up_to_date: {
      title: "You're up to date",
      styles: 'border-status-online/30 bg-status-online/10',
      icon: <Check className='h-3.5 w-3.5 text-status-online' />
    },
    downloading: {
      title: 'Downloading update…',
      styles: 'border-primary/20 bg-primary/10',
      icon: <Download className='h-3.5 w-3.5 text-primary' />
    },
    downloaded: {
      title: 'Update ready to install',
      styles: 'border-status-online/30 bg-status-online/10',
      icon: <Rocket className='h-3.5 w-3.5 text-status-online' />
    },
    error: {
      title: 'Update failed',
      styles: 'border-destructive/30 bg-destructive/10',
      icon: <AlertTriangle className='h-3.5 w-3.5 text-destructive' />
    },
    unconfigured: {
      title: 'Updates not configured',
      styles: 'border-border/40 bg-muted/20',
      icon: <Info className='h-3.5 w-3.5 text-muted-foreground' />
    }
  }

  return (
    <div className='space-y-6 pb-12'>
      {/* Header */}
      <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
        <div>
          <h2 className='text-xl font-black text-foreground'>Security & Settings</h2>
          <p className='text-xs text-muted-foreground'>
            Configure how MeshDrop connects, stores files, and hardens your mesh.
          </p>
        </div>

        <Button onClick={handleSave} disabled={loading} className='font-bold text-xs gap-2'>
          <Check className='h-4 w-4' />
          Save Changes
        </Button>
      </div>

      {loading ? (
        <div className='space-y-4'>
          <Skeleton className='h-40 w-full rounded-2xl' />
          <Skeleton className='h-40 w-full rounded-2xl' />
        </div>
      ) : (
        <Tabs defaultValue='general' className='w-full'>
          <TabsList className='w-full justify-start overflow-x-auto'>
            <TabsTrigger value='general' className='gap-2'>
              <Sliders className='h-3.5 w-3.5' /> General
            </TabsTrigger>
            <TabsTrigger value='appearance' className='gap-2'>
              <Moon className='h-3.5 w-3.5' /> Appearance
            </TabsTrigger>
            <TabsTrigger value='security' className='gap-2'>
              <Shield className='h-3.5 w-3.5' /> Security
            </TabsTrigger>
            <TabsTrigger value='updates' className='gap-2'>
              <RefreshCw className='h-3.5 w-3.5' /> Updates
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value='general' className='space-y-4 pt-4'>
            <Card className='glass-card border-hairline/10'>
              <CardContent className='p-6 space-y-4'>
                <div className='space-y-1'>
                  <label className='text-xs font-bold text-foreground' htmlFor='device-name'>
                    Device Name
                  </label>
                  <input
                    id='device-name'
                    type='text'
                    value={settings.deviceName}
                    onChange={(e) => set('deviceName', e.target.value)}
                    placeholder='Leave blank to use the system hostname'
                    className='w-full max-w-md rounded-xl border border-border/60 bg-background px-4 py-2 text-xs font-bold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary'
                  />
                </div>

                {/* Download Directory */}
                <div className='space-y-2 border-t border-border/40 pt-4'>
                  <div>
                    <p className='text-xs font-bold text-foreground'>Download Directory</p>
                    <p className='text-[11px] text-muted-foreground'>
                      Where received files are saved. Leave unset to use the default app folder.
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    <div className='min-w-0 flex-1 truncate rounded-xl border border-border/60 bg-muted/20 px-3 py-2 font-mono text-[11px] text-muted-foreground'>
                      {settings.downloadDir || 'Default location (inside app data)'}
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-9 shrink-0 gap-1.5 text-xs font-semibold'
                      onClick={handleChangeDirectory}
                    >
                      <FolderOpen className='h-3.5 w-3.5' />
                      Change Directory
                    </Button>
                    {settings.downloadDir && (
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-9 shrink-0 text-xs font-semibold text-muted-foreground hover:text-destructive'
                        onClick={() => persistDownloadDir(null)}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </div>

                {/* System & Startup */}
                <div className='space-y-4 border-t border-border/40 pt-4'>
                  <div>
                    <p className='text-xs font-bold text-foreground'>System & Startup</p>
                    <p className='text-[11px] text-muted-foreground'>
                      Configure background behavior and operating system boot preferences.
                    </p>
                  </div>

                  <div className='space-y-4 text-xs'>
                    <div className='flex items-center justify-between'>
                      <div>
                        <p className='font-bold text-foreground'>Launch MeshDrop on system startup</p>
                        <p className='text-[11px] text-muted-foreground'>
                          Automatically start MeshDrop when you log in to your computer.
                        </p>
                      </div>
                      <Switch
                        checked={settings.launchAtStartup}
                        onCheckedChange={(v) => set('launchAtStartup', v)}
                        aria-label='Launch MeshDrop on system startup'
                      />
                    </div>

                    <div className='flex items-center justify-between border-t border-border/40 pt-3'>
                      <div>
                        <p className='font-bold text-foreground'>Start minimized to system tray</p>
                        <p className='text-[11px] text-muted-foreground'>
                          Launch quietly in the background without opening the main window.
                        </p>
                      </div>
                      <Switch
                        checked={settings.startMinimized}
                        onCheckedChange={(v) => set('startMinimized', v)}
                        aria-label='Start minimized to system tray'
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value='appearance' className='space-y-4 pt-4'>
            <Card className='glass-card border-hairline/10'>
              <CardContent className='p-6 space-y-4'>
                <div>
                  <h3 className='text-xs font-bold text-foreground'>Color Theme</h3>
                  <p className='text-[11px] text-muted-foreground'>
                    Select dark or light interface palette.
                  </p>
                </div>

                <div className='flex gap-4'>
                  <button
                    onClick={() => handleThemeSelect('dark')}
                    className={`flex flex-1 items-center gap-3 rounded-2xl border p-4 transition-all ${
                      settings.theme === 'dark'
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-border/60 text-muted-foreground'
                    }`}
                  >
                    <Moon className='h-5 w-5 text-primary' />
                    <div className='text-left'>
                      <p className='text-xs font-bold'>Dark Mode</p>
                      <p className='text-[10px] opacity-75'>Polished dark interface</p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleThemeSelect('light')}
                    className={`flex flex-1 items-center gap-3 rounded-2xl border p-4 transition-all ${
                      settings.theme === 'light'
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-border/60 text-muted-foreground'
                    }`}
                  >
                    <Sun className='h-5 w-5 text-amber-400' />
                    <div className='text-left'>
                      <p className='text-xs font-bold'>Light Mode</p>
                      <p className='text-[10px] opacity-75'>Clean light interface</p>
                    </div>
                  </button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value='security' className='space-y-4 pt-4'>
            <Card className='glass-card border-hairline/10'>
              <CardContent className='p-6 space-y-4 text-xs'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='font-bold text-foreground'>Auto-Trust Local LAN Devices</p>
                    <p className='text-[11px] text-muted-foreground'>
                      Trusts every device on your network without a pairing code. Only enable on
                      networks you fully control — otherwise devices must pair with a code.
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoTrustLAN}
                    onCheckedChange={(v) => set('autoTrustLAN', v)}
                    aria-label='Auto-trust local LAN devices'
                  />
                </div>

                <div className='flex items-center justify-between border-t border-hairline/10 pt-4'>
                  <div>
                    <p className='font-bold text-foreground'>Auto-accept Incoming Files</p>
                    <p className='text-[11px] text-muted-foreground'>
                      Receive files from trusted devices without asking. Turn off to approve every
                      incoming file.
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoAcceptOffers}
                    onCheckedChange={(v) => set('autoAcceptOffers', v)}
                    aria-label='Auto-accept incoming files'
                  />
                </div>

                <div className='flex items-center justify-between border-t border-hairline/10 pt-4'>
                  <div>
                    <p className='font-bold text-foreground'>Prefer My Devices as Relay</p>
                    <p className='text-[11px] text-muted-foreground'>
                      When a direct connection fails, tunnel through your own online desktop first
                      before falling back to public relays. Only your paired devices can use your
                      relay — it is private to your mesh.
                    </p>
                  </div>
                  <Switch
                    checked={settings.preferOwnRelay}
                    onCheckedChange={(v) => set('preferOwnRelay', v)}
                    aria-label='Prefer own devices as relay'
                  />
                </div>

                <div className='flex items-center justify-between border-t border-hairline/10 pt-4'>
                  <div>
                    <p className='font-bold text-foreground'>Noise XX End-to-End Encryption</p>
                    <p className='text-[11px] text-muted-foreground'>
                      Enforce authenticated cryptographic key exchange
                    </p>
                  </div>
                  <span className='text-meshdrop-cyan font-bold flex items-center gap-1'>
                    <Lock className='h-3.5 w-3.5' /> Enforced
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Public Key Inspector / Identity Export */}
            <Card className='glass-card border-hairline/10'>
              <CardContent className='p-6 space-y-4 text-xs'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='font-bold text-foreground flex items-center gap-1.5'>
                      <KeyRound className='h-3.5 w-3.5 text-primary' /> Keypair & Identity
                    </p>
                    <p className='text-[11px] text-muted-foreground'>
                      Your Noise_XX_25519 identity. Share the public key to verify a peer.
                    </p>
                  </div>
                </div>

                <div className='space-y-2 rounded-xl border border-hairline/10 bg-muted/20 p-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5'>
                      <Fingerprint className='h-3.5 w-3.5 text-meshdrop-cyan' /> Public Key
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(identity.publicKey || '')
                        toast.success('Public Key Copied', 'Identity key copied to clipboard.')
                      }}
                      className='flex items-center gap-1 text-[11px] font-bold text-primary hover:underline'
                    >
                      <ClipboardCopy className='h-3 w-3' /> Copy
                    </button>
                  </div>
                  <p
                    className='break-all font-mono text-[11px] text-muted-foreground'
                    title={identity.publicKey}
                  >
                    {identity.publicKey || 'Loading…'}
                  </p>
                  <div className='flex items-center justify-between border-t border-hairline/10 pt-2'>
                    <span className='font-mono text-[10px] text-muted-foreground'>
                      device-id: {identity.id || '—'}
                    </span>
                  </div>
                </div>

                <div className='flex items-center justify-between gap-3 border-t border-hairline/10 pt-4'>
                  <p className='text-[11px] text-muted-foreground leading-relaxed'>
                    Export a JSON snapshot of your public identity (device ID, public key, current
                    pairing code) — safe to share with peers for verification. The private key never
                    leaves this device.
                  </p>
                  <Button
                    size='sm'
                    variant='outline'
                    className='h-9 shrink-0 gap-1.5 text-xs font-bold border-hairline/10 hover:border-primary/40'
                    onClick={() => {
                      const payload = {
                        app: 'MeshDrop',
                        deviceId: identity.id,
                        name: identity.name,
                        publicKey: identity.publicKey,
                        pairingCode: identity.pairingCode
                      }
                      navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                      toast.success(
                        'Identity Exported',
                        'Public identity JSON copied to clipboard.'
                      )
                    }}
                  >
                    <Download className='h-3.5 w-3.5 text-primary' />
                    Export Identity
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Updates Tab */}
          <TabsContent value='updates' className='space-y-4 pt-4'>
            <Card className='glass-card border-hairline/10'>
              <CardContent className='p-6 space-y-4 text-xs'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='font-bold text-foreground'>Release Channel</p>
                    <p className='text-[11px] text-muted-foreground'>
                      Select release distribution channel
                    </p>
                  </div>
                  <select
                    value={settings.releaseChannel}
                    onChange={(e) => set('releaseChannel', e.target.value)}
                    className='rounded-xl border border-border/60 bg-background px-3 py-1.5 font-bold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary'
                  >
                    <option value='stable'>Stable Release</option>
                    <option value='beta'>Beta Channel</option>
                    <option value='nightly'>Nightly Builds</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Software Updates */}
            <Card className='glass-card border-hairline/10'>
              <CardContent className='p-6 space-y-4 text-xs'>
                <div className='flex items-center justify-between gap-4'>
                  <div>
                    <p className='font-bold text-foreground'>Software Updates</p>
                    <p className='text-[11px] text-muted-foreground'>
                      Check for new releases and install them automatically.
                    </p>
                  </div>
                  <Button
                    onClick={handleCheckForUpdates}
                    disabled={checking || updateStatus?.status === 'downloading'}
                    className='h-9 shrink-0 gap-1.5 text-xs font-bold'
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
                    {checking ? 'Checking…' : 'Check for Updates'}
                  </Button>
                </div>

                {updateStatus && (
                  <div
                    className={`space-y-2.5 rounded-xl border p-3 ${updateMeta[updateStatus.status].styles}`}
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <span className='flex items-center gap-1.5 font-bold text-foreground'>
                        {updateMeta[updateStatus.status].icon}
                        {updateMeta[updateStatus.status].title}
                      </span>
                      {updateStatus.version && (
                        <span className='font-mono text-[10px] text-muted-foreground'>
                          v{updateStatus.version}
                        </span>
                      )}
                    </div>

                    {updateStatus.message && (
                      <p className='text-[11px] text-muted-foreground'>{updateStatus.message}</p>
                    )}

                    {updateStatus.status === 'downloading' && (
                      <div className='space-y-1'>
                        <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted/60'>
                          <div
                            className='h-full rounded-full bg-primary transition-all'
                            style={{
                              width: `${Math.max(0, Math.min(100, updateStatus.percent || 0))}%`
                            }}
                          />
                        </div>
                        <div className='flex items-center justify-between font-mono text-[10px] text-muted-foreground'>
                          <span>{Math.round(updateStatus.percent || 0)}%</span>
                          <span>
                            {formatBytes(updateStatus.transferred ?? 0)} /{' '}
                            {formatBytes(updateStatus.total ?? 0)}
                          </span>
                        </div>
                      </div>
                    )}

                    {updateStatus.status === 'update_available' && (
                      <Button
                        size='sm'
                        className='gap-1.5 text-xs font-bold'
                        onClick={handleDownloadUpdate}
                      >
                        <Download className='h-3.5 w-3.5' />
                        Download Update
                      </Button>
                    )}

                    {updateStatus.status === 'downloaded' && (
                      <Button
                        size='sm'
                        className='gap-1.5 text-xs font-bold'
                        onClick={handleQuitAndInstall}
                      >
                        <Rocket className='h-3.5 w-3.5' />
                        Restart to Install
                      </Button>
                    )}
                  </div>
                )}

                <div className='flex items-center justify-between gap-3 border-t border-hairline/10 pt-4'>
                  <div>
                    <p className='font-bold text-foreground'>Auto-download updates</p>
                    <p className='text-[11px] text-muted-foreground'>
                      Background-check and download new versions automatically. Restarting to install
                      always stays your call.
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoUpdate}
                    onCheckedChange={(v) => set('autoUpdate', v)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Portable Mode */}
            {portableInfo?.mode && (
              <Card className='glass-card border-hairline/10'>
                <CardContent className='p-6 space-y-4 text-xs'>
                  <div className='flex items-center justify-between gap-4'>
                    <div className='min-w-0'>
                      <p className='font-bold text-foreground'>Portable Mode</p>
                      <p className='text-[11px] text-muted-foreground'>
                        {portableInfo.mode === 'sfx'
                          ? 'Single-file portable — install to a folder for faster startup and file-level updates.'
                          : 'Folder portable — the app runs in place and data stays next to the app.'}
                      </p>
                      {portableInfo.dataDir && (
                        <p className='mt-1 truncate font-mono text-[10px] text-muted-foreground/80'>
                          {portableInfo.dataDir}
                        </p>
                      )}
                    </div>
                    {portableInfo.installAvailable && (
                      <Button
                        size='sm'
                        className='h-9 shrink-0 gap-1.5 text-xs font-bold'
                        onClick={() => setShowPortableModal(true)}
                      >
                        <FolderDown className='h-3.5 w-3.5' />
                        Install to Folder
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <PortableInstallModal open={showPortableModal} onOpenChange={setShowPortableModal} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
