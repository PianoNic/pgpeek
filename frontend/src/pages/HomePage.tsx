import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Database, Table2, Terminal, Key, Link2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { formatNumber } from '@/lib/utils'

export default function HomePage() {
  const { connId } = useParams()
  const { data: tables } = useQuery({
    queryKey: ['tables', connId],
    queryFn: () => (connId ? api.listTables(connId) : Promise.resolve([])),
    enabled: Boolean(connId),
  })

  if (!connId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg">
          <Database className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to pgpeek</h1>
          <p className="text-sm text-muted-foreground">
            Add a connection to get started, or set <code className="rounded bg-muted px-1">DATABASE_URL</code>.
          </p>
        </div>
      </div>
    )
  }

  const byKind = { table: 0, view: 0 }
  const bySchema: Record<string, number> = {}
  for (const t of tables ?? []) {
    byKind[t.kind]++
    bySchema[t.schema] = (bySchema[t.schema] ?? 0) + 1
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 overflow-y-auto p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Pick a table on the left, or hit <kbd className="mx-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
          to search.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat icon={<Table2 className="h-4 w-4" />} label="Tables" value={formatNumber(byKind.table)} />
        <Stat icon={<Link2 className="h-4 w-4" />} label="Views" value={formatNumber(byKind.view)} />
        <Stat icon={<Key className="h-4 w-4" />} label="Schemas" value={formatNumber(Object.keys(bySchema).length)} />
        <Stat icon={<Terminal className="h-4 w-4" />} label="Connection" value={connId} mono />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Schemas
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(bySchema).map(([s, n]) => (
            <div
              key={s}
              className="rounded-lg border border-border/60 bg-card/40 p-3"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-sm">{s}</span>
                <Badge variant="secondary" className="font-mono">
                  {n}
                </Badge>
              </div>
            </div>
          ))}
          {!tables?.length && (
            <div className="col-span-full rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              No tables yet.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-b from-card/60 to-card/20 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={
          'mt-2 truncate text-2xl font-semibold tracking-tight ' +
          (mono ? 'font-mono text-base' : '')
        }
      >
        {value}
      </div>
    </div>
  )
}
