import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
  Dimensions,
} from 'react-native'
import RNFS from 'react-native-fs'
import { Buffer } from 'buffer'
import {
  FolderOpen,
  KeyRound,
  Trash2,
  Folder,
  FileText,
  ArrowLeft,
  ArrowUp,
  HardDrive,
  RefreshCw,
  Globe,
  Inbox,
  X,
  ChevronRight,
  Download,
  FileVideo,
  FileImage,
  FileAudio,
} from 'lucide-react-native'
import { call, on } from '../bridge'
import { Card, Btn, Pill, SectionHeader, SimpleModal } from '../components'
import { MediaPlayer } from '../components/MediaPlayer'
import { useTheme, fonts } from '../theme'

const { width: winWidth, height: winHeight } = Dimensions.get('window')

interface ReceivedSite {
  siteId: string
  code: string
  name: string
  expiresAt?: number
  hostPeerId?: string
  addedAt?: number
  hostName?: string
  hostDeviceId?: string
}

interface ActiveVisit {
  siteId: string | null
  code: string | null
  name: string | null
  hostPeerId?: string | null
}

interface SiteEntry {
  name?: string
  path: string
  type: 'dir' | 'file'
  size?: number
  mtimeMs?: number
}

interface SiteStats {
  fileCount: number
  dirCount: number
  totalBytes: number
  newestMtimeMs: number
  partial?: boolean
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

function fmtDate(ms?: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// File-kind → lucide icon for light, dependency-free type signaling (mirrors
// the desktop FolderBrowser's per-extension coloring with a monochrome icon).
function entryIcon(type: string, name: string) {
  if (type === 'dir') return Folder
  const ext = (name || '').split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg'].includes(ext)) return FileImage
  if (['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', '3gp', 'ts', 'mpg', 'mpeg'].includes(ext)) return FileVideo
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus'].includes(ext)) return FileAudio
  return FileText
}

type PreviewKind = 'image' | 'video' | 'audio' | 'other'

function kindOf(name?: string): PreviewKind {
  const ext = (name || '').split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg', 'bmp'].includes(ext)) return 'image'
  if (['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', '3gp', 'ts', 'mpg', 'mpeg'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus', 'wma'].includes(ext)) return 'audio'
  return 'other'
}

/** Cache dir under the app files dir; shared-folder downloads land here. */
let cachedSiteCacheDir: string | null = null
async function getSiteCacheDir(): Promise<string> {
  if (cachedSiteCacheDir) return cachedSiteCacheDir
  try {
    const res = await call<{ path: string }>('sites.cacheDir')
    if (res && res.path) cachedSiteCacheDir = res.path
  } catch {}
  return cachedSiteCacheDir || `${RNFS.DocumentDirectoryPath}/site-cache`
}


export function Folders() {
  const { theme } = useTheme()
  const [received, setReceived] = useState<ReceivedSite[]>([])
  const [visits, setVisits] = useState<ActiveVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [inviteBanner, setInviteBanner] = useState<ReceivedSite | null>(null)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [browseSite, setBrowseSite] = useState<ReceivedSite | null>(null)
  const browseSiteRef = useRef<ReceivedSite | null>(null)
  browseSiteRef.current = browseSite

  const openSiteIds = new Set(
    visits.filter((v) => v.siteId).map((v) => v.siteId as string)
  )
  const visitedCodes = new Set(
    visits.filter((v) => v.code).map((v) => v.code as string)
  )

  const refresh = useCallback(async () => {
    try {
      const [recv, activeVisits] = await Promise.all([
        call('sites.listReceived'),
        call('sites.activeVisits'),
      ])
      if (Array.isArray(recv)) setReceived(recv)
      if (Array.isArray(activeVisits)) setVisits(activeVisits)
    } catch {
      // Engine not ready yet or not connected — leave the current lists as-is.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const unsubInvite = on('site:invite:received', (data: any) => {
      refresh()
      if (data && (data.name || data.code)) setInviteBanner(data)
    })
    const unsubStarted = on('site:visit:started', () => refresh())
    const unsubStopped = on('site:visit:stopped', (data: any) => {
      refresh()
      const current = browseSiteRef.current
      const stoppedSiteId = data?.siteId || data?.code
      if (current && (stoppedSiteId === current.siteId || stoppedSiteId === current.code)) {
        Alert.alert('Folder Disconnected', 'The host is offline or closed this shared folder.')
        setBrowseSite(null)
      }
    })
    const unsubRefresh = on('shares:updated', refresh)
    return () => {
      unsubInvite()
      unsubStarted()
      unsubStopped()
      unsubRefresh()
    }
  }, [refresh])

  // Visit a share by SITE- code. "Already visiting" is a soft error — fall
  // back to the existing live visit instead of alarming the user.
  const openByCode = async (rawCode: string): Promise<ReceivedSite | null> => {
    const cleanCode = rawCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
    if (!cleanCode) return null
    const existing = visits.find(
      (v) => v.code === cleanCode && v.siteId
    )
    if (existing) {
      const rec = received.find((r) => r.siteId === existing.siteId)
      if (rec) return rec
    }
    setConnectingId(cleanCode)
    try {
      const res: any = await call('sites.visit', { code: cleanCode })
      await refresh()
      if (res && res.siteId) {
        return (
          received.find((r) => r.siteId === res.siteId) || {
            siteId: res.siteId,
            code: cleanCode,
            name: res.name || cleanCode,
            hostName: res.hostName || '',
          }
        )
      }
      // Visits may resolve with only code/name (host discovered async) — find
      // by code in the just-refreshed list.
      const recAfter = received.find(
        (r) => r.code === cleanCode || (res && res.siteId && r.siteId === res.siteId)
      )
      return recAfter || null
    } catch (err: any) {
      const msg = String((err as Error)?.message || err)
      if (/already|visiting/i.test(msg)) {
        // Re-list and retry the lookup after refresh.
        await refresh()
        return received.find((r) => r.code === cleanCode) || null
      }
      Alert.alert('Could Not Open', msg || 'Host may be offline — try again later.')
      return null
    } finally {
      setConnectingId(null)
    }
  }

  const handleOpenCard = async (site: ReceivedSite) => {
    if (openSiteIds.has(site.siteId)) {
      setBrowseSite(site)
      return
    }
    setConnectingId(site.siteId || site.code)
    try {
      await call('sites.visit', { code: site.code })
      await refresh()
      setBrowseSite(site)
    } catch (err: any) {
      Alert.alert('Could Not Open', String((err as Error)?.message || err) || 'Host may be offline — try again later.')
    } finally {
      setConnectingId(null)
    }
  }

  const handleCodeSubmit = async () => {
    const rec = await openByCode(codeInput)
    setShowCodeModal(false)
    setCodeInput('')
    if (rec) setBrowseSite(rec)
  }

  const handleRemove = (site: ReceivedSite) => {
    Alert.alert('Remove Shared Folder?', `"${site.name || site.code}" will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            if (site.siteId && openSiteIds.has(site.siteId)) {
              await call('sites.leave', { siteId: site.siteId })
            }
            await call('sites.removeReceived', { siteId: site.siteId })
            await refresh()
          } catch {
            Alert.alert('Remove Failed', 'Could not remove this share right now.')
          }
        },
      },
    ])
  }

  const openStatsSite = browseSite || received[0]
  const isOpen = !!openStatsSite && (openSiteIds.has(openStatsSite.siteId) || visitedCodes.has(openStatsSite.code))

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Top hero */}
      <View style={styles.heroWrap}>
        <View style={styles.heroInner}>
          <View style={[styles.heroIconBox, { backgroundColor: theme.primarySoft, borderColor: theme.primary + '35' }]}>
            <FolderOpen size={20} color={theme.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.heroTitle, { color: theme.text }]}>Shared Folders</Text>
            <Text style={[styles.heroSub, { color: theme.muted }]}>
              Browse folders shared by your devices
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setShowCodeModal(true)
              setCodeInput('')
            }}
            style={[styles.codeBtn, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
            activeOpacity={0.8}
          >
            <KeyRound size={14} color={theme.primary} />
            <Text style={[styles.codeBtnText, { color: theme.primary }]}>SITE Code</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.refreshRow} onPress={refresh} activeOpacity={0.7}>
          <RefreshCw size={11} color={theme.muted} />
          <Text style={[styles.refreshText, { color: theme.muted }]}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Invite banner */}
      {inviteBanner && (
        <View style={[styles.inviteBanner, { backgroundColor: theme.bgCard, borderColor: theme.primary + '35' }]}>
          <View style={[styles.inviteIconBox, { backgroundColor: theme.primarySoft }]}>
            <FolderOpen size={16} color={theme.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.inviteTitle, { color: theme.text }]} numberOfLines={1}>
              {inviteBanner.name || 'Shared folder'} — open it now
            </Text>
            <Text style={[styles.inviteSub, { color: theme.muted }]} numberOfLines={1}>
              {inviteBanner.hostName ? `Shared by ${inviteBanner.hostName}` : inviteBanner.code}
            </Text>
          </View>
          <TouchableOpacity
            onPress={async () => {
              setInviteBanner(null)
              await handleOpenCard(inviteBanner)
            }}
            style={[styles.openBtn, { backgroundColor: theme.primary }]}
            activeOpacity={0.85}
          >
            <Text style={styles.openBtnText}>Open</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setInviteBanner(null)} style={styles.inviteCloseBtn} activeOpacity={0.7}>
            <X size={14} color={theme.muted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Folder browser (full screen within tab) */}
      {browseSite ? (
        <FolderBrowserView
          site={browseSite}
          onBack={() => setBrowseSite(null)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <SectionHeader title="Shared with you" badge={received.length} />

          {loading ? (
            <Card style={[styles.emptyCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <ActivityIndicator color={theme.primary} style={{ marginBottom: 10 }} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Loading folders…</Text>
            </Card>
          ) : received.length === 0 ? (
            <Card style={[styles.emptyCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Inbox size={30} color={theme.muted} style={{ marginBottom: 10 }} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Nothing shared with you yet</Text>
            <Text style={[styles.emptySub, { color: theme.muted }]}>
              When a device allows you on one of its folders, it appears here. Or enter a
              SITE- code that was shared with you.
            </Text>
            <Btn
              label="Enter SITE Code"
              icon={KeyRound}
              variant="outline"
              onPress={() => setShowCodeModal(true)}
              style={{ marginTop: 14 }}
            />
          </Card>
          ) : (
            <View style={styles.list}>
              {received.map((site) => {
                const isOpenFor = !!(
                  (site.siteId && openSiteIds.has(site.siteId)) ||
                  visitedCodes.has(site.code)
                )
                return (
                  <TouchableOpacity
                    key={site.siteId || site.code}
                    activeOpacity={0.85}
                    onPress={() => handleOpenCard(site)}
                    style={[styles.siteCard, { backgroundColor: theme.bgCard, borderColor: isOpenFor ? theme.primary + '50' : theme.border }]}
                  >
                    <View style={[styles.siteIconBox, { backgroundColor: isOpenFor ? theme.primarySoft : theme.bgElevated }]}>
                      {connectingId === site.siteId || connectingId === site.code ? (
                        <ActivityIndicator color={theme.primary} size="small" />
                      ) : (
                        <FolderOpen size={18} color={isOpenFor ? theme.primary : theme.muted} />
                      )}
                    </View>
                    <View style={styles.flex1}>
                      <Text style={[styles.siteName, { color: theme.text }]} numberOfLines={1}>
                        {site.name || 'Shared folder'}
                      </Text>
                      <Text style={[styles.siteMeta, { color: theme.muted }]} numberOfLines={1}>
                        {site.hostName ? `Shared by ${site.hostName}` : 'Shared folder'} · {site.code}
                      </Text>
                      <View style={styles.siteStatusRow}>
                        {isOpenFor ? (
                          <Pill label="Connected" color={theme.success} dot />
                        ) : connectingId === site.siteId || connectingId === site.code ? (
                          <Pill label="Connecting…" color={theme.warning} />
                        ) : (
                          <Pill label="Not open" color={theme.muted} />
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemove(site)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.trashBtn}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={15} color={theme.danger} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          <Card style={[styles.infoCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={styles.infoRow}>
              <Globe size={14} color={theme.primary} />
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                Shared Folders stream straight from the host device — nothing is copied to
                this phone. The host must stay online while you browse.
              </Text>
            </View>
            <View style={styles.infoRow}>
              <HardDrive size={14} color={theme.primary} />
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                Unlike Sync, browsing a shared folder does not mirror the files locally.
              </Text>
            </View>
          </Card>
        </ScrollView>
      )}

      {/* Enter SITE Code modal */}
      <SimpleModal
        visible={showCodeModal}
        title="Visit a Shared Folder"
        subtitle="Enter the SITE- code shared with you"
        onClose={() => setShowCodeModal(false)}
      >
        <View style={styles.codeModalBody}>
          <TextInput
            value={codeInput}
            onChangeText={(t) => setCodeInput(t.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
            placeholder="SITE-ABCD-EFGH"
            placeholderTextColor={theme.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.codeInput, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
          />
          <Btn
            label="Connect"
            icon={KeyRound}
            variant="primary"
            onPress={handleCodeSubmit}
            disabled={!codeInput.trim()}
            loading={connectingId === codeInput.trim().toUpperCase()}
          />
        </View>
      </SimpleModal>
    </View>
  )
}

function FolderBrowserView({
  site,
  onBack,
}: {
  site: ReceivedSite
  onBack: () => void
}) {
  const { theme } = useTheme()
  const [path, setPath] = useState('/')
  const [entries, setEntries] = useState<SiteEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailFile, setDetailFile] = useState<SiteEntry | null>(null)
  const loadSeq = useRef(0)
  const siteId = site.siteId
  const hostName = site.hostName || 'Host'
  const pathRef = useRef(path)
  pathRef.current = path

  const load = useCallback(
    async (p: string) => {
      const seq = ++loadSeq.current
      setLoading(true)
      setError(null)
      try {
        const res = await call('sites.listPath', { path: p || '/', siteId })
        if (seq !== loadSeq.current) return
        setEntries(Array.isArray(res) ? res : [])
        setPath(p || '/')
      } catch (err: any) {
        if (seq !== loadSeq.current) return
        setError(String((err as Error)?.message || err) || 'Could not load folder')
      } finally {
        if (seq === loadSeq.current) setLoading(false)
      }
    },
    [siteId]
  )

  useEffect(() => {
    load('/')
    return () => {
      loadSeq.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId])

  const dirs = (entries || []).filter((e) => e && e.type === 'dir' && !!e.name)
  const files = (entries || []).filter((e) => e && e.type === 'file' && !!e.name)

  const [fetching, setFetching] = useState<SiteEntry | null>(null)
  const [fetchProgress, setFetchProgress] = useState<{ done: number; total: number } | null>(null)
  const [previewUri, setPreviewUri] = useState<{
    uri: string
    name: string
    kind: PreviewKind
    size?: number
    /** True once the full file is on disk. */
    isComplete?: boolean
    /** Bytes durably written so far (progressive path only). */
    written?: number
  } | null>(null)

  const openEntry = (entry: SiteEntry) => {
    if (entry.type === 'dir') {
      load(entry.path)
    } else {
      // Images / video / audio open a live preview (desktop parity: tap an
      // image to view it, tap media to play it). Everything else just shows
      // an info sheet (download-to-phone is a separate action).
      const k = kindOf(entry.name)
      if (k === 'image' || k === 'video' || k === 'audio') {
        handlePreview(entry)
      } else {
        setDetailFile(entry)
      }
    }
  }

  const goUp = () => {
    const parent = path.split('/').slice(0, -1).join('/') || '/'
    load(parent)
  }

  const crumbLabel = site.name || site.code

  // Local cache path for a site entry (stable across a preview + its save).
  const cachePathFor = (entry: SiteEntry, siteCache: string): string => {
    const safeName = (entry.name || 'file').replace(/[^\w.-]+/g, '_')
    const stamp = entry.mtimeMs ? `-${Math.round(entry.mtimeMs)}` : ''
    return `${siteCache}/${safeName}${stamp}`
  }

  // Progressive fetch of a whole file into the local site cache. The host
  // serves byte ranges; we pull it in bounded slices (base64 over the JSON
  // bridge) and assemble into a cache .part file, then hand the complete
  // local path to the native player / Image. Returns { uri, name, size }.
  const fetchFileToCache = async (
    entry: SiteEntry,
    onProgress?: (done: number, total: number) => void
  ): Promise<{ uri: string; size: number }> => {
    const siteCache = await getSiteCacheDir()
    await RNFS.mkdir(siteCache).catch(() => {})
    const dest = cachePathFor(entry, siteCache)

    // Reuse an already-fetched file.
    if (await RNFS.exists(dest)) {
      const st = await RNFS.stat(dest).catch(() => null)
      if (st && (!entry.size || st.size === entry.size)) {
        return { uri: `file://${dest}`, size: st.size }
      }
    }

    const tmp = `${dest}.part`
    await RNFS.unlink(tmp).catch(() => {})

    const total = entry.size || 0
    let received = 0
    const CHUNK = 512 * 1024 // 512 KiB per range request (bounded JSON frame)
    try {
      let fileSize = total
      for (let start = 0; ; start += CHUNK) {
        // The host clamps the requested end to size-1, so an open-ended range
        // against an unknown-size file still returns at most CHUNK bytes and
        // reveals the true file size on the first response.
        const end = fileSize ? Math.min(start + CHUNK - 1, fileSize - 1) : start + CHUNK - 1
        const res = await call<{
          start: number
          end: number
          size: number
          base64: string
        }>('sites.fetchRange', {
          path: entry.path,
          siteId,
          range: `bytes=${start}-${end}`,
        })
        if (!res || !res.base64) throw new Error('Empty file read from host')
        if (res.size > 0) fileSize = res.size
        const chunk = res.base64
        await RNFS.write(tmp, chunk, start, 'base64')
        received = Math.max(received, (res.end != null ? res.end + 1 : 0) || chunk.length)
        onProgress?.(received, fileSize)
        // Done when the host returned a full/terminal range that reaches the
        // end of the file.
        if (res.size > 0 && res.end != null && res.end >= res.size - 1) break
        if (res.size > 0 && received >= res.size) break
      }
      await RNFS.mkdir(siteCache).catch(() => {})
      await RNFS.unlink(dest).catch(() => {})
      await RNFS.moveFile(tmp, dest).catch(async () => {
        // If move fails (cross-volume), copy.
        const contents = await RNFS.readFile(tmp, 'base64')
        await RNFS.writeFile(dest, contents, 'base64')
        await RNFS.unlink(tmp).catch(() => {})
      })
      onProgress?.(received, fileSize)
      const finalStat = await RNFS.stat(dest).catch(() => null)
      console.warn(
        `[Folders:fetch] "${entry.name}" done: ${received}B written, expected ${fileSize}B, ` +
          `onDisk=${finalStat ? finalStat.size : '?'}, chunks ok`
      )
      return { uri: `file://${dest}`, size: received }
    } catch (err) {
      await RNFS.unlink(tmp).catch(() => {})
      throw err
    }
  }

  // Fetch media into the local cache, then show it full-screen. Faststart MP4
  // (moov in the head) plays *progressively*: we stream the head past the moov
  // watermark, mount the player against the growing file via the committed-
  // watermark loopback server (safe from torn reads), then keep filling the
  // rest in the background. Everything else is fetched to a complete file
  // first (reliable for any container/size).
  const handlePreview = async (entry: SiteEntry) => {
    const kind = kindOf(entry.name)
    setFetching(entry)
    setFetchProgress({ done: 0, total: entry.size || 0 })

    // Only MP4-family can be sniffed for a head moov; MKV needs tail Cues and
    // everything else is unknown → always fetch-to-complete first.
    const canProgressive = /\.(mp4|m4v|mov|3gp)$/i.test(entry.name || '')

    try {
      if (kind === 'video' && canProgressive) {
        const moovEnd = await sniffMp4Moov(entry)
        if (moovEnd && moovEnd > 0) {
          await progressivePlayMp4(entry, moovEnd)
          return
        }
        // No moov in the head: tail-metadata file. Fall through to full fetch.
      }
      const { uri } = await fetchFileToCache(entry, (done, total) =>
        setFetchProgress({ done, total })
      )
      setPreviewUri({
        uri,
        name: entry.name || 'file',
        kind,
        size: entry.size,
        isComplete: true,
      })
    } catch (err: any) {
      Alert.alert('Preview Failed', String((err as Error)?.message || err) || 'Could not fetch file')
    } finally {
      setFetching(null)
      setFetchProgress(null)
    }
  }

  /** Fetch one byte range from the host site. */
  const fetchRange = async (path: string, start: number, end: number) => {
    const res = await call<{ start: number; end: number; size: number; base64: string }>(
      'sites.fetchRange',
      { path, siteId, range: `bytes=${start}-${end}` }
    )
    if (!res || !res.base64) throw new Error('Empty file read from host')
    return res
  }

  /** Scan the first ~2 MiB of an MP4 for a head `moov` box. Returns the byte
   *  offset where moov ends (the watermark after which the file is playable
   *  progressively), or null when moov is not in the head (tail-moov / fMP4). */
  const sniffMp4Moov = async (entry: SiteEntry): Promise<number | null> => {
    try {
      const size = entry.size || 0
      const probe = Math.min(2 * 1024 * 1024, size)
      if (probe < 64) return null
      const res = await fetchRange(entry.path, 0, probe - 1)
      const b64 = res.base64
      // Decode via RNFS-agnostic base64 → binary using the global Buffer if
      // available (Metro polyfills it), else fall back to a manual decode.
      const bin =
        typeof Buffer !== 'undefined'
          ? Buffer.from(b64, 'base64')
          : (globalThis as any).Buffer?.from
            ? (globalThis as any).Buffer.from(b64, 'base64')
            : null
      if (!bin || bin.length < 12) return null
      const buf = new Uint8Array(bin.buffer, bin.byteOffset, bin.length)
      const boxType = String.fromCharCode(...buf.slice(4, 8))
      if (boxType !== 'ftyp' && boxType !== 'styp') return null
      // Walk top-level boxes looking for moov within the probe window.
      let off = 0
      while (off + 8 <= buf.length) {
        const size32 = (buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]
        const type = String.fromCharCode(...buf.slice(off + 4, off + 8))
        let boxSize = size32
        if (size32 === 1) {
          // 64-bit largesize
          if (off + 16 > buf.length) break
          const hi = ((buf[off + 8] << 24) | (buf[off + 9] << 16) | (buf[off + 10] << 8) | buf[off + 11]) >>> 0
          const lo = ((buf[off + 12] << 24) | (buf[off + 13] << 16) | (buf[off + 14] << 8) | buf[off + 15]) >>> 0
          boxSize = hi * 4294967296 + lo
        }
        if (boxSize === 0) break
        if (boxSize < 8) break
        if (type === 'moov') return off + boxSize
        off += boxSize
      }
      return null
    } catch {
      return null
    }
  }

  /** Progressive playback for faststart MP4. Streams the head through the moov
   *  watermark, mounts Media3 against the growing file via the committed-
   *  watermark loopback server, then keeps downloading in the background. Each
   *  durable chunk advances the watermark so the server never serves a torn
   *  in-flight chunk (the root cause of ExoPlayer "Invalid NAL length"). */
  const progressivePlayMp4 = async (entry: SiteEntry, moovEnd: number) => {
    const siteCache = await getSiteCacheDir()
    await RNFS.mkdir(siteCache).catch(() => {})
    const destPath = cachePathFor(entry, siteCache).replace(/^file:\/\//, '')
    const finalSize = entry.size || 0

    // A stale partial/complete cache entry would confuse the growing-file
    // math; start from a clean slate.
    await RNFS.unlink(destPath).catch(() => {})
    await RNFS.unlink(`${destPath}.part`).catch(() => {})

    let written = 0
    let fileSize = finalSize
    let lastReportedWatermark = -1

    const publishPreview = (isComplete: boolean) => {
      setPreviewUri((p) =>
        p && p.name === (entry.name || 'file')
          ? { ...p, isComplete, written }
          : p
      )
    }

    const writeChunk = async (start: number, end: number) => {
      const res = await fetchRange(entry.path, start, Math.min(end, fileSize ? fileSize - 1 : end))
      if (res.size > 0) fileSize = res.size
      await RNFS.write(destPath, res.base64, start, 'base64')
      const chunkEnd = res.end != null ? res.end : start + Math.floor((res.base64.length / 4) * 3)
      if (chunkEnd + 1 > written) written = chunkEnd + 1
      // Advance the durable watermark so the loopback server may serve the
      // newly-committed prefix (never a partially-written chunk).
      if (written !== lastReportedWatermark) {
        lastReportedWatermark = written
        setPreviewUri((p) => (p ? { ...p, written } : p))
      }
      setFetchProgress({ done: Math.min(written, fileSize), total: fileSize })
      return written
    }

    const CHUNK = 512 * 1024
    try {
      // 1. Sequential download of the head through the end of moov so the
      //    player can mount (moov watermark).
      for (let start = 0; start < moovEnd; start += CHUNK) {
        await writeChunk(start, Math.min(start + CHUNK - 1, moovEnd - 1))
        if (fileSize > 0 && moovEnd >= fileSize) break
      }
      // 2. Mount the player against the growing file via committed-watermark
      //    loopback. Preview renders immediately; download continues after.
      setPreviewUri({
        uri: destPath, // raw path for loopback; player is fed over HTTP
        name: entry.name || 'file',
        kind: 'video',
        size: fileSize,
        isComplete: false,
        written,
      })
      setFetching(null)
      // 3. Keep streaming the rest in the background until the file is whole.
      for (let start = moovEnd; start < fileSize; start += CHUNK) {
        await writeChunk(start, start + CHUNK - 1)
      }
      // 4. Complete: flip stream-complete so any waiting read proceeds, and
      //    mark the preview complete so Save appears.
      publishPreview(true)
      setFetchProgress(null)
    } catch (err) {
      await RNFS.unlink(destPath).catch(() => {})
      throw err
    } finally {
      setFetchProgress(null)
    }
  }

  // Save a (possibly already-cached) preview file to the public Downloads
  // folder; falls back to fetching it first when no local uri exists yet.
  const saveToDevice = async (source: {
    name?: string
    size?: number
    path?: string
    uri?: string
  }) => {
    let cachedUri = source.uri || null
    const name = source.name || 'file'
    try {
      if (!cachedUri) {
        setFetching((fetching) => fetching || ({ name, path: source.path || '', type: 'file', size: source.size } as SiteEntry))
        setFetchProgress({ done: 0, total: source.size || 0 })
        const fetched = await fetchFileToCache(
          { name, path: source.path || '', type: 'file', size: source.size } as SiteEntry,
          (done, total) => setFetchProgress({ done, total })
        )
        cachedUri = fetched.uri
      }
      const destDir = `${RNFS.DownloadDirectoryPath || '/storage/emulated/0/Download'}/MeshDrop`
      await RNFS.mkdir(destDir).catch(() => {})
      const dest = `${destDir}/${name}`
      const cachedPath = (cachedUri || '').replace(/^file:\/\//, '')
      if (cachedPath && cachedPath !== dest) {
        await RNFS.unlink(dest).catch(() => {})
        await RNFS.moveFile(cachedPath, dest).catch(async () => {
          const contents = await RNFS.readFile(cachedPath, 'base64')
          await RNFS.writeFile(dest, contents, 'base64')
        })
      }
      Alert.alert('Saved', `Downloaded to ${destDir}`)
    } catch (err: any) {
      Alert.alert('Download Failed', String((err as Error)?.message || err))
    } finally {
      setFetching(null)
      setFetchProgress(null)
    }
  }

  return (
    <View style={styles.browser}>
      {/* Browser header */}
      <View style={[styles.browserHeader, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.browserBackBtn} activeOpacity={0.7}>
          <ArrowLeft size={18} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.flex1}>
          <View style={styles.browserTitleRow}>
            <Text style={[styles.browserTitle, { color: theme.text }]} numberOfLines={1}>
              {crumbLabel}
            </Text>
            <Text style={[styles.browserHost, { color: theme.muted }]} numberOfLines={1}>
              Shared by {hostName}
            </Text>
          </View>
          <Text style={[styles.browserPath, { color: theme.muted }]} numberOfLines={1}>
            {path === '/' ? '\\' : path}
          </Text>
        </View>
        <TouchableOpacity onPress={() => load(pathRef.current)} style={styles.browserRefreshBtn} activeOpacity={0.7}>
          <RefreshCw size={15} color={theme.muted} />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.browserCenter}>
          <Card style={[styles.errorCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[styles.errorTitle, { color: theme.text }]}>Could not load this folder</Text>
            <Text style={[styles.errorSub, { color: theme.muted }]}>{error}</Text>
            <View style={styles.errorActions}>
              <Btn label="Retry" icon={RefreshCw} variant="primary" size="sm" onPress={() => load(pathRef.current)} />
              <Btn label="Back" icon={ArrowLeft} variant="ghost" size="sm" onPress={onBack} />
            </View>
          </Card>
        </View>
      ) : loading && !entries ? (
        <View style={styles.browserCenter}>
          <ActivityIndicator color={theme.primary} size="large" style={{ marginBottom: 12 }} />
          <Text style={[styles.browserLoadingText, { color: theme.muted }]}>Opening folder…</Text>
        </View>
      ) : !entries || entries.length === 0 ? (
        <View style={styles.browserCenter}>
          <Folder size={34} color={theme.muted} style={{ marginBottom: 10 }} />
          <Text style={[styles.browserEmptyTitle, { color: theme.text }]}>This folder is empty</Text>
          <Text style={[styles.browserEmptySub, { color: theme.muted }]}>
            Nothing has been shared here yet.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.browserScroll}
          contentContainerStyle={styles.browserContent}
          showsVerticalScrollIndicator={false}
        >
          {path !== '/' && (
            <TouchableOpacity onPress={goUp} style={styles.upRow} activeOpacity={0.7}>
              <ArrowUp size={14} color={theme.primary} />
              <Text style={[styles.upText, { color: theme.primary }]}>Up to parent folder</Text>
            </TouchableOpacity>
          )}

          {dirs.length > 0 && (
            <View style={styles.groupBlock}>
              <Text style={[styles.groupLabel, { color: theme.muted }]}>FOLDERS</Text>
              {dirs.map((entry) => (
                <EntryRow
                  key={entry.path}
                  entry={entry}
                  onPress={() => openEntry(entry)}
                />
              ))}
            </View>
          )}

          {files.length > 0 && (
            <View style={styles.groupBlock}>
              <Text style={[styles.groupLabel, { color: theme.muted }]}>FILES</Text>
              {files.map((entry) => (
                <EntryRow
                  key={entry.path}
                  entry={entry}
                  onPress={() => openEntry(entry)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* File info + actions sheet (non-media: preview/tap opens here) */}
      <SimpleModal
        visible={Boolean(detailFile)}
        title={detailFile?.name || 'File'}
        subtitle={detailFile ? `${formatBytes(detailFile.size)} · ${fmtDate(detailFile.mtimeMs) || 'just now'}` : ''}
        onClose={() => setDetailFile(null)}
      >
        <View style={styles.detailBody}>
          <Text style={[styles.detailHint, { color: theme.muted }]}>
            This file type isn't previewable inline yet, but you can download it to your
            phone's Downloads folder.
          </Text>
          {detailFile && (
            <Btn
              label={fetching ? 'Fetching…' : 'Save to phone'}
              icon={Download}
              variant="primary"
              onPress={() => {
                const f = detailFile
                setDetailFile(null)
                saveToDevice({ name: f.name, size: f.size, path: f.path })
              }}
              disabled={!!fetching}
              style={{ marginTop: 12 }}
            />
          )}
          <Btn
            label="Close"
            icon={X}
            variant="ghost"
            onPress={() => setDetailFile(null)}
            style={{ marginTop: 6 }}
          />
        </View>
      </SimpleModal>

      {/* Fetch progress overlay (shown while pulling a file from the host) */}
      {fetching && (
        <View style={[styles.fetchOverlay, { backgroundColor: theme.modalBackdrop }]}>
          <View style={[styles.fetchCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <ActivityIndicator color={theme.primary} style={{ marginBottom: 12 }} />
            <Text style={[styles.fetchTitle, { color: theme.text }]} numberOfLines={1}>
              Fetching {fetching.name}
            </Text>
            {fetchProgress && fetchProgress.total > 0 && (
              <>
                <Text style={[styles.fetchSub, { color: theme.muted }]}>
                  {formatBytes(fetchProgress.done)} of {formatBytes(fetchProgress.total)}
                </Text>
                <View style={[styles.progressTrack, { backgroundColor: theme.bgElevated }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: theme.primary,
                        width: `${Math.min(100, Math.round((fetchProgress.done / fetchProgress.total) * 100))}%`,
                      },
                    ]}
                  />
                </View>
              </>
            )}
            <Text style={[styles.fetchHint, { color: theme.muted }]}>
              Streaming straight from the host over the mesh…
            </Text>
          </View>
        </View>
      )}

      {/* Full-screen inline preview: images viewed, media played (desktop parity) */}
      <FilePreviewModal
        visible={Boolean(previewUri)}
        preview={previewUri}
        siteName={crumbLabel}
        fetching={Boolean(fetching)}
        onClose={() => setPreviewUri(null)}
        onSave={
          previewUri
            ? () =>
                saveToDevice({
                  name: previewUri.name,
                  size: previewUri.size,
                  uri: previewUri.uri,
                })
            : undefined
        }
      />
    </View>
  )
}

// Full-screen inline file preview: images get a pinch-free viewer, video/audio
// get the native MeshDropVideoView player. Content is the local cache file
// fetched from the host (desktop parity: tap image → view, tap media → play).
function FilePreviewModal({
  visible,
  preview,
  siteName,
  fetching,
  onClose,
  onSave,
}: {
  visible: boolean
  preview: { uri: string; name: string; kind: PreviewKind; size?: number; isComplete?: boolean; written?: number } | null
  siteName?: string
  fetching?: boolean
  onClose: () => void
  onSave?: () => void
}) {
  const { theme } = useTheme()
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [imageFailed, setImageFailed] = useState(false)

  // Reset transient state each time a new preview opens.
  useEffect(() => {
    setMediaError(null)
    setImageFailed(false)
  }, [preview?.uri])

  const kind = preview?.kind || 'other'
  const isVideo = kind === 'video'
  const isImage = kind === 'image'
  const isAudio = kind === 'audio'

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.previewRoot, { backgroundColor: '#000000' }]}>
        {/* Header */}
        <View style={styles.previewHeader}>
          <View style={styles.flex1}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {preview?.name}
            </Text>
            {siteName ? (
              <Text style={styles.previewSub} numberOfLines={1}>
                {siteName}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.previewClose} activeOpacity={0.7}>
            <X size={20} color="#F8FAFC" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.previewBody}>
          {!preview ? null : fetching ? (
            <ActivityIndicator size="large" color="#818CF8" />
          ) : isImage ? (
            imageFailed ? (
              <View style={styles.previewCenter}>
                <Text style={styles.previewErrorText}>Could not load this image.</Text>
              </View>
            ) : (
              <Image
                source={{ uri: preview.uri }}
                style={styles.previewImage}
                resizeMode="contain"
                onError={() => setImageFailed(true)}
              />
            )
          ) : isVideo || isAudio ? (
            <View style={styles.previewMediaWrap}>
              {/* Progressive (still-downloading) video streams over the
                  committed-watermark loopback server the whole time; complete
                  files play directly from the local path. `isComplete` only
                  flips the loopback server's stream-complete flag so waiting
                  reads proceed — the source is never remounted mid-playback. */}
              <MediaPlayer
                src={preview.written !== undefined ? undefined : preview.uri}
                loopbackSrc={preview.written !== undefined ? preview.uri : undefined}
                loopbackTotal={
                  preview.written !== undefined && preview.size ? preview.size : undefined
                }
                loopbackWritten={
                  preview.written !== undefined && preview.written ? preview.written : undefined
                }
                streamComplete={
                  preview.written !== undefined ? Boolean(preview.isComplete) : undefined
                }
                onError={(message) => {
                  setMediaError(message)
                  console.warn('[Folders] media playback error:', message)
                }}
              />
              {mediaError ? (
                <View style={styles.previewCenter}>
                  <Text style={styles.previewErrorText}>{mediaError}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.previewCenter}>
              <FileText size={40} color="#64748B" />
              <Text style={styles.previewMutedText}>No inline preview for this file.</Text>
            </View>
          )}
        </View>

        {/* Footer: Save (only once the stream finished) */}
        {(isVideo || isAudio) && onSave && (preview?.isComplete ?? true) ? (
          <View style={styles.previewFooter}>
            <TouchableOpacity
              onPress={onSave}
              style={[styles.previewFooterBtn, { backgroundColor: '#1E293B' }]}
              activeOpacity={0.8}
            >
              <Download size={16} color="#E2E8F0" />
              <Text style={styles.previewFooterText}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </Modal>
  )
}

function EntryRow({
  entry,
  onPress,
}: {
  entry: SiteEntry
  onPress: () => void
}) {
  const { theme } = useTheme()
  const IconComponent = entryIcon(entry.type || 'file', entry.name || '')
  const isDir = entry.type === 'dir'
  const subtitle = isDir
    ? 'Folder'
    : `${formatBytes(entry.size)}${entry.mtimeMs ? ` · ${fmtDate(entry.mtimeMs)}` : ''}`

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.entryRow, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
    >
      <View style={[styles.entryIconBox, { backgroundColor: isDir ? theme.primarySoft : theme.bgElevated }]}>
        <IconComponent size={17} color={isDir ? theme.primary : theme.muted} />
      </View>
      <View style={styles.flex1}>
        <Text style={[styles.entryName, { color: theme.text }]} numberOfLines={1}>
          {entry.name}
        </Text>
        <Text style={[styles.entryMeta, { color: theme.muted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={15} color={theme.muted} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 110,
  },
  flex1: {
    flex: 1,
  },
  heroWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  heroInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: 11.5,
    marginTop: 1,
  },
  codeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 11,
  },
  codeBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  refreshText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  inviteIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  inviteSub: {
    fontSize: 11,
    marginTop: 1,
  },
  openBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  openBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  inviteCloseBtn: {
    padding: 4,
  },
  list: {
    gap: 10,
    marginTop: 8,
  },
  siteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
  },
  siteIconBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  siteName: {
    fontSize: 14,
    fontWeight: '800',
  },
  siteMeta: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: fonts.mono,
  },
  siteStatusRow: {
    marginTop: 4,
  },
  trashBtn: {
    padding: 6,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 26,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  infoCard: {
    padding: 14,
    marginTop: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 11.5,
    lineHeight: 16,
    flex: 1,
  },
  codeModalBody: {
    gap: 12,
    paddingVertical: 6,
  },
  codeInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: fonts.mono,
    letterSpacing: 1,
  },
  // Browser view
  browser: {
    flex: 1,
  },
  browserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  browserBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browserTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  browserTitle: {
    fontSize: 15,
    fontWeight: '900',
    flexShrink: 1,
  },
  browserHost: {
    fontSize: 10.5,
    flexShrink: 1,
  },
  browserPath: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: fonts.mono,
  },
  browserRefreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browserScroll: {
    flex: 1,
  },
  browserContent: {
    padding: 12,
    paddingBottom: 40,
  },
  browserCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorCard: {
    alignItems: 'center',
    padding: 20,
    width: '100%',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  errorSub: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 14,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 8,
  },
  browserLoadingText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  browserEmptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  browserEmptySub: {
    fontSize: 12,
    textAlign: 'center',
  },
  upRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  upText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  groupBlock: {
    marginBottom: 12,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 6,
    marginLeft: 4,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    marginBottom: 7,
  },
  entryIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryName: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  entryMeta: {
    fontSize: 10.5,
    marginTop: 2,
  },
  detailBody: {
    paddingVertical: 6,
  },
  detailHint: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
  },
  // Fetch progress overlay
  fetchOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    zIndex: 50,
  },
  fetchCard: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
  },
  fetchTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  fetchSub: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  fetchHint: {
    fontSize: 11,
    marginTop: 12,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  // Full-screen media/image preview
  previewRoot: {
    flex: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  previewTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  previewSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  previewClose: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
  },
  previewBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: {
    width: winWidth,
    height: winHeight - 140,
  },
  previewMediaWrap: {
    flex: 1,
    width: '100%',
  },
  previewCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  previewErrorText: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  previewMutedText: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  previewFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  previewFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  previewFooterText: {
    color: '#E2E8F0',
    fontSize: 12.5,
    fontWeight: '700',
  },
})
