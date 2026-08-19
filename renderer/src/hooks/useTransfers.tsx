import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { METHODS, EVENTS } from '@/types/protocol'
import { call, on } from '@/lib/ipc'
import { useToast } from '@/hooks/useToast'
import { useNavigation } from '@/hooks/useNavigation'
import type { Device, IncomingOffer, NavRoute, TransferRecord } from '@/types'

interface TransfersContextValue {
  transfers: TransferRecord[]
  pendingOffers: IncomingOffer[]
  acceptTransfer: (transferId: string) => void
  declineTransfer: (transferId: string) => void
  pauseTransfer: (transferId: string) => void
  resumeTransfer: (transferId: string) => void
  cancelTransfer: (transferId: string) => void
  retryTransfer: (transferId: string) => void
  clearTransfers: (options?: { includePending?: boolean }) => void
  deleteTransfer: (transferId: string) => Promise<void>
  sendFileToDevice: (device: Device) => Promise<unknown>
  sendFilePath: (device: Device, file: File) => Promise<unknown>
}

const TransfersContext = createContext<TransfersContextValue | null>(null)

export function TransfersProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()
  const { navigate, currentRoute } = useNavigation()
  // Where the user was before an auto-shift to /transfers, so completion can
  // return them. Refs keep the subscription effect stable across route changes.
  const returnRouteRef = useRef<NavRoute | null>(null)
  const currentRouteRef = useRef<NavRoute>(currentRoute)
  useEffect(() => {
    currentRouteRef.current = currentRoute
  }, [currentRoute])

  const [transfers, setTransfers] = useState<TransferRecord[]>([])
  const [pendingOffers, setPendingOffers] = useState<IncomingOffer[]>([])

  // Initial load + live subscriptions: incoming offers, transfer lifecycle
  // events (upsert records), and the auto-navigate there-and-back behavior.
  useEffect(() => {
    call(METHODS.TRANSFERS_LIST, null)
      .then((res: any) => {
        if (Array.isArray(res)) {
          setTransfers(res.filter((t: any) => !t.isSync && t.source !== 'sync'))
        }
      })
      .catch(() => {})

    const unsubOffer = on(EVENTS.TRANSFER_OFFER_RECEIVED, (offer: any) => {
      if (offer && offer.transferId && !offer.isSync && offer.source !== 'sync') {
        setPendingOffers((prev) =>
          prev.some((o) => o.transferId === offer.transferId) ? prev : [...prev, offer]
        )
        // Shift the receiver to the Transfers page so the incoming file is
        // visible (with its approval dialog) the moment it arrives; remember
        // where they came from so completion can shift them back.
        if (currentRouteRef.current !== '/transfers')
          returnRouteRef.current = currentRouteRef.current
        navigate('/transfers')
      }
    })

    const unsubStarted = on(EVENTS.TRANSFER_STARTED, (t: any) => {
      if (t && t.status === 'active')
        setPendingOffers((prev) => prev.filter((o) => o.transferId !== t.id))
    })

    const unsubCancelled = on(EVENTS.TRANSFER_CANCELLED, (t: any) => {
      if (t && t.id) setPendingOffers((prev) => prev.filter((o) => o.transferId !== t.id))
    })

    const upsertTransfer = (t: any) => {
      if (!t || !t.id || t.isSync || t.source === 'sync') return
      setTransfers((prev) => {
        const idx = prev.findIndex((x) => x.id === t.id)
        if (idx === -1) return [t, ...prev]
        const next = [...prev]
        next[idx] = { ...next[idx], ...t }
        return next
      })
    }
    const unsubTQueued = on(EVENTS.TRANSFER_QUEUED, upsertTransfer)
    const unsubTStarted = on(EVENTS.TRANSFER_STARTED, upsertTransfer)
    const unsubTPaused = on(EVENTS.TRANSFER_PAUSED, upsertTransfer)
    const unsubTResumed = on(EVENTS.TRANSFER_RESUMED, upsertTransfer)
    const unsubTCancelled = on(EVENTS.TRANSFER_CANCELLED, upsertTransfer)
    const unsubTFailed = on(EVENTS.TRANSFER_FAILED, upsertTransfer)
    const unsubTCompleted = on(EVENTS.TRANSFER_COMPLETED, (t: any) => {
      upsertTransfer(t)
      // The transfer is done: shift the user back to where they were before
      // the auto-navigation, but only if they haven't manually moved on.
      const back = returnRouteRef.current
      if (back) {
        returnRouteRef.current = null
        if (currentRouteRef.current === '/transfers') navigate(back)
      }
    })
    const unsubTProgress = on(EVENTS.TRANSFER_PROGRESS, (d: any) => {
      if (d && d.id) {
        setTransfers((prev) => prev.map((t) => (t.id === d.id ? { ...t, ...d } : t)))
      }
    })

    return () => {
      unsubOffer()
      unsubStarted()
      unsubCancelled()
      unsubTQueued()
      unsubTStarted()
      unsubTPaused()
      unsubTResumed()
      unsubTCancelled()
      unsubTFailed()
      unsubTCompleted()
      unsubTProgress()
    }
  }, [navigate])

  const acceptTransfer = useCallback(
    (transferId: string) => {
      call(METHODS.TRANSFERS_ACCEPT, { id: transferId })
        .then(() => {
          setPendingOffers((prev) => prev.filter((o) => o.transferId !== transferId))
          toast.success('Transfer Started', 'Incoming transfer approved.')
        })
        .catch((err: any) => {
          toast.error(
            'Could Not Start Transfer',
            err?.message || 'The remote device did not accept the transfer.'
          )
        })
    },
    [toast]
  )

  const declineTransfer = useCallback((transferId: string) => {
    call(METHODS.TRANSFERS_DECLINE, { id: transferId })
      .then(() => {
        setPendingOffers((prev) => prev.filter((o) => o.transferId !== transferId))
      })
      .catch(() => {})
  }, [])

  const pauseTransfer = useCallback((transferId: string) => {
    call(METHODS.TRANSFERS_PAUSE, { id: transferId }).catch(() => {})
  }, [])

  const resumeTransfer = useCallback((transferId: string) => {
    call(METHODS.TRANSFERS_RESUME, { id: transferId }).catch(() => {})
  }, [])

  const cancelTransfer = useCallback((transferId: string) => {
    call(METHODS.TRANSFERS_CANCEL, { id: transferId }).catch(() => {})
  }, [])

  const retryTransfer = useCallback((transferId: string) => {
    call(METHODS.TRANSFERS_RETRY, { id: transferId }).catch(() => {})
  }, [])

  const clearTransfers = useCallback((options?: { includePending?: boolean }) => {
    call(METHODS.TRANSFERS_CLEAR, options || null)
      .then(() => {
        if (options?.includePending) {
          setTransfers([])
        } else {
          setTransfers((prev) =>
            prev.filter(
              (t) => !['completed', 'failed', 'cancelled', 'interrupted'].includes(t.status)
            )
          )
        }
      })
      .catch(() => {})
  }, [])

  const deleteTransfer = useCallback(async (transferId: string) => {
    await call(METHODS.TRANSFERS_DELETE || 'transfers.delete', { id: transferId }).catch(() => {})
    setTransfers((prev) => prev.filter((t) => t.id !== transferId))
  }, [])

  const sendFileToDevice = useCallback(
    async (device: Device) => {
      if (typeof window === 'undefined' || !window.bridge?.openFileDialog) {
        throw new Error('File dialogs are only available in the desktop app')
      }
      const file = await window.bridge.openFileDialog()
      if (!file) return null
      const result = await call(METHODS.TRANSFERS_START, {
        filename: file.filename,
        filePath: file.filePath,
        fileSize: file.fileSize,
        peerId: device.publicKey || device.id,
        peerName: device.name
      })
      // Confirm the share arrived + shift to the Transfers page so the send is
      // visible the moment it starts; remember where we came from so completion
      // can shift the user back.
      toast.success('Sharing Started', `${file.filename} → ${device.name}`)
      if (currentRouteRef.current !== '/transfers') returnRouteRef.current = currentRouteRef.current
      navigate('/transfers')
      return result
    },
    [navigate, toast]
  )

  const sendFilePath = useCallback(
    async (device: Device, file: File) => {
      if (!window.bridge?.getPathForFile) {
        throw new Error('File drag & drop is only available in the desktop app')
      }
      const filePath = window.bridge.getPathForFile(file)
      if (!filePath) throw new Error('Could not resolve the dropped file path')
      const result = await call(METHODS.TRANSFERS_START, {
        filename: file.name,
        filePath,
        fileSize: file.size,
        peerId: device.publicKey || device.id,
        peerName: device.name
      })
      // Confirm the share arrived + shift to the Transfers page so the send is
      // visible the moment it starts; remember where we came from so completion
      // can shift the user back.
      toast.success('Sharing Started', `${file.name} → ${device.name}`)
      if (currentRouteRef.current !== '/transfers') returnRouteRef.current = currentRouteRef.current
      navigate('/transfers')
      return result
    },
    [navigate, toast]
  )

  return (
    <TransfersContext.Provider
      value={{
        transfers,
        pendingOffers,
        acceptTransfer,
        declineTransfer,
        pauseTransfer,
        resumeTransfer,
        cancelTransfer,
        retryTransfer,
        clearTransfers,
        deleteTransfer,
        sendFileToDevice,
        sendFilePath
      }}
    >
      {children}
    </TransfersContext.Provider>
  )
}

export function useTransfers() {
  const ctx = useContext(TransfersContext)
  if (!ctx) throw new Error('useTransfers must be used within TransfersProvider')
  return ctx
}
