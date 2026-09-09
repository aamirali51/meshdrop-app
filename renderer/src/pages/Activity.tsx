import { useMemo, useState, useEffect } from 'react'
import { History as HistoryIcon, ArrowLeftRight, Tv, Bell } from 'lucide-react'
import { useActivity } from '@/hooks/useActivity'
import { Card, CardContent } from '@/components/ui/card'
import { formatFullTimestamp } from '@/lib/format'
import type { ActivityType } from '@/types'

type Filter = 'all' | ActivityType

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'transfer', label: 'Transfers' },
  { key: 'session', label: 'Watch Sessions' },
  { key: 'notification', label: 'System' },
]

const TYPE_META: Record<ActivityType, { icon: React.ReactNode; label: string; styles: string }> = {
  transfer: { icon: <ArrowLeftRight className="h-4 w-4 text-primary" />, label: 'Transfer', styles: 'bg-primary/10 text-primary border-primary/20' },
  session: { icon: <Tv className="h-4 w-4 text-accent" />, label: 'Session', styles: 'bg-accent/10 text-accent border-accent/20' },
  notification: { icon: <Bell className="h-4 w-4 text-amber-500" />, label: 'Notification', styles: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
}

export function Activity() {
  const { activity } = useActivity()
  const [filter, setFilter] = useState<Filter>('all')
  const [hashTick, setHashTick] = useState(0)
  const isHistoryView = typeof window !== 'undefined' && window.location.hash.includes('view=history')

  useEffect(() => {
    const onHash = () => setHashTick((n) => n + 1)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  void hashTick

  const filtered = useMemo(() => {
    const list = filter === 'all' ? activity : activity.filter((a) => a.type === filter)
    return [...list].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [activity, filter])

  return (
    <div className="space-y-6">
      {isHistoryView && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 font-medium">
            <HistoryIcon className="h-3 w-3" /> History — searchable in this timeline
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full bg-muted/40 p-1 border border-border/40 text-xs w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`rounded-full px-3 py-1 text-xs font-bold capitalize transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === f.key ? 'bg-background text-foreground shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="glass-card border-border/60">
        <CardContent className="p-0 divide-y divide-border/40">
          {filtered.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-muted/40 text-muted-foreground border border-border/40">
                <HistoryIcon className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-foreground">No Activity Yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">Transfers you send or receive and session requests you approve will show up here.</p>
              </div>
            </div>
          ) : (
            filtered.map((item) => {
              const meta = TYPE_META[item.type] || TYPE_META.notification
              return (
                <div key={item.id} className="p-4 flex items-start gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl border shrink-0 ${meta.styles}`}>{meta.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-foreground truncate" title={item.title}>
                        {item.title}
                      </p>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">{formatFullTimestamp(item.timestamp)}</span>
                    </div>
                    {item.description && (
                      <p className="text-[11px] text-muted-foreground truncate" title={item.description}>
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-extrabold border capitalize ${meta.styles}`}>{meta.label}</span>
                      {item.transferMethod && <span className="text-[9px] font-mono text-muted-foreground/70">{item.transferMethod}</span>}
                      {item.status && <span className="text-[9px] font-mono text-muted-foreground/70 capitalize">{item.status.replace('_', ' ')}</span>}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {filtered.length > 0 && <p className="text-center text-[10px] text-muted-foreground/70">A live record of transfers, sessions, and notifications.</p>}
    </div>
  )
}
