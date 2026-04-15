import { useCallback, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import CodeMirror from '@uiw/react-codemirror'
import { sql as sqlLang, PostgreSQL } from '@codemirror/lang-sql'
import { EditorView, keymap } from '@codemirror/view'
import { Play, History, BookMarked, Save, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn, formatCell, formatDuration, formatNumber } from '@/lib/utils'

type Saved = { id: string; name: string; sql: string }
type HistoryEntry = { sql: string; at: number; ok: boolean; duration_ms: number }

const HISTORY_KEY = 'pgpeek:history'
const SAVED_KEY = 'pgpeek:saved'

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    return []
  }
}
function pushHistory(e: HistoryEntry) {
  const h = [e, ...loadHistory()].slice(0, 100)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
}
function loadSaved(): Saved[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')
  } catch {
    return []
  }
}
function saveSaved(s: Saved[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(s))
}

export default function QueryPage() {
  const { connId } = useParams()
  const [sql, setSql] = useState('SELECT 1;\n')
  const [historyKey, setHistoryKey] = useState(0)
  const [savedKey, setSavedKey] = useState(0)

  // Schema-aware autocomplete
  const { data: tables = [] } = useQuery({
    queryKey: ['tables', connId],
    queryFn: () => (connId ? api.listTables(connId) : Promise.resolve([])),
    enabled: Boolean(connId),
  })

  const schemaMap = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const t of tables) m[`${t.schema}.${t.name}`] = []
    return m
  }, [tables])

  const run = useMutation({
    mutationFn: async () => {
      if (!connId) throw new Error('no connection')
      return api.runQuery(connId, sql)
    },
    onSuccess: (r) => {
      pushHistory({ sql, at: Date.now(), ok: true, duration_ms: r.duration_ms })
      setHistoryKey((k) => k + 1)
    },
    onError: (e) => {
      pushHistory({ sql, at: Date.now(), ok: false, duration_ms: 0 })
      setHistoryKey((k) => k + 1)
      toast.error(String(e))
    },
  })

  const execute = useCallback(() => {
    if (!run.isPending) run.mutate()
  }, [run])

  const cmExtensions = useMemo(
    () => [
      sqlLang({ dialect: PostgreSQL, schema: schemaMap, upperCaseKeywords: true }),
      EditorView.theme({ '&': { height: '100%' } }),
      EditorView.lineWrapping,
      keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            execute()
            return true
          },
        },
      ]),
    ],
    [schemaMap, execute],
  )

  const result = run.data
  const error = run.error ? String(run.error) : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/30 px-4 py-2">
        <Button size="sm" onClick={execute} disabled={run.isPending} className="gap-2">
          {run.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run
          <kbd className="rounded border bg-muted/50 px-1 py-0.5 font-mono text-[10px]">Ctrl ↵</kbd>
        </Button>
        <SaveDialog sql={sql} onSaved={() => setSavedKey((k) => k + 1)} />
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {result && (
            <>
              <Badge variant="success">{formatNumber(result.row_count)} rows</Badge>
              <span>{formatDuration(result.duration_ms)}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: editor + results */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="h-1/2 min-h-[120px] overflow-hidden border-b border-border/60">
            <CodeMirror
              value={sql}
              onChange={setSql}
              theme="dark"
              height="100%"
              basicSetup={{ lineNumbers: true, highlightActiveLine: true, autocompletion: true }}
              extensions={cmExtensions}
              className="h-full bg-card/20"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {error ? (
              <pre className="h-full overflow-auto whitespace-pre-wrap bg-destructive/5 p-4 font-mono text-xs text-destructive">
                {error}
              </pre>
            ) : result ? (
              <ResultGrid
                columns={result.columns}
                rows={result.rows}
                notice={result.notice}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Press Run to execute.
              </div>
            )}
          </div>
        </div>

        {/* Right: history / saved */}
        <aside className="hidden w-72 shrink-0 border-l border-border/60 bg-card/20 lg:flex lg:flex-col">
          <Tabs defaultValue="history" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="m-2 h-8 self-start">
              <TabsTrigger value="history" className="gap-1.5 text-xs">
                <History className="h-3 w-3" /> History
              </TabsTrigger>
              <TabsTrigger value="saved" className="gap-1.5 text-xs">
                <BookMarked className="h-3 w-3" /> Saved
              </TabsTrigger>
            </TabsList>
            <TabsContent value="history" className="mx-0 my-0 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              <HistoryList key={historyKey} onPick={setSql} />
            </TabsContent>
            <TabsContent value="saved" className="mx-0 my-0 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              <SavedList key={savedKey} onPick={setSql} onChange={() => setSavedKey((k) => k + 1)} />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  )
}

function ResultGrid({
  columns,
  rows,
  notice,
}: {
  columns: string[]
  rows: unknown[][]
  notice: string | null
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const rv = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 12,
  })

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {notice || 'No rows.'}
      </div>
    )
  }

  const widths = columns.map((c) => {
    const sample = rows.slice(0, 30).map((r, _i) => {
      const idx = columns.indexOf(c)
      return formatCell(r[idx]).length
    })
    const max = Math.max(c.length, ...sample, 8)
    return Math.min(Math.max(max * 8 + 32, 110), 360)
  })

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ minWidth: 'max-content' }}>
        <div className="sticky top-0 z-10 flex border-b border-border bg-card/90 text-[11px] uppercase tracking-wide">
          {columns.map((c, i) => (
            <div
              key={c}
              style={{ width: widths[i], minWidth: widths[i] }}
              className="border-r border-border/50 px-3 py-2 font-mono text-[12px] text-foreground/90"
            >
              {c}
            </div>
          ))}
        </div>
        <div style={{ height: rv.getTotalSize(), position: 'relative' }}>
          {rv.getVirtualItems().map((v) => {
            const r = rows[v.index]
            return (
              <div
                key={v.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  transform: `translateY(${v.start}px)`,
                  height: v.size,
                }}
                className="flex border-b border-border/30 hover:bg-accent/25"
              >
                {columns.map((c, i) => {
                  const val = r[i]
                  const isNull = val === null || val === undefined
                  return (
                    <div
                      key={c}
                      style={{ width: widths[i], minWidth: widths[i] }}
                      className={cn(
                        'truncate border-r border-border/30 px-3 py-1 font-mono text-[13px]',
                        isNull && 'italic text-muted-foreground/50',
                      )}
                      title={formatCell(val)}
                    >
                      {isNull ? 'NULL' : formatCell(val)}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function HistoryList({ onPick }: { onPick: (sql: string) => void }) {
  const items = loadHistory()
  if (items.length === 0)
    return <div className="p-4 text-center text-xs text-muted-foreground">No history</div>
  return (
    <div className="space-y-1">
      {items.map((e, i) => (
        <button
          key={i}
          onClick={() => onPick(e.sql)}
          className="flex w-full flex-col items-start gap-1 rounded-md border border-transparent px-2 py-1.5 text-left text-xs hover:border-border hover:bg-accent/40"
        >
          <div className="line-clamp-2 font-mono text-[11px] leading-4 text-foreground/90">
            {e.sql.replace(/\s+/g, ' ').trim()}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className={e.ok ? 'text-emerald-400' : 'text-destructive'}>
              {e.ok ? 'ok' : 'error'}
            </span>
            <span>{formatDuration(e.duration_ms)}</span>
            <span>{new Date(e.at).toLocaleTimeString()}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

function SavedList({ onPick, onChange }: { onPick: (sql: string) => void; onChange: () => void }) {
  const items = loadSaved()
  if (items.length === 0)
    return <div className="p-4 text-center text-xs text-muted-foreground">No saved queries</div>
  const remove = (id: string) => {
    saveSaved(items.filter((i) => i.id !== id))
    onChange()
  }
  return (
    <div className="space-y-1">
      {items.map((s) => (
        <div
          key={s.id}
          className="group flex flex-col gap-1 rounded-md border border-transparent px-2 py-1.5 hover:border-border hover:bg-accent/40"
        >
          <button onClick={() => onPick(s.sql)} className="text-left text-sm font-medium">
            {s.name}
          </button>
          <div className="flex items-center justify-between gap-2">
            <div className="line-clamp-1 flex-1 font-mono text-[10px] text-muted-foreground">
              {s.sql.replace(/\s+/g, ' ').trim()}
            </div>
            <button
              onClick={() => remove(s.id)}
              className="opacity-0 group-hover:opacity-100"
              title="Delete"
            >
              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function SaveDialog({ sql, onSaved }: { sql: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const save = () => {
    if (!name.trim()) return
    const all = loadSaved()
    all.unshift({ id: crypto.randomUUID(), name: name.trim(), sql })
    saveSaved(all)
    setOpen(false)
    setName('')
    onSaved()
    toast.success(`Saved "${name.trim()}"`)
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save query</DialogTitle>
          <DialogDescription>Stored locally in your browser.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Daily active users"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
