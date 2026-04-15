import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Key, Hash, Link2 } from 'lucide-react'
import { api } from '@/lib/api'
import DataGrid from '@/components/DataGrid'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { formatNumber } from '@/lib/utils'

export default function TablePage() {
  const { connId, schema, table } = useParams()
  const { data: info, isLoading, error } = useQuery({
    queryKey: ['info', connId, schema, table],
    queryFn: () => api.tableInfo(connId!, schema!, table!),
    enabled: Boolean(connId && schema && table),
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> loading…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {String(error)}
      </div>
    )
  }
  if (!info || !connId || !schema || !table) return null

  return (
    <Tabs defaultValue="data" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-card/30 px-4 py-2">
        <TabsList className="h-8">
          <TabsTrigger value="data" className="text-xs">
            Data
          </TabsTrigger>
          <TabsTrigger value="structure" className="text-xs">
            Structure
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {info.estimated_rows !== null && (
            <span>~{formatNumber(info.estimated_rows)} rows</span>
          )}
        </div>
      </div>
      <TabsContent value="data" className="m-0 min-h-0 flex-1">
        <DataGrid connId={connId} schema={schema} table={table} info={info} />
      </TabsContent>
      <TabsContent value="structure" className="m-0 min-h-0 flex-1 overflow-auto p-4">
        <Structure info={info} />
      </TabsContent>
    </Tabs>
  )
}

function Structure({ info }: { info: import('@/lib/api').TableInfo }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Hash className="h-3.5 w-3.5" />
          Columns
        </h3>
        <div className="overflow-hidden rounded-lg border border-border/60 bg-card/40">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Nullable</th>
                <th className="px-3 py-2 text-left font-medium">Default</th>
              </tr>
            </thead>
            <tbody>
              {info.columns.map((c) => (
                <tr key={c.name} className="border-t border-border/40">
                  <td className="px-3 py-2 font-mono">
                    <span className="flex items-center gap-2">
                      {c.is_pk && <Key className="h-3 w-3 text-amber-400" />}
                      {c.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {c.data_type}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {c.nullable ? (
                      <Badge variant="secondary">nullable</Badge>
                    ) : (
                      <Badge variant="outline">not null</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {c.default ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {info.indexes.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Indexes
          </h3>
          <div className="space-y-1 font-mono text-sm">
            {info.indexes.map((i) => (
              <div
                key={i.name}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-1.5"
              >
                {i.primary && <Key className="h-3 w-3 text-amber-400" />}
                <span>{i.name}</span>
                <span className="text-muted-foreground">({i.columns.join(', ')})</span>
                {i.unique && !i.primary && <Badge variant="secondary">unique</Badge>}
              </div>
            ))}
          </div>
        </section>
      )}

      {info.foreign_keys.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" /> Foreign keys
          </h3>
          <div className="space-y-1 font-mono text-sm">
            {info.foreign_keys.map((f) => (
              <div
                key={f.name}
                className="rounded-md border border-border/60 bg-card/40 px-3 py-1.5"
              >
                <div>
                  <span>({f.columns.join(', ')})</span>
                  <span className="text-muted-foreground"> → </span>
                  <span>
                    {f.ref_schema}.{f.ref_table}({f.ref_columns.join(', ')})
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{f.name}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
