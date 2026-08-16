import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  type: 'success' | 'info' | 'warning' | 'error'
  title: string
  message?: string
  actions?: ToastAction[]
  durationMs?: number
}

interface ToastContextType {
  toasts: ToastItem[]
  showToast: (toast: Omit<ToastItem, 'id'>) => void
  removeToast: (id: string) => void
  pauseToast: (id: string) => void
  resumeToast: (id: string) => void
  toast: {
    success: (
      title: string,
      message?: string,
      options?: { actions?: ToastAction[]; durationMs?: number }
    ) => void
    info: (
      title: string,
      message?: string,
      options?: { actions?: ToastAction[]; durationMs?: number }
    ) => void
    warning: (
      title: string,
      message?: string,
      options?: { actions?: ToastAction[]; durationMs?: number }
    ) => void
    error: (
      title: string,
      message?: string,
      options?: { actions?: ToastAction[]; durationMs?: number }
    ) => void
  }
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

const DEFAULT_DURATION = 5000
const MAX_TOASTS = 5

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const removeToast = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
    }
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const scheduleDismiss = useCallback(
    (id: string, ms: number) => {
      const existing = timers.current.get(id)
      if (existing) clearTimeout(existing)
      timers.current.set(
        id,
        setTimeout(() => removeToast(id), ms)
      )
    },
    [removeToast]
  )

  const showToast = useCallback(
    (item: Omit<ToastItem, 'id'>) => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
      const durationMs = item.durationMs ?? DEFAULT_DURATION
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { ...item, id }])
      scheduleDismiss(id, durationMs)
    },
    [scheduleDismiss]
  )

  const pauseToast = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
  }, [])

  const resumeToast = useCallback(
    (id: string) => {
      const toast = toasts.find((x) => x.id === id)
      if (toast) scheduleDismiss(id, toast.durationMs ?? DEFAULT_DURATION)
    },
    [toasts, scheduleDismiss]
  )

  const toast = {
    success: useCallback(
      (
        title: string,
        message?: string,
        options?: { actions?: ToastAction[]; durationMs?: number }
      ) =>
        showToast({
          type: 'success',
          title,
          message,
          actions: options?.actions,
          durationMs: options?.durationMs
        }),
      [showToast]
    ),
    info: useCallback(
      (
        title: string,
        message?: string,
        options?: { actions?: ToastAction[]; durationMs?: number }
      ) =>
        showToast({
          type: 'info',
          title,
          message,
          actions: options?.actions,
          durationMs: options?.durationMs
        }),
      [showToast]
    ),
    warning: useCallback(
      (
        title: string,
        message?: string,
        options?: { actions?: ToastAction[]; durationMs?: number }
      ) =>
        showToast({
          type: 'warning',
          title,
          message,
          actions: options?.actions,
          durationMs: options?.durationMs
        }),
      [showToast]
    ),
    error: useCallback(
      (
        title: string,
        message?: string,
        options?: { actions?: ToastAction[]; durationMs?: number }
      ) =>
        showToast({
          type: 'error',
          title,
          message,
          actions: options?.actions,
          durationMs: options?.durationMs
        }),
      [showToast]
    )
  }

  return (
    <ToastContext.Provider
      value={{ toasts, showToast, removeToast, pauseToast, resumeToast, toast }}
    >
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
