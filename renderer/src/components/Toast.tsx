import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react'
import { useToast } from '@/hooks/useToast'

const icons = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle
}

const styles = {
  success: 'border-status-online/30 bg-status-online/10 text-foreground',
  info: 'border-primary/30 bg-primary/10 text-foreground',
  warning: 'border-status-away/30 bg-status-away/10 text-foreground',
  error: 'border-destructive/30 bg-destructive/10 text-foreground'
}

const iconStyles = {
  success: 'text-status-online',
  info: 'text-primary',
  warning: 'text-status-away',
  error: 'text-destructive'
}

export function ToastContainer() {
  const { toasts, removeToast, pauseToast, resumeToast } = useToast()

  return (
    <div
      role='status'
      aria-live='polite'
      className='pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2'
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = icons[t.type]
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              onMouseEnter={() => pauseToast(t.id)}
              onMouseLeave={() => resumeToast(t.id)}
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-3.5 shadow-xl backdrop-blur-md ${styles[t.type]}`}
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconStyles[t.type]}`} />
              <div className='min-w-0 flex-1'>
                <p className='text-xs font-extrabold text-foreground'>{t.title}</p>
                {t.message && (
                  <p className='mt-0.5 whitespace-pre-line text-[11px] text-muted-foreground'>
                    {t.message}
                  </p>
                )}
                {t.actions && t.actions.length > 0 && (
                  <div className='mt-2 flex items-center gap-2'>
                    {t.actions.map((act, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          act.onClick()
                          removeToast(t.id)
                        }}
                        className='rounded-lg border border-border/50 bg-background/80 px-2.5 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-background'
                      >
                        {act.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => removeToast(t.id)}
                aria-label='Dismiss notification'
                className='shrink-0 text-muted-foreground transition-colors hover:text-foreground'
              >
                <X className='h-4 w-4' />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
