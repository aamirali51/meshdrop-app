import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { METHODS, EVENTS } from '@/types/protocol'
import { call, on } from '@/lib/ipc'
import { useToast } from '@/hooks/useToast'
import { useNavigation } from '@/hooks/useNavigation'
import type { PendingShare, ClaimPreview } from '@/types'

// A pre-filled share composer: files picked in a system dialog, or files
// dragged onto the window. DropCodeModal consumes this on open.
export interface ShareDraft {
  files?: { filePath: string; filename: string; fileSize: number }[]
  folderPath?: string
  name?: string
}

export interface ActiveWatchParty {
  open: boolean
  transferId?: string
  filePath?: string
  roomCode?: string
  roomTitle?: string
  isHost?: boolean
}

function isVideoFile(filename?: string, fileType?: string) {
  if (fileType && fileType.startsWith('video/')) return true
  const ext = (filename || '').split('.').pop()?.toLowerCase()
  return ['mp4', 'mkv', 'webm', 'mov', 'avi', 'ts', 'm4v', 'flv'].includes(ext || '')
}

interface SharesContextValue {
  pendingShares: PendingShare[]
  isDropCodeModalOpen: boolean
  isOneTimeReceiveOpen: boolean
  deepLinkCode: string
  shareDraft: ShareDraft | null
  claimPreview: ClaimPreview | null
  watchParty: ActiveWatchParty | null
  partyJoinCode: string
  toggleDropCodeModal: () => void
  toggleOneTimeReceiveModal: () => void
  clearDeepLinkCode: () => void
  clearClaimPreview: () => void
  clearPartyJoinCode: () => void
  openShareWith: (draft: ShareDraft) => void
  clearShareDraft: () => void
  cancelShareCode: (id: string) => Promise<unknown>
  extendShareExpiration: (id: string, addMinutes: number) => Promise<unknown>
  createDropCode: (params: {
    files?: { filePath: string; filename: string; fileSize: number }[]
    folderPath?: string
    expirationPreset: string
    maxDownloads: number
    isGroup?: boolean
    isWatchParty?: boolean
    roomTitle?: string
  }) => Promise<unknown>
  claimFileWithCode: (code: string) => Promise<unknown>
  confirmClaimDownload: (params: { shareId: string; selectedIndices?: number[] }) => Promise<unknown>
  cancelClaimDownload: (params: { shareId: string; code?: string }) => Promise<unknown>
  openWatchParty: (params: Omit<ActiveWatchParty, 'open'>) => void
  closeWatchParty: () => void
}

const SharesContext = createContext<SharesContextValue | null>(null)

