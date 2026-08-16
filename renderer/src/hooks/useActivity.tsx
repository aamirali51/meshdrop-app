import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { METHODS, EVENTS } from '@/types/protocol'
import { call, on } from '@/lib/ipc'
import { useToast } from '@/hooks/useToast'
import type { ActivityItem } from '@/types'

interface ActivityContextValue {
  activity: ActivityItem[]
  clearHistory: () => void
}

const ActivityContext = createContext<ActivityContextValue | null>(null)

export function ActivityProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()
  const [activity, setActivity] = useState<ActivityItem[]>([])

  // Initial load + refresh whenever a transfer completes (session records).
  useEffect(() => {
    const fetchActivity = () => {
      call(METHODS.HISTORY_LIST, null)
        .then((res: any) => {
          if (Array.isArray(res)) setActivity(res)
        })
        .catch(() => {})
    }
    fetchActivity()
    const unsub = on(EVENTS.TRANSFER_COMPLETED, fetchActivity)
    return () => unsub()
  }, [])

  const clearHistory = useCallback(async () => {
    try {
      await call(METHODS.HISTORY_CLEAR, null)
      const res = await call(METHODS.HISTORY_LIST, null)
      if (Array.isArray(res)) setActivity(res)
      toast.success('History Cleared', 'Transfer and session records were removed.')
    } catch (err: any) {
      toast.error('Clear Failed', err?.message || 'Could not clear history.')
    }
  }, [toast])

  return (
    <ActivityContext.Provider value={{ activity, clearHistory }}>
      {children}
    </ActivityContext.Provider>
  )
}

export function useActivity() {
  const ctx = useContext(ActivityContext)
  if (!ctx) throw new Error('useActivity must be used within ActivityProvider')
  return ctx
}
