import React, { useState, useEffect, useCallback } from 'react'
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
  Loader2,
  Radio,
} from 'lucide-react'
import { PortableInstallModal } from '@/components/PortableInstallModal'
import { useTheme } from '@/hooks/useTheme'
import { useToast } from '@/hooks/useToast'
import { useDevices } from '@/hooks/useDevices'
import { call, on } from '@/lib/ipc'
import { METHODS, EVENTS } from '@/types/protocol'
import { formatBytes } from '@/lib/format'
import {
  capabilities,
  checkForUpdates as capCheckForUpdates,
  downloadUpdate as capDownloadUpdate,
  onUpdateStatus,
  pickFolder as pickFolderCap,
  portableStatus,
  quitAndInstall,
  setContextMenuEnabled,
  setUpdateChannel,
} from '@/lib/capabilities'
import type { PortableStatus, UpdateStatusData } from '@/types/bridge'
import { Button } from '@/ui/primitives/Button'
import { Card, CardContent } from '@/ui/primitives/Card'
import { Modal } from '@/components/Modal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/ui/primitives/Skeleton'

type UpdateChannel = 'stable' | 'beta' | 'nightly' | 'dev'

const isDevBuild = import.meta.env.DEV

interface AppSettings {
  theme: 'dark' | 'light'
  deviceName: string
  autoTrustLAN: boolean
  autoLanSwitch: boolean
  autoAcceptOffers: boolean
  preferOwnRelay: boolean
  relayForPairedDevices: boolean
  noiseEncryption: boolean
  autoUpdate: boolean
  releaseChannel: string
  notifications: { transfer: boolean; device: boolean; sound: boolean }
  downloadDir: string | null
  launchAtStartup: boolean
  startMinimized: boolean
  contextMenu: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  deviceName: '',
  autoTrustLAN: false,
  autoLanSwitch: true,
  autoAcceptOffers: true,
  preferOwnRelay: true,
  relayForPairedDevices: true,
  noiseEncryption: true,
  autoUpdate: true,
  releaseChannel: 'stable',
  notifications: { transfer: true, device: true, sound: false },
  downloadDir: null,
  launchAtStartup: false,
  startMinimized: true,
  contextMenu: true,
}

function ThemePreviewChip({
  theme,
  active,
  onClick,
}: {
  theme: 'dark' | 'light'
  active: boolean
  onClick: () => void
}) {
  const isDark = theme === 'dark'
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`group flex flex-1 items-stretch gap-0 overflow-hidden rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 ${
        active ? 'border-primary ring-1 ring-primary/20' : 'border-border/60 hover:border-border'
      }`}
    >
      <span className={`flex flex-1 items-center gap-3 p-4 ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}`}>
        {isDark ? <Moon className="h-5 w-5 shrink-0 text-primary" /> : <Sun className="h-5 w-5 shrink-0 text-amber-500" />}
        <span className="min-w-0">
          <span className="block text-xs font-bold leading-none">{isDark ? 'Dark' : 'Light'}</span>
          <span className="block text-[11px] leading-none opacity-70">{isDark ? 'Dimmed surfaces' : 'Bright surfaces'}</span>
        </span>
      </span>
      <span className={`flex w-[92px] shrink-0 flex-col gap-1.5 p-3 ${isDark ? 'bg-slate-800' : 'bg-slate-50'}`}>
        <span className={`h-2 w-10 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
        <span className={`h-2 w-14 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
        <span className={`mt-1 inline-flex h-6 w-full items-center justify-center rounded-full text-[10px] font-bold ${isDark ? 'bg-primary text-white' : 'bg-primary text-white'}`}>
          Preview
        </span>
      </span>
    </button>
  )
}

