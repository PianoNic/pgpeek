import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, Key, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, type TableInfo } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn, formatCell, formatNumber } from '@/lib/utils'

const PAGE = 100

type Sort = { column: string; order: 'asc' | 'desc' } | null

export default function DataGrid({
  connId,
  schema,
  table,
  info,
}: {
  connId: string
  schema: string
  table: string
  info: TableInfo
}) {
  const [sort, setSort] = useState<Sort>(null)
  const qc = useQueryClient()

  const pkCols = info.primary_key
  const hasPK = pkCols.length > 0

  const queryKey = ['rows', connId, schema, table, sort?.column, sort?.order]

  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      api.rows(connId, schema, table, {
        limit: PAGE,
        offset: (pageParam as number) * PAGE,
        sort: sort?.column,
        order: sort?.order,
        include_total: pageParam === 0,
      }),
    initialPageParam: 0,
    getNextPageParam: (last, allPages) =>
      last.rows.length < PAGE ? undefined : allPages.length,
  })

  const pages = q.data?.pages ?? []
  const rows = useMemo(() => pages.flatMap((p) => p.rows), [pages])
  const columns = pages[0]?.columns ?? info.columns.map((c) => c.name)
  const total = pages[0]?.total ?? null

  // virtualization
  const parentRef = useRef<HTMLDivElement>(null)
  const rv = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 12,
  })

  useEffect(() => {
    const [last] = [...rv.getVirtualItems()].reverse()
    if (!last) return
    if (last.index >= rows.length - 20 && q.hasNextPage && !q.isFetchingNextPage) {
      q.fetchNextPage()
    }
  }, [rv.getVirtualItems(), rows.length, q])

  const updateMut = useMutation({
    mutationFn: ({ pk, set }: { pk: Record<string, unknown>; set: Record<string, unknown> }) =>
      api.updateRow(connId, schema, table, pk, set),
    onSuccess: () => {
      toast.success('Row updated')
      qc.invalidateQueries({ queryKey: ['rows', connId, schema, table] })
    },
    onError: (e) => toast.error(String(e)),
  })

  const deleteMut = useMutation({
    mutationFn: (pk: Record<string, unknown>) => api.deleteRow(connId, schema, table, pk),
    onSuccess: () => {
      toast.success('Row deleted')
      qc.invalidateQueries({ queryKey: ['rows', connId, schema, table] })
    },
    onError: (e) => toast.error(String(e)),
  })

  const toggleSort = (col: string) => {
    setSort((s) => {
      if (s?.column !== col) return { column: col, order: 'asc' }
      if (s.order === 'asc') return { column: col, order: 'desc' }
      return null
    })
  }

  const colWidths = useMemo(() => {
    const widths: Record<string, number> = {}
    for (const c of columns) {
      const sample = rows.slice(0, 50).map((r) => {
        const i = columns.indexOf(c)
        return formatCell(r[i]).length
      })
      const max = Math.max(c.length, ...sample, 8)
      widths[c] = Math.min(Math.max(max * 8 + 32, 110), 380)
    }
    return widths
  }, [columns, rows])

  const getPK = (row: unknown[]): Record<string, unknown> | null => {
    if (!hasPK) return null
    const pk: Record<string, unknown> = {}
    for (const col of pkCols) {
      const idx = columns.indexOf(col)
      if (idx === -1) return null
      pk[col] = row[idx]
    }
    return pk
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-border/60 bg-card/30 px-4 py-2 text-xs">
        <span className="font-mono text-muted-foreground">
          <span className="text-foreground/60">{schema}.</span>
          <span className="text-foreground font-semibold">{table}</span>
        </span>
        <Badge variant="secondary" className="font-mono">
          {rows.length.toLocaleString()}
          {total !== null ? ` / ${formatNumber(total)}` : ''} rows loaded
        </Badge>
        {info.estimated_rows !== null && total === null && (
          <span className="text-muted-foreground">
            ~{formatNumber(info.estimated_rows)} estimated
          </span>
        )}
        {!hasPK && (
          <Badge variant="warning">no primary key — edits disabled</Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          {q.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {sort && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              onClick={() => setSort(null)}
            >
              clear sort
            </Button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ minWidth: 'max-content' }}>
          <Header
            columns={columns}
            widths={colWidths}
            info={info}
            sort={sort}
            onSort={toggleSort}
            hasActions={hasPK}
          />
          <div style={{ height: rv.getTotalSize(), position: 'relative' }}>
            {rv.getVirtualItems().map((v) => {
              const row = rows[v.index]
              if (!row) return null
              const pk = getPK(row)
              return (
                <Row
                  key={v.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    transform: `translateY(${v.start}px)`,
                    height: v.size,
                  }}
                  columns={columns}
                  widths={colWidths}
                  row={row}
                  info={info}
                  pk={pk}
                  onSave={(col, value) => {
                    if (!pk) return
                    updateMut.mutate({ pk, set: { [col]: value } })
                  }}
                  onDelete={() => pk && deleteMut.mutate(pk)}
                />
              )
            })}
          </div>
        </div>
      </div>

      {q.isFetchingNextPage && (
        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading more…
        </div>
      )}
    </div>
  )
}

