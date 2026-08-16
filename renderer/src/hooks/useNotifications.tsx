import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { METHODS, EVENTS } from '@/types/protocol'
import { call, on } from '@/lib/ipc'
import type { NotificationItem } from '@/types'

interface NotificationsContextValue {
  notifications: NotificationItem[]
  addNotification: (title: string, description: string, type?: NotificationItem['type']) => void
  markAllNotificationsRead: () => void
  clearNotifications: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  // Initial load + live push of new notifications.
  useEffect(() => {
    call(METHODS.NOTIFICATIONS_LIST, null)
      .then((res: any) => {
        if (Array.isArray(res)) setNotifications(res)
      })
      .catch(() => {})

    const unsub = on(EVENTS.NOTIFICATION_RECEIVED, (notif: any) => {
      if (notif) setNotifications((prev) => [notif, ...prev])
    })
    return () => unsub()
  }, [])

  const addNotification = useCallback(
    (title: string, description: string, type: NotificationItem['type'] = 'info') => {
      const item: NotificationItem = {
        id: `notif-${Date.now()}`,
        title,
        description,
        type,
        timestamp: new Date().toISOString(),
        read: false
      }
      setNotifications((prev) => [item, ...prev])
    },
    []
  )

  const markAllNotificationsRead = useCallback(() => {
    call(METHODS.NOTIFICATIONS_MARK_READ, null).catch(() => {})
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const clearNotifications = useCallback(() => {
    call(METHODS.NOTIFICATIONS_CLEAR, null).catch(() => {})
    setNotifications([])
  }, [])

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        addNotification,
        markAllNotificationsRead,
        clearNotifications
      }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}
