import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, History as HistoryIcon, Search, Trash2, Tv, Bell } from 'lucide-react'
import { useActivity } from '@/hooks/useActivity'
import { formatFullTimestamp } from '@/lib/format'
import { EmptyState } from '@/ui/primitives/EmptyState'
import { Skeleton } from '@/ui/primitives/Skeleton'
import { Button } from '@/ui/primitives/Button'
import { Input } from '@/ui/primitives/Input'
import { ConfirmDialog } from '@/components/Modal'
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
  session: { icon: <Tv className="h-4 w-4 text-violet-500" />, label: 'Session', styles: 'bg-violet-500/10 text-violet-500 border-violet-500/20' },
  notification: { icon: <Bell className="h-4 w-4 text-amber-500" />, label: 'System', styles: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
}

export function Activity() {
  const { activity, clearHistory } = useActivity()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [hashTick, setHashTick] = useState(0)
  const [loading, setLoading] = useState(true)
  const isHistoryView = typeof window !== 'undefined' && window.location.hash.includes('view=history')

  useEffect(() => {
    const onHash = () => setHashTick((n) => n + 1)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Skeleton window: same data source as before (useActivity), just a calm
  // first-paint so an empty store doesn't flash the empty state.
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 420)
    return () => window.clearTimeout(t)
  }, [])

  void hashTick

  const filtered = useMemo(() => {
    const byType = filter === 'all' ? activity : activity.filter((a) => a.type === filter)
    const q = query.trim().toLowerCase()
    const searched = q
      ? byType.filter(
          (a) => a.title.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q)
        )
      : byType
    return [...searched].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [activity, filter, query])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search activity…"
            aria-label="Search activity"
            className="h-10 rounded-xl border-border/60 bg-card/60 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 || query ? (
            <span className="hidden sm:inline text-xs text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
            </span>
          ) : null}
          {activity.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)} className="h-9 gap-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Clear History
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-border/40 bg-muted/40 p-1 text-xs">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 ${
                filter === f.key ? 'bg-background text-foreground shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {isHistoryView && (
          <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
            <HistoryIcon className="h-3 w-3" /> History view
          </span>
        )}
      </div>

      <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="space-y-0 p-4">
            <Skeleton shape="row" className="h-[64px]" />
            <Skeleton shape="row" className="h-[64px]" />
            <Skeleton shape="row" className="h-[64px]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<HistoryIcon className="h-6 w-6" />}
              title={query ? 'No matches' : 'No activity yet'}
              description={
                query
                  ? `Nothing matched “${query.trim()}”. Try a different search or filter.`
                  : 'Transfers you send or receive and session requests you approve will show up here.'
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {filtered.map((item) => {
              const meta = TYPE_META[item.type] || TYPE_META.notification
              return (
                <div key={item.id} className="flex items-start gap-3 p-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${meta.styles}`}>{meta.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-foreground" title={item.title}>
                        {item.title}
                      </p>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground" title={String(item.timestamp)}>
                        {formatFullTimestamp(item.timestamp)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="truncate text-xs text-muted-foreground" title={item.description}>
                        {item.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1.5">
                      <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold capitalize ${meta.styles}`}>{meta.label}</span>
                      {item.transferMethod && <span className="font-mono text-[10px] text-muted-foreground/70">{item.transferMethod}</span>}
                      {item.status && <span className="font-mono text-[10px] capitalize text-muted-foreground/70">{String(item.status).replace('_', ' ')}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {filtered.length > 0 && <p className="text-center text-[11px] text-muted-foreground/70">Relative timestamps for the last 7 days, then absolute dates.</p>}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear history?"
        description="All transfer and session records will be permanently removed. This cannot be undone."
        confirmLabel="Clear History"
        onConfirm={clearHistory}
      />
    </div>
  )
}