export function SharesProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()
  const { navigate } = useNavigation()
  const [pendingShares, setPendingShares] = useState<PendingShare[]>([])
  const [isDropCodeModalOpen, setIsDropCodeModalOpen] = useState(false)
  const [isOneTimeReceiveOpen, setIsOneTimeReceiveOpen] = useState(false)
  const [claimPreview, setClaimPreview] = useState<ClaimPreview | null>(null)
  const [watchParty, setWatchParty] = useState<ActiveWatchParty | null>(null)
  // A PARTY code arriving via deep link (meshdrop://party/…): the WatchParty
  // page consumes it to auto-join when it mounts.
  const [partyJoinCode, setPartyJoinCode] = useState('')
  const lastClaimedCodeRef = useRef<string>('')
  // A DROP code arriving via deep link (meshdrop://drop/…) is stashed
  // here so OneTimeReceiveModal can pre-fill its input.
  const [deepLinkCode, setDeepLinkCode] = useState('')
  // Files/folder pre-selected elsewhere (drop zone, global drag-and-drop);
  // DropCodeModal consumes this when it opens.
  const [shareDraft, setShareDraft] = useState<ShareDraft | null>(null)

  const openWatchParty = useCallback((params: Omit<ActiveWatchParty, 'open'>) => {
    setWatchParty({ ...params, open: true })
  }, [])

  const closeWatchParty = useCallback(() => {
    setWatchParty(null)
  }, [])

  const refreshPendingShares = useCallback(() => {
    call(METHODS.FILES_LIST_PENDING)
      .then((res: any) => {
        if (Array.isArray(res)) setPendingShares(res)
      })
      .catch(() => {})
  }, [])

  // Initial load + live share lifecycle subscriptions + deep-link routing.
  useEffect(() => {
    const unsubShareUpdated = on(EVENTS.PENDING_SHARE_UPDATED, refreshPendingShares)
    const unsubShareExpired = on(EVENTS.PENDING_SHARE_EXPIRED, refreshPendingShares)
    const unsubShareClaimed = on(EVENTS.PENDING_SHARE_CLAIMED, refreshPendingShares)
    // A DROP claim rejected by the sender's device (expired / already used /
    // revoked) surfaces asynchronously; toast it so the receiver gets feedback
    // even after the receive dialog has closed and they are on Transfers.
    const unsubClaimFailed = on(EVENTS.PENDING_SHARE_CLAIM_FAILED, (d: any) => {
      if (d && d.code) {
        toast.error('Claim Failed', `${d.code} — ${d.error || 'Share expired or invalid code'}`)
      }
    })

    const unsubClaimPreview = on(EVENTS.CLAIM_PREVIEW_RECEIVED, (preview: any) => {
      if (preview && preview.shareId) {
        setClaimPreview(preview)
      }
    })

    const unsubTransferStarted = on(EVENTS.TRANSFER_STARTED, (t: any) => {
      if (!t || !t.id) return
      const isVideo = isVideoFile(t.filename, t.fileType)
      const isClaimOrGroup =
        t.isClaim ||
        t.claimCode ||
        t.isGroupDrop ||
        (lastClaimedCodeRef.current &&
          (lastClaimedCodeRef.current.includes('GRP') || isVideo))
      if (isVideo && isClaimOrGroup && t.direction === 'receive') {
        openWatchParty({
          transferId: t.id,
          roomTitle: t.filename,
          roomCode: t.claimCode || lastClaimedCodeRef.current,
          isHost: false
        })
        lastClaimedCodeRef.current = ''
      }
    })

    refreshPendingShares()

    const unsubDeepLink = window.bridge?.onDeepLink?.((data) => {
      const code = data.code?.trim().toUpperCase() || ''
      if (!code) return
      if (data.kind === 'party' || code.startsWith('PARTY')) {
        // A watch-party link: go to the Party page and auto-join the room.
        setPartyJoinCode(code)
        navigate('/party')
      } else if (code.startsWith('DROP')) {
        // A WeTransfer-style link: open the receive modal pre-filled with the
        // code. The claim itself is user-confirmed in the modal.
        setDeepLinkCode(code)
        setIsOneTimeReceiveOpen(true)
      } else {
        toast.info(
          'Deep Link Received',
          `Pairing code ${code} ready. Open Quick Connect to use it.`
        )
      }
    })

    return () => {
      unsubShareUpdated()
      unsubShareExpired()
      unsubShareClaimed()
      unsubClaimFailed()
      unsubClaimPreview()
      unsubDeepLink?.()
    }
  }, [refreshPendingShares, toast])

  const toggleDropCodeModal = useCallback(() => {
    setIsDropCodeModalOpen((prev) => !prev)
  }, [])

  const openShareWith = useCallback((draft: ShareDraft) => {
    setShareDraft(draft)
    setIsDropCodeModalOpen(true)
  }, [])

  const clearShareDraft = useCallback(() => {
    setShareDraft(null)
  }, [])

  const toggleOneTimeReceiveModal = useCallback(() => {
    setIsOneTimeReceiveOpen((prev) => !prev)
  }, [])

  const clearDeepLinkCode = useCallback(() => {
    setDeepLinkCode('')
  }, [])

  const clearPartyJoinCode = useCallback(() => {
    setPartyJoinCode('')
  }, [])

  const clearClaimPreview = useCallback(() => {
    setClaimPreview(null)
  }, [])

  const cancelShareCode = useCallback((id: string) => {
    return call(METHODS.FILES_CANCEL_CODE, { id })
  }, [])

  const extendShareExpiration = useCallback((id: string, addMinutes: number) => {
    return call(METHODS.FILES_EXTEND_EXPIRATION, { id, addMinutes })
  }, [])

  const createDropCode = useCallback((params: {
    files?: { filePath: string; filename: string; fileSize: number }[]
    folderPath?: string
    expirationPreset: string
    maxDownloads: number
    isGroup?: boolean
    isWatchParty?: boolean
    roomTitle?: string
  }) => {
    return call(METHODS.FILES_CREATE_CODE, {
      files: params.files || undefined,
      folderPath: params.folderPath || undefined,
      expirationPreset: params.expirationPreset,
      maxDownloads: params.maxDownloads,
      isGroup: params.isGroup,
      isWatchParty: params.isWatchParty,
      roomTitle: params.roomTitle
    })
  }, [])

  const claimFileWithCode = useCallback((code: string) => {
    lastClaimedCodeRef.current = code
    return call(METHODS.FILES_CLAIM_CODE, { code })
  }, [])

  const confirmClaimDownload = useCallback((params: { shareId: string; selectedIndices?: number[] }) => {
    return call(METHODS.FILES_CONFIRM_CLAIM, params)
  }, [])

  const cancelClaimDownload = useCallback((params: { shareId: string; code?: string }) => {
    return call(METHODS.FILES_CANCEL_CLAIM, params)
  }, [])

  return (
    <SharesContext.Provider
      value={{
        pendingShares,
        isDropCodeModalOpen,
        isOneTimeReceiveOpen,
        deepLinkCode,
        shareDraft,
        claimPreview,
        watchParty,
        partyJoinCode,
        toggleDropCodeModal,
        toggleOneTimeReceiveModal,
        clearDeepLinkCode,
        clearClaimPreview,
        clearPartyJoinCode,
        openShareWith,
        clearShareDraft,
        cancelShareCode,
        extendShareExpiration,
        createDropCode,
        claimFileWithCode,
        confirmClaimDownload,
        cancelClaimDownload,
        openWatchParty,
        closeWatchParty
      }}
    >
      {children}
    </SharesContext.Provider>
  )
}

export function useShares() {
  const ctx = useContext(SharesContext)
  if (!ctx) throw new Error('useShares must be used within SharesProvider')
  return ctx
}
