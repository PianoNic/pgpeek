import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Table2, Eye, Search } from 'lucide-react'
import { api, type TableSummary } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export default function SchemaTree({ connId }: { connId: string }) {
  const { data: tables = [] } = useQuery({
    queryKey: ['tables', connId],
    queryFn: () => api.listTables(connId),
  })
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const grouped = useMemo(() => {
    const g: Record<string, TableSummary[]> = {}
    for (const t of tables) {
      if (filter && !(`${t.schema}.${t.name}`).toLowerCase().includes(filter.toLowerCase())) continue
      g[t.schema] ??= []
      g[t.schema].push(t)
    }
    return g
  }, [tables, filter])

  // auto-expand schemas with results when filtering, default-expand 'public'
  const schemas = Object.keys(grouped).sort()
  const isOpen = (s: string) => (filter ? true : expanded[s] ?? s === 'public')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter tables…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4">
        {schemas.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">No tables</div>
        )}
        {schemas.map((s) => (
          <div key={s} className="mb-1">
            <button
              onClick={() => setExpanded((e) => ({ ...e, [s]: !isOpen(s) }))}
              className="flex w-full items-center gap-1 rounded px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-accent"
            >
              <ChevronRight
                className={cn('h-3 w-3 transition-transform', isOpen(s) && 'rotate-90')}
              />
              <span>{s}</span>
              <span className="ml-auto text-[10px] font-normal">{grouped[s].length}</span>
            </button>
            {isOpen(s) && (
              <div className="mt-0.5 flex flex-col">
                {grouped[s].map((t) => (
                  <TableRow key={`${s}.${t.name}`} connId={connId} t={t} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function TableRow({ connId, t }: { connId: string; t: TableSummary }) {
  const nav = useNavigate()
  const { schema: urlSchema, table: urlTable } = useParams()
  const active = urlSchema === t.schema && urlTable === t.name
  return (
    <button
      onClick={() =>
        nav(`/c/${connId}/t/${encodeURIComponent(t.schema)}/${encodeURIComponent(t.name)}`)
      }
      className={cn(
        'group flex items-center gap-2 rounded px-2 py-1 pl-5 text-left text-sm transition-colors',
        active
          ? 'bg-primary/15 text-foreground'
          : 'text-foreground/70 hover:bg-accent hover:text-foreground',
      )}
    >
      {t.kind === 'view' ? (
        <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate font-mono text-[13px]">{t.name}</span>
    </button>
  )
}
