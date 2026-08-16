import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Bell, CheckCircle2, AlertCircle, Info, Trash2, Check, XCircle } from 'lucide-react'
import { useApp } from '@/hooks/useAppState'
import { useNotifications } from '@/hooks/useNotifications'
import { Button } from '@/components/ui/button'

export function NotificationDrawer() {
  const { isNotificationDrawerOpen, toggleNotificationDrawer } = useApp()
  const { notifications, markAllNotificationsRead, clearNotifications } = useNotifications()

  // Close on Escape
  useEffect(() => {
    if (!isNotificationDrawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleNotificationDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isNotificationDrawerOpen, toggleNotificationDrawer])

  if (!isNotificationDrawerOpen) return null

  return (
    <AnimatePresence>
      <div
        className='fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm'
        onClick={toggleNotificationDrawer}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          role='dialog'
          aria-modal='true'
          aria-label='Notifications'
          onClick={(e) => e.stopPropagation()}
          className='flex h-full w-full max-w-sm flex-col border-l border-border/60 bg-sidebar/95 shadow-2xl backdrop-blur-2xl'
        >
          {/* Header */}
          <div className='flex items-center justify-between border-b border-border/50 px-5 py-4'>
            <div className='flex items-center gap-2'>
              <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                <Bell className='h-4 w-4' />
              </div>
              <div>
                <h3 className='text-sm font-bold text-foreground'>Notifications</h3>
                <p className='text-[10px] text-muted-foreground'>
                  {notifications.filter((n) => !n.read).length} unread
                </p>
              </div>
            </div>
            <button
              onClick={toggleNotificationDrawer}
              className='rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-accent hover:text-foreground'
            >
              <X className='h-4 w-4' />
            </button>
          </div>

          {/* Quick Actions */}
          {notifications.length > 0 && (
            <div className='flex items-center justify-between border-b border-border/30 bg-muted/20 px-5 py-2.5'>
              <Button
                variant='ghost'
                size='sm'
                onClick={markAllNotificationsRead}
                className='h-7 gap-1 text-[11px] text-muted-foreground hover:text-foreground'
              >
                <Check className='h-3 w-3' />
                Mark all read
              </Button>
              <Button
                variant='ghost'
                size='sm'
                onClick={clearNotifications}
                className='h-7 gap-1 text-[11px] text-destructive hover:bg-destructive/10'
              >
                <Trash2 className='h-3 w-3' />
                Clear
              </Button>
            </div>
          )}

          {/* Notifications List */}
          <div className='flex-1 space-y-2.5 overflow-y-auto p-4'>
            {notifications.length === 0 ? (
              <div className='flex h-64 flex-col items-center justify-center space-y-2 text-center'>
                <Bell className='h-8 w-8 text-muted-foreground/40' />
                <p className='text-xs font-semibold text-muted-foreground'>No new notifications</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-xl border p-3.5 transition-all ${
                    n.read
                      ? 'border-border/40 bg-card/40 opacity-75'
                      : 'border-primary/30 bg-card/90 shadow-sm'
                  }`}
                >
                  <div className='flex items-start gap-2.5'>
                    {n.type === 'error' ? (
                      <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
                    ) : n.type === 'success' ? (
                      <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-status-online' />
                    ) : n.type === 'warning' ? (
                      <AlertCircle className='mt-0.5 h-4 w-4 shrink-0 text-status-away' />
                    ) : (
                      <Info className='mt-0.5 h-4 w-4 shrink-0 text-primary' />
                    )}
                    <div className='min-w-0 flex-1 space-y-0.5'>
                      <p className='text-xs font-bold leading-snug text-foreground'>{n.title}</p>
                      <p className='text-[11px] leading-relaxed text-muted-foreground'>
                        {n.description}
                      </p>
                      <p className='pt-1 font-mono text-[9px] text-muted-foreground/60'>
                        {new Date(n.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