function Header({
  columns,
  widths,
  info,
  sort,
  onSort,
  hasActions,
}: {
  columns: string[]
  widths: Record<string, number>
  info: TableInfo
  sort: Sort
  onSort: (col: string) => void
  hasActions: boolean
}) {
  const byName = useMemo(
    () => Object.fromEntries(info.columns.map((c) => [c.name, c])),
    [info.columns],
  )
  return (
    <div className="sticky top-0 z-10 flex border-b border-border bg-card/90 backdrop-blur text-[11px] uppercase tracking-wide">
      {columns.map((c) => {
        const meta = byName[c]
        const isSorted = sort?.column === c
        return (
          <button
            key={c}
            onClick={() => onSort(c)}
            style={{ width: widths[c], minWidth: widths[c] }}
            className={cn(
              'flex items-center gap-1.5 border-r border-border/50 px-3 py-2 text-left font-medium text-muted-foreground hover:bg-accent/50',
            )}
          >
            {meta?.is_pk && <Key className="h-3 w-3 text-amber-400" />}
            <span className="truncate normal-case font-mono text-[12px] text-foreground/90">
              {c}
            </span>
            <span className="ml-1 font-normal lowercase text-[10px] text-muted-foreground/70">
              {meta?.data_type}
            </span>
            {isSorted &&
              (sort.order === 'asc' ? (
                <ArrowUp className="ml-auto h-3 w-3 text-primary" />
              ) : (
                <ArrowDown className="ml-auto h-3 w-3 text-primary" />
              ))}
          </button>
        )
      })}
      {hasActions && <div className="w-10 border-r border-border/50" />}
    </div>
  )
}

function Row({
  columns,
  widths,
  row,
  info,
  pk,
  onSave,
  onDelete,
  style,
}: {
  columns: string[]
  widths: Record<string, number>
  row: unknown[]
  info: TableInfo
  pk: Record<string, unknown> | null
  onSave: (col: string, v: unknown) => void
  onDelete: () => void
  style: React.CSSProperties
}) {
  return (
    <div
      style={style}
      className="group flex w-full items-stretch border-b border-border/30 hover:bg-accent/25"
    >
      {columns.map((c, i) => (
        <Cell
          key={c}
          col={c}
          value={row[i]}
          width={widths[c]}
          editable={Boolean(pk) && !info.columns.find((x) => x.name === c)?.is_pk}
          onSave={(v) => onSave(c, v)}
        />
      ))}
      {pk && (
        <div className="flex w-10 shrink-0 items-center justify-center border-r border-border/30">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                onClick={onDelete}
                className="h-6 w-6 opacity-0 transition hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete row</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  )
}

function Cell({
  col,
  value,
  width,
  editable,
  onSave,
}: {
  col: string
  value: unknown
  width: number
  editable: boolean
  onSave: (v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(formatCell(value))

  useEffect(() => setDraft(formatCell(value)), [value])

  const commit = () => {
    setEditing(false)
    if (draft === formatCell(value)) return
    let parsed: unknown = draft
    // Try parse as JSON for null, numbers, booleans, objects
    if (draft === '') parsed = null
    else if (draft === 'null' || draft === 'NULL') parsed = null
    else if (/^-?\d+$/.test(draft)) parsed = Number(draft)
    else if (/^-?\d*\.\d+$/.test(draft)) parsed = Number(draft)
    else if (draft === 'true') parsed = true
    else if (draft === 'false') parsed = false
    else if (draft.startsWith('{') || draft.startsWith('[')) {
      try {
        parsed = JSON.parse(draft)
      } catch {}
    }
    onSave(parsed)
  }

  const display = formatCell(value)
  const isNull = value === null || value === undefined

  return (
    <div
      style={{ width, minWidth: width }}
      className="group/cell border-r border-border/30 text-[13px]"
      onDoubleClick={() => editable && setEditing(true)}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(formatCell(value))
              setEditing(false)
            }
          }}
          className="h-full w-full border border-primary/60 bg-background px-3 py-1 font-mono text-[13px] outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <div
          className={cn(
            'truncate px-3 py-1.5 font-mono',
            isNull && 'italic text-muted-foreground/50',
            editable && 'cursor-text',
          )}
          title={display}
        >
          {isNull ? 'NULL' : display}
        </div>
      )}
    </div>
  )
}
