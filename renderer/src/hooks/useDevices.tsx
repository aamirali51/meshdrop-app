import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { METHODS, EVENTS } from '@/types/protocol'
import { call, on } from '@/lib/ipc'
import { useToast } from '@/hooks/useToast'
import type { Device, UserIdentity } from '@/types'

const EMPTY_IDENTITY: UserIdentity = {
  id: '',
  name: '',
  os: '',
  publicKey: '',
  pairingCode: ''
}

interface DevicesContextValue {
  identity: UserIdentity
  devices: Device[]
  inspectingDevice: Device | null
  isQRCodeModalOpen: boolean
  isQuickConnectOpen: boolean
  setInspectingDevice: (device: Device | null) => void
  toggleQRCodeModal: () => void
  toggleQuickConnect: () => void
  toggleTrustDevice: (deviceId: string) => void
  toggleFavoriteDevice: (deviceId: string) => void
  renameDevice: (deviceId: string, newName: string) => void
  removeDevice: (deviceId: string) => void
  getPairingCode: () => Promise<{ code: string; id: string }>
  pairWithCode: (code: string) => Promise<unknown>
}

const DevicesContext = createContext<DevicesContextValue | null>(null)

export function DevicesProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()
  const [identity, setIdentity] = useState<UserIdentity>(EMPTY_IDENTITY)
  const [devices, setDevices] = useState<Device[]>(() => {
    try {
      const raw = localStorage.getItem('meshdrop:cached_devices')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          return parsed.map((d: Device) => ({ ...d, isOnline: false }))
        }
      }
    } catch {}
    return []
  })
  const [inspectingDevice, setInspectingDevice] = useState<Device | null>(null)
  const [isQRCodeModalOpen, setIsQRCodeModalOpen] = useState(false)
  const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false)

  // Initial loads + live refresh on device lifecycle events.
  useEffect(() => {
    call(METHODS.DEVICES_GET_IDENTITY, null)
      .then((res: any) => {
        if (res && res.id) setIdentity(res)
      })
      .catch(() => {})

    const refreshDevices = () => {
      call(METHODS.DEVICES_LIST, null)
        .then((res: any) => {
          if (Array.isArray(res)) {
            setDevices(res)
            try {
              localStorage.setItem('meshdrop:cached_devices', JSON.stringify(res))
            } catch {}
          }
        })
        .catch(() => {})
    }

    refreshDevices()
    const t1 = setTimeout(refreshDevices, 400)
    const t2 = setTimeout(refreshDevices, 1500)
    const t3 = setTimeout(refreshDevices, 3500)

    const unsub1 = on(EVENTS.DEVICE_UPDATED, refreshDevices)
    const unsub2 = on(EVENTS.DEVICE_PAIRED, refreshDevices)
    const unsub3 = on(EVENTS.DEVICE_REMOVED, refreshDevices)
    const unsub4 = on(EVENTS.PEER_CONNECTED, refreshDevices)
    const unsub5 = on(EVENTS.PEER_DISCONNECTED, refreshDevices)
    const unsub6 = on(EVENTS.PEER_LEFT, refreshDevices)
    const unsub7 = on(EVENTS.ENGINE_READY, refreshDevices)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      unsub1()
      unsub2()
      unsub3()
      unsub4()
      unsub5()
      unsub6()
      unsub7()
    }
  }, [])

  const toggleQRCodeModal = useCallback(() => {
    setIsQRCodeModalOpen((prev) => !prev)
  }, [])

  const toggleQuickConnect = useCallback(() => {
    setIsQuickConnectOpen((prev) => !prev)
  }, [])

  const toggleTrustDevice = useCallback(
    async (deviceId: string) => {
      const prev = devices.find((d) => d.id === deviceId)
      if (!prev) return
      const nextTrusted = !prev.isTrusted
      setDevices((list) =>
        list.map((d) => (d.id === deviceId ? { ...d, isTrusted: nextTrusted } : d))
      )
      try {
        await call(METHODS.DEVICES_TRUST, { id: deviceId })
        toast.success('Device Trust Updated', 'Trust preference saved.')
      } catch (err: any) {
        setDevices((list) =>
          list.map((d) => (d.id === deviceId ? { ...d, isTrusted: prev.isTrusted } : d))
        )
        toast.error('Update Failed', err?.message || 'Could not update trust preference.')
      }
    },
    [devices, toast]
  )

  const toggleFavoriteDevice = useCallback(
    async (deviceId: string) => {
      const prev = devices.find((d) => d.id === deviceId)
      if (!prev) return
      const nextFavorite = !prev.isFavorite
      setDevices((list) =>
        list.map((d) => (d.id === deviceId ? { ...d, isFavorite: nextFavorite } : d))
      )
      try {
        await call(METHODS.DEVICES_FAVORITE, { id: deviceId })
      } catch (err: any) {
        setDevices((list) =>
          list.map((d) => (d.id === deviceId ? { ...d, isFavorite: prev.isFavorite } : d))
        )
        toast.error('Update Failed', err?.message || 'Could not update favorite.')
      }
    },
    [devices, toast]
  )

  const renameDevice = useCallback(
    async (deviceId: string, newName: string) => {
      const trimmed = newName.trim()
      if (!trimmed) return
      const prev = devices.find((d) => d.id === deviceId)
      setDevices((list) => list.map((d) => (d.id === deviceId ? { ...d, name: trimmed } : d)))
      if (inspectingDevice?.id === deviceId) {
        setInspectingDevice((prevDev) => (prevDev ? { ...prevDev, name: trimmed } : null))
      }
      try {
        const updated = (await call(METHODS.DEVICES_RENAME, { id: deviceId, name: trimmed })) as Device
        if (updated) {
          setDevices((list) => list.map((d) => (d.id === deviceId ? { ...d, ...updated } : d)))
          if (inspectingDevice?.id === deviceId) {
            setInspectingDevice((prevDev) => (prevDev ? { ...prevDev, ...updated } : null))
          }
        }
        toast.success('Device Renamed', `Name updated to "${trimmed}"`)
      } catch (err: any) {
        if (prev) {
          setDevices((list) => list.map((d) => (d.id === deviceId ? { ...d, name: prev.name } : d)))
          if (inspectingDevice?.id === deviceId) {
            setInspectingDevice((prevDev) => (prevDev ? { ...prevDev, name: prev.name } : null))
          }
        }
        toast.error('Rename Failed', err?.message || 'Could not rename the device.')
      }
    },
    [devices, inspectingDevice, toast]
  )

  const removeDevice = useCallback(
    async (deviceId: string) => {
      const prev = devices
      setDevices((list) => list.filter((d) => d.id !== deviceId))
      try {
        await call(METHODS.DEVICES_REMOVE, { id: deviceId })
        toast.info('Device Removed', 'Device deleted from storage.')
      } catch (err: any) {
        setDevices(prev)
        toast.error('Remove Failed', err?.message || 'Could not remove the device.')
      }
    },
    [devices, toast]
  )

  const getPairingCode = useCallback(async () => {
    return call(METHODS.DEVICES_GET_CODE) as Promise<{ code: string; id: string }>
  }, [])

  const pairWithCode = useCallback((code: string) => {
    return call(METHODS.DEVICES_PAIR_CODE, { code })
  }, [])

  return (
    <DevicesContext.Provider
      value={{
        identity,
        devices,
        inspectingDevice,
        isQRCodeModalOpen,
        isQuickConnectOpen,
        setInspectingDevice,
        toggleQRCodeModal,
        toggleQuickConnect,
        toggleTrustDevice,
        toggleFavoriteDevice,
        renameDevice,
        removeDevice,
        getPairingCode,
        pairWithCode
      }}
    >
      {children}
    </DevicesContext.Provider>
  )
}

export function useDevices() {
  const ctx = useContext(DevicesContext)
  if (!ctx) throw new Error('useDevices must be used within DevicesProvider')
  return ctx
}
