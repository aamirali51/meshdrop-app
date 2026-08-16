import { useState, useMemo } from 'react'
import { History as HistoryIcon, Search, ArrowLeftRight, Tv, Trash2 } from 'lucide-react'
import { useActivity } from '@/hooks/useActivity'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/Modal'
import type { ActivityType } from '@/types'

type Filter = 'all' | 'transfer' | 'session'

export function History() {
  const { activity, clearHistory } = useActivity()
  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState<Filter>('all')
  const [confirmClear, setConfirmClear] = useState(false)

  const filtered = useMemo(() => {
    const list = activity.filter((item) => {
      if (item.type === 'notification') return false
      if (filterType !== 'all' && item.type !== filterType) return false
      if (
        query &&
        !item.title.toLowerCase().includes(query.toLowerCase()) &&
        !(item.description || '').toLowerCase().includes(query.toLowerCase())
      ) {
        return false
      }
      return true
    })
    return [...list].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [activity, query, filterType])

  const TypeIcon = (type: ActivityType) =>
    type === 'transfer' ? (
      <ArrowLeftRight className='h-4 w-4 text-primary' />
    ) : (
      <Tv className='h-4 w-4 text-accent' />
    )

  return (
    <div className='space-y-6 pb-12'>
      {/* Header */}
      <div>
        <h2 className='text-xl font-black text-foreground'>History</h2>
        <p className='text-xs text-muted-foreground'>
          A searchable record of transfers and remote sessions.
        </p>
      </div>

      {/* Filter Bar */}
      <div className='flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3'>
        <div className='relative flex-1 max-w-md'>
          <Search className='absolute left-3.5 top-3 h-4 w-4 text-muted-foreground' />
          <input
            type='text'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search history by title or description...'
            className='w-full rounded-xl border border-border/60 bg-card/40 pl-10 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all'
          />
        </div>

        <div className='flex items-center gap-2'>
          <div className='flex items-center gap-1 rounded-xl bg-muted/40 p-1 border border-border/40 text-xs w-fit'>
            {(['all', 'transfer', 'session'] as Filter[]).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`rounded-lg px-3 py-1 text-xs font-bold capitalize transition-all ${
                  filterType === t
                    ? 'bg-background text-foreground shadow-sm border border-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {activity.length > 0 && (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setConfirmClear(true)}
              className='h-8 gap-1.5 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
              title='Clear transfer history'
            >
              <Trash2 className='h-3.5 w-3.5' />
              Clear History
            </Button>
          )}
        </div>
      </div>

      {/* History Table */}
      <Card className='glass-card border-border/60 overflow-hidden'>
        <div className='overflow-x-auto'>
          <table className='w-full text-left text-xs'>
            <thead className='border-b border-border/50 bg-muted/30 text-muted-foreground uppercase font-bold text-[10px] tracking-wider'>
              <tr>
                <th className='p-3.5'>Type</th>
                <th className='p-3.5'>Event</th>
                <th className='p-3.5'>Timestamp</th>
                <th className='p-3.5'>Method</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border/30 font-medium'>
              {filtered.map((item) => (
                <tr key={item.id} className='hover:bg-card/60 transition-colors'>
                  <td className='p-3.5'>
                    <span className='flex items-center gap-1.5'>
                      {TypeIcon(item.type)}
                      <span className='capitalize text-muted-foreground'>{item.type}</span>
                    </span>
                  </td>
                  <td className='p-3.5'>
                    <p className='font-bold text-foreground'>{item.title}</p>
                    {item.description && (
                      <p className='text-[10px] text-muted-foreground truncate max-w-md'>
                        {item.description}
                      </p>
                    )}
                  </td>
                  <td className='p-3.5 font-mono text-muted-foreground'>
                    {new Date(item.timestamp).toLocaleString()}
                  </td>
                  <td className='p-3.5 font-mono text-[10px] text-muted-foreground'>
                    {item.transferMethod || '—'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className='p-10 text-center text-xs text-muted-foreground'>
                    <HistoryIcon className='mx-auto mb-2 h-6 w-6 text-muted-foreground/40' />
                    No records yet. Completed transfers and session activity will appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {filtered.length > 0 && (
        <p className='text-center text-[10px] text-muted-foreground/70'>
          Records are written as events happen.
        </p>
      )}

      {/* Clear History Confirmation */}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title='Clear transfer history?'
        description='All transfer and session records will be permanently removed. This cannot be undone.'
        confirmLabel='Clear History'
        onConfirm={clearHistory}
      />
    </div>
  )
}