export function Settings() {
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const { identity } = useDevices()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [savedSettings, setSavedSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const isDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)

  useEffect(() => {
    call(METHODS.SETTINGS_GET, null)
      .then((res: unknown) => {
        if (res && typeof res === 'object') {
          const merged = { ...DEFAULT_SETTINGS, ...(res as Record<string, unknown>) }
          setSettings(merged as AppSettings)
          setSavedSettings(merged as AppSettings)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    const unsub = on(EVENTS.SETTINGS_UPDATED, (data: unknown) => {
      if (data && typeof data === 'object') {
        setSettings((prev) => ({ ...prev, ...(data as Record<string, unknown>) } as AppSettings))
        setSavedSettings((prev) => ({ ...prev, ...(data as Record<string, unknown>) } as AppSettings))
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const persistPartial = useCallback(
    async (patch: Partial<AppSettings>, prev: AppSettings) => {
      try {
        await call(METHODS.SETTINGS_UPDATE, patch)
      } catch (err: unknown) {
        setSettings(prev)
        toast.error('Save Failed', (err as Error)?.message || 'Could not save setting.')
      }
    },
    [toast],
  )

  const set = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value }
        persistPartial({ [key]: value } as Partial<AppSettings>, prev)
        return next
      })
    },
    [persistPartial],
  )

  const handleSave = async () => {
    try {
      await call(METHODS.SETTINGS_UPDATE, settings)
      setSavedSettings(settings)
      if (settings.theme !== theme) setTheme(settings.theme)
      toast.success('Settings Saved', 'Your preferences were saved.')
    } catch (err: unknown) {
      toast.error('Save Failed', (err as Error)?.message || 'Could not save settings.')
    }
  }

  const handleThemeSelect = (t: 'dark' | 'light') => {
    const prev = settings
    setSettings((p) => ({ ...p, theme: t }))
    setTheme(t)
    persistPartial({ theme: t } as Partial<AppSettings>, prev)
  }

  const [updateStatus, setUpdateStatus] = useState<UpdateStatusData | null>(null)
  const [checking, setChecking] = useState(false)
  const [portableInfo, setPortableInfo] = useState<PortableStatus | null>(null)
  const [showPortableModal, setShowPortableModal] = useState(false)

  const handleChannelChange = (newChannel: UpdateChannel) => {
    if (newChannel === 'dev') {
      if (!isDevBuild) return
      set('releaseChannel', 'dev')
      setUpdateChannel('dev')
      toast.success('Dev Channel Enabled', 'Switched to Developer pre-release updates.')
      return
    }
    set('releaseChannel', newChannel)
    setUpdateChannel(newChannel)
    toast.success('Channel Switched', `Switched update channel to ${newChannel}.`)
  }

  useEffect(() => {
    portableStatus().then(setPortableInfo).catch(() => {})
  }, [])

  useEffect(() => {
    const unsub = onUpdateStatus((data) => {
      setUpdateStatus(data)
      if (data.status === 'error' && data.message) toast.error('Update Failed', data.message)
    })
    return () => unsub()
  }, [toast])

  const handleCheckForUpdates = async () => {
    setChecking(true)
    try {
      const res = await capCheckForUpdates()
      setUpdateStatus(res as UpdateStatusData)
      if ((res as UpdateStatusData)?.status === 'unconfigured') {
        toast.info('Updates Not Configured', (res as UpdateStatusData).message || 'No release feed is set for this build.')
      }
    } catch (err: unknown) {
      toast.error('Update Check Failed', (err as Error)?.message || 'Could not check for updates.')
    } finally {
      setChecking(false)
    }
  }

  const handleDownloadUpdate = async () => {
    try {
      await capDownloadUpdate()
    } catch (err: unknown) {
      toast.error('Download Failed', (err as Error)?.message || 'Could not start the update download.')
    }
  }

  const handleQuitAndInstall = async () => {
    try {
      await quitAndInstall()
    } catch (err: unknown) {
      toast.error('Install Failed', (err as Error)?.message || 'Could not restart to install the update.')
    }
  }

  const persistDownloadDir = async (dir: string | null) => {
    const prev = settings.downloadDir
    set('downloadDir', dir)
    try {
      await call(METHODS.SETTINGS_UPDATE, { downloadDir: dir })
      toast.success('Download Directory Set', dir ?? 'Received files will use the default app folder.')
    } catch (err: unknown) {
      set('downloadDir', prev)
      toast.error('Save Failed', (err as Error)?.message || 'Could not save the download directory.')
    }
  }

  const handleChangeDirectory = async () => {
    try {
      const dir = await pickFolderCap()
      if (dir) await persistDownloadDir(dir)
    } catch (err: unknown) {
      toast.error('Folder Pick Failed', (err as Error)?.message || 'Could not open the folder picker.')
    }
  }

  const copyWithFeedback = async (text: string, okTitle: string, okBody: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(okTitle, okBody)
    } catch {
      toast.error('Copy Failed', 'Could not copy to clipboard.')
    }
  }

  const updateMeta: Record<UpdateStatusData['status'], { title: string; styles: string; icon: React.ReactNode }> = {
    checking: { title: 'Checking for updates…', styles: 'border-primary/20 bg-primary/10', icon: <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" /> },
    update_available: { title: 'Update available', styles: 'border-primary/20 bg-primary/10', icon: <Download className="h-3.5 w-3.5 text-primary" /> },
    up_to_date: { title: "You're up to date", styles: 'border-status-online/30 bg-status-online/10', icon: <Check className="h-3.5 w-3.5 text-status-online" /> },
    downloading: { title: 'Downloading update…', styles: 'border-primary/20 bg-primary/10', icon: <Download className="h-3.5 w-3.5 text-primary" /> },
    downloaded: { title: 'Update ready to install', styles: 'border-status-online/30 bg-status-online/10', icon: <Rocket className="h-3.5 w-3.5 text-status-online" /> },
    error: { title: 'Update failed', styles: 'border-destructive/30 bg-destructive/10', icon: <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> },
    unconfigured: { title: 'Updates not configured', styles: 'border-border/40 bg-muted/20', icon: <Info className="h-3.5 w-3.5 text-muted-foreground" /> },
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Changes save automatically as you make them.</p>
        <Button onClick={handleSave} disabled={loading || !isDirty} className="h-9 gap-2 text-xs font-bold">
          <Check className="h-4 w-4" />
          {isDirty ? 'Save Changes' : 'Up to date'}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton shape="card" className="h-40" />
          <Skeleton shape="card" className="h-40" />
        </div>
      ) : (
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="general" className="gap-2">
              <Sliders className="h-3.5 w-3.5" /> General
            </TabsTrigger>
            <TabsTrigger value="network" className="gap-2">
              <Radio className="h-3.5 w-3.5" /> Network
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-2">
              <Moon className="h-3.5 w-3.5" /> Appearance
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-3.5 w-3.5" /> Security
            </TabsTrigger>
            {capabilities.updates && (
              <TabsTrigger value="updates" className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Updates
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="general" className="space-y-4 pt-4">
            <Card>
              <CardContent className="space-y-4 p-5 sm:p-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground" htmlFor="device-name">
                    Device name
                  </label>
                  <input
                    id="device-name"
                    type="text"
                    value={settings.deviceName}
                    onChange={(e) => set('deviceName', e.target.value)}
                    placeholder="Leave blank to use the system hostname"
                    className="w-full max-w-md rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-2 border-t border-border/40 pt-4">
                  <div>
                    <p className="text-xs font-bold text-foreground">Download directory</p>
                    <p className="text-[11px] text-muted-foreground">Where received files are saved. Leave unset to use the default app folder.</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 truncate rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {settings.downloadDir || 'Default location (inside app data)'}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-semibold" onClick={handleChangeDirectory}>
                        <FolderOpen className="h-3.5 w-3.5" />
                        Change
                      </Button>
                      {settings.downloadDir && (
                        <Button variant="ghost" size="sm" className="h-9 text-xs font-semibold text-muted-foreground hover:text-destructive" onClick={() => persistDownloadDir(null)}>
                          Reset
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 border-t border-border/40 pt-4">
                  <div>
                    <p className="text-xs font-bold text-foreground">System & startup</p>
                    <p className="text-[11px] text-muted-foreground">Background behavior and OS integration.</p>
                  </div>
                  <div className="space-y-4 text-xs">
                    {capabilities.autostart && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">Launch on system startup</p>
                          <p className="text-[11px] text-muted-foreground">Start MeshDrop Go when you log in.</p>
                        </div>
                        <Switch checked={settings.launchAtStartup} onCheckedChange={(v) => set('launchAtStartup', v)} aria-label="Launch MeshDrop Go on system startup" />
                      </div>
                    )}
                    {capabilities.tray && (
                      <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">Start minimized to tray</p>
                          <p className="text-[11px] text-muted-foreground">Launch quietly without opening the window.</p>
                        </div>
                        <Switch checked={settings.startMinimized} onCheckedChange={(v) => set('startMinimized', v)} aria-label="Start minimized to system tray" />
                      </div>
                    )}
                    {capabilities.contextMenu && (
                      <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">Explorer context menu</p>
                          <p className="text-[11px] text-muted-foreground">Add “Send via MeshDrop Go” to the file manager right-click menu.</p>
                        </div>
                        <Switch
                          checked={settings.contextMenu !== false}
                          onCheckedChange={(v) => {
                            set('contextMenu', v)
                            void setContextMenuEnabled(v)
                          }}
                          aria-label="Explorer context menu integration"
                        />
                      </div>
                    )}
                    {!capabilities.autostart && !capabilities.tray && !capabilities.contextMenu && (
                      <p className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground">Startup and OS integration are managed by the host in web mode.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="network" className="space-y-4 pt-4">
            <Card>
              <CardContent className="space-y-5 p-5 sm:p-6">
                <div>
                  <h3 className="text-xs font-bold text-foreground">Network transport</h3>
                  <p className="text-[11px] text-muted-foreground">How MeshDrop Go reaches peers and when it relays.</p>
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Relay through my paired devices</p>
                    <p className="text-[11px] text-muted-foreground">Allow paired devices to relay through this desktop when direct hole-punch fails. Turn off to close relay sessions.</p>
                    <RelayStats />
                  </div>
                  <Switch checked={settings.relayForPairedDevices !== false} onCheckedChange={(v) => set('relayForPairedDevices', v)} aria-label="Relay connections for my paired devices" />
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Prefer my devices as relay</p>
                    <p className="text-[11px] text-muted-foreground">When direct UDP hole-punching fails, tunnel through your own online desktop before public bootstrap nodes.</p>
                  </div>
                  <Switch checked={settings.preferOwnRelay !== false} onCheckedChange={(v) => set('preferOwnRelay', v)} aria-label="Prefer own devices as relay" />
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Prefer direct LAN</p>
                    <p className="text-[11px] text-muted-foreground">When a relayed peer is discovered on your local network, reconnect over LAN automatically.</p>
                  </div>
                  <Switch checked={settings.autoLanSwitch !== false} onCheckedChange={(v) => set('autoLanSwitch', v)} aria-label="Prefer direct LAN when available" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-4 pt-4">
            <Card>
              <CardContent className="space-y-4 p-5 sm:p-6">
                <div>
                  <h3 className="text-xs font-bold text-foreground">Color theme</h3>
                  <p className="text-[11px] text-muted-foreground">Pick the interface palette. Preview chips show the look before you switch.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <ThemePreviewChip theme="dark" active={settings.theme === 'dark'} onClick={() => handleThemeSelect('dark')} />
                  <ThemePreviewChip theme="light" active={settings.theme === 'light'} onClick={() => handleThemeSelect('light')} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-4 pt-4">
            <Card>
              <CardContent className="space-y-4 p-5 sm:p-6 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">Auto-trust local LAN devices</p>
                    <p className="text-[11px] text-muted-foreground">Trust every device on your local network without a pairing code. Only enable on networks you fully control.</p>
                  </div>
                  <Switch checked={settings.autoTrustLAN} onCheckedChange={(v) => set('autoTrustLAN', v)} aria-label="Auto-trust local LAN devices" />
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">Auto-accept incoming files</p>
                    <p className="text-[11px] text-muted-foreground">Receive from trusted devices without asking. Turn off to approve every incoming file.</p>
                  </div>
                  <Switch checked={settings.autoAcceptOffers} onCheckedChange={(v) => set('autoAcceptOffers', v)} aria-label="Auto-accept incoming files" />
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">Prefer my devices as relay</p>
                    <p className="text-[11px] text-muted-foreground">Private to your mesh — only your paired devices can use your relay.</p>
                  </div>
                  <Switch checked={settings.preferOwnRelay} onCheckedChange={(v) => set('preferOwnRelay', v)} aria-label="Prefer own devices as relay" />
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">Noise XX end-to-end encryption</p>
                    <p className="text-[11px] text-muted-foreground">Authenticated key exchange — always on.</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 font-bold text-meshdrop-cyan">
                    <Lock className="h-3.5 w-3.5" /> Enforced
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-5 sm:p-6 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-bold text-foreground">
                      <KeyRound className="h-3.5 w-3.5 text-primary" /> Keypair & identity
                    </p>
                    <p className="text-[11px] text-muted-foreground">Your public key — share it to verify a peer. Private key never leaves this device.</p>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <Fingerprint className="h-3.5 w-3.5 text-meshdrop-cyan" /> Public key
                    </span>
                    <button
                      onClick={() => copyWithFeedback(identity.publicKey || '', 'Public Key Copied', 'Identity key copied to clipboard.')}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                    >
                      <ClipboardCopy className="h-3 w-3" /> Copy
                    </button>
                  </div>
                  <p className="break-all font-mono text-[11px] text-muted-foreground" title={identity.publicKey}>
                    {identity.publicKey || 'Loading…'}
                  </p>
                  <div className="border-t border-border/30 pt-2 font-mono text-[10px] text-muted-foreground">device-id: {identity.id || '—'}</div>
                </div>

                <div className="flex flex-col gap-3 border-t border-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-prose text-[11px] leading-relaxed text-muted-foreground">Export a JSON snapshot of your public identity (device ID, public key, pairing code) — safe to share for verification.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 shrink-0 gap-1.5 text-xs font-bold"
                    onClick={() => {
                      const payload = { app: 'MeshDrop Go', deviceId: identity.id, name: identity.name, publicKey: identity.publicKey, pairingCode: identity.pairingCode }
                      copyWithFeedback(JSON.stringify(payload, null, 2), 'Identity Exported', 'Public identity JSON copied to clipboard.')
                    }}
                  >
                    <Download className="h-3.5 w-3.5 text-primary" />
                    Export identity
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {capabilities.updates && (
            <TabsContent value="updates" className="space-y-4 pt-4">
              <Card>
                <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground">Release channel</p>
                    <p className="text-[11px] text-muted-foreground">Select the distribution channel for updates.</p>
                  </div>
                  <select
                    value={settings.releaseChannel}
                    onChange={(e) => handleChannelChange(e.target.value as UpdateChannel)}
                    className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary sm:w-auto"
                  >
                    <option value="stable">Stable</option>
                    {isDevBuild && <option value="dev">Dev pre-release</option>}
                    <option value="beta">Beta</option>
                    <option value="nightly">Nightly</option>
                  </select>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-4 p-5 sm:p-6 text-xs">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">Software updates</p>
                      <p className="text-[11px] text-muted-foreground">Check for new releases and install them.</p>
                    </div>
                    <Button onClick={handleCheckForUpdates} disabled={checking || updateStatus?.status === 'downloading'} className="h-9 shrink-0 gap-1.5 text-xs font-bold">
                      {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {checking ? 'Checking…' : 'Check for updates'}
                    </Button>
                  </div>

                  {updateStatus && (
                    <div className={`space-y-2.5 rounded-xl border p-3 ${updateMeta[updateStatus.status].styles}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-bold text-foreground">
                          {updateMeta[updateStatus.status].icon}
                          {updateMeta[updateStatus.status].title}
                        </span>
                        {updateStatus.version && <span className="font-mono text-[10px] text-muted-foreground">v{updateStatus.version}</span>}
                      </div>
                      {updateStatus.message && <p className="text-[11px] text-muted-foreground">{updateStatus.message}</p>}
                      {updateStatus.status === 'downloading' && (
                        <div className="space-y-1">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, updateStatus.percent || 0))}%` }} />
                          </div>
                          <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                            <span>{Math.round(updateStatus.percent || 0)}%</span>
                            <span>
                              {formatBytes(updateStatus.transferred ?? 0)} / {formatBytes(updateStatus.total ?? 0)}
                            </span>
                          </div>
                        </div>
                      )}
                      {updateStatus.status === 'update_available' && (
                        <Button size="sm" className="gap-1.5 text-xs font-bold" onClick={handleDownloadUpdate}>
                          <Download className="h-3.5 w-3.5" />
                          Download update
                        </Button>
                      )}
                      {updateStatus.status === 'downloaded' && (
                        <Button size="sm" className="gap-1.5 text-xs font-bold" onClick={handleQuitAndInstall}>
                          <Rocket className="h-3.5 w-3.5" />
                          Restart to install
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">Auto-download updates</p>
                      <p className="text-[11px] text-muted-foreground">Download new versions in the background. Restarting stays your call.</p>
                    </div>
                    <Switch checked={settings.autoUpdate} onCheckedChange={(v) => set('autoUpdate', v)} />
                  </div>
                </CardContent>
              </Card>

              {portableInfo?.mode && (
                <Card>
                  <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">Portable mode</p>
                      <p className="text-[11px] text-muted-foreground">
                        {portableInfo.mode === 'sfx' ? 'Single-file portable — install to a folder for faster startup.' : 'Folder portable — data stays next to the app.'}
                      </p>
                      {portableInfo.dataDir && <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/80">{portableInfo.dataDir}</p>}
                    </div>
                    {portableInfo.installAvailable && (
                      <Button size="sm" className="h-9 shrink-0 gap-1.5 text-xs font-bold" onClick={() => setShowPortableModal(true)}>
                        <FolderDown className="h-3.5 w-3.5" />
                        Install to folder
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              <PortableInstallModal open={showPortableModal} onOpenChange={setShowPortableModal} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  )
}

function RelayStats() {
  const [stats, setStats] = React.useState<unknown>(null)
  const [unavailable, setUnavailable] = React.useState(false)
  React.useEffect(() => {
    let alive = true
    const fetch = () => {
      call((METHODS as unknown as Record<string, string>).RELAY_STATS ?? 'relay.stats', null)
        .then((s: unknown) => {
          if (alive) {
            setStats(s)
            setUnavailable(false)
          }
        })
        .catch(() => {
          if (alive && stats === null) setUnavailable(true)
        })
    }
    fetch()
    const id = setInterval(fetch, 4000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  if (!stats)
    return unavailable ? <p className="mt-1 text-[10px] text-muted-foreground">Relay statistics are not available on this device.</p> : null
  const s = stats as { active?: number; sessions?: { id: string; label: string; remotePrefix: string }[] }
  return (
    <div className="mt-2 text-[11px] text-muted-foreground">
      <span className="font-mono">{s.active || 0} relay session(s)</span>
      {s.sessions && s.sessions.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {s.sessions.slice(0, 8).map((sess) => (
            <li key={sess.id} className="font-mono text-[10px]">
              • {sess.label} — {sess.remotePrefix}…
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
