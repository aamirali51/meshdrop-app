import { useMemo, useState } from 'react'
import { History as HistoryIcon, ArrowLeftRight, Tv, Bell } from 'lucide-react'
import { useActivity } from '@/hooks/useActivity'
import { Card, CardContent } from '@/components/ui/card'
import { formatTime } from '@/lib/format'
import type { ActivityType } from '@/types'

type Filter = 'all' | ActivityType

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'transfer', label: 'Transfers' },
  { key: 'session', label: 'Sessions' },
  { key: 'notification', label: 'Notifications' }
]

const TYPE_META: Record<ActivityType, { icon: React.ReactNode; label: string; styles: string }> = {
  transfer: {
    icon: <ArrowLeftRight className='h-4 w-4 text-primary' />,
    label: 'Transfer',
    styles: 'bg-primary/10 text-primary border-primary/20'
  },
  session: {
    icon: <Tv className='h-4 w-4 text-accent' />,
    label: 'Session',
    styles: 'bg-accent/10 text-accent border-accent/20'
  },
  notification: {
    icon: <Bell className='h-4 w-4 text-status-away' />,
    label: 'Notification',
    styles: 'bg-status-away/10 text-status-away border-status-away/20'
  }
}

export function Activity() {
  const { activity } = useActivity()
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = useMemo(() => {
    const list = filter === 'all' ? activity : activity.filter((a) => a.type === filter)
    return [...list].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [activity, filter])

  return (
    <div className='space-y-6 pb-12'>
      <div>
        <h2 className='text-xl font-black text-foreground'>Activity</h2>
        <p className='text-xs text-muted-foreground'>
          Transfers, sessions, and notifications — a live timeline.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className='flex items-center gap-1 rounded-xl bg-muted/40 p-1 border border-border/40 text-xs w-fit'>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1 text-xs font-bold capitalize transition-all ${
              filter === f.key
                ? 'bg-background text-foreground shadow-sm border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <Card className='glass-card border-border/60'>
        <CardContent className='p-0 divide-y divide-border/40'>
          {filtered.length === 0 ? (
            <div className='p-12 text-center space-y-3'>
              <div className='mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-muted/40 text-muted-foreground border border-border/40'>
                <HistoryIcon className='h-7 w-7' />
              </div>
              <div className='space-y-1'>
                <h3 className='text-sm font-bold text-foreground'>No Activity Yet</h3>
                <p className='text-xs text-muted-foreground max-w-sm mx-auto'>
                  Transfers you send or receive and session requests you approve will show up here.
                </p>
              </div>
            </div>
          ) : (
            filtered.map((item) => {
              const meta = TYPE_META[item.type] || TYPE_META.notification
              const time = new Date(item.timestamp)
              return (
                <div key={item.id} className='p-4 flex items-start gap-3'>
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border shrink-0 ${meta.styles}`}
                  >
                    {meta.icon}
                  </div>

                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center justify-between gap-2'>
                      <p className='text-sm font-bold text-foreground truncate'>{item.title}</p>
                      <span className='text-[10px] font-mono text-muted-foreground shrink-0'>
                        {formatTime(item.timestamp)}
                      </span>
                    </div>
                    {item.description && (
                      <p className='text-[11px] text-muted-foreground truncate'>
                        {item.description}
                      </p>
                    )}
                    <div className='flex items-center gap-2 pt-1'>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-extrabold border capitalize ${meta.styles}`}
                      >
                        {meta.label}
                      </span>
                      {item.transferMethod && (
                        <span className='text-[9px] font-mono text-muted-foreground/70'>
                          {item.transferMethod}
                        </span>
                      )}
                      {item.status && (
                        <span className='text-[9px] font-mono text-muted-foreground/70 capitalize'>
                          {item.status.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {filtered.length > 0 && (
        <p className='text-center text-[10px] text-muted-foreground/70'>
          A live record of transfers, sessions, and notifications.
        </p>
      )}
    </div>
  )
}
