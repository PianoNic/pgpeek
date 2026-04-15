import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Database, Terminal, Command as CmdIcon, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import SchemaTree from './SchemaTree'
import CommandPalette from './CommandPalette'
import AddConnectionDialog from './AddConnectionDialog'
import { useUI } from '@/stores/connection'

export default function Layout() {
  const { connId } = useParams()
  const nav = useNavigate()
  const { toggleCommand } = useUI()

  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health })
  const { data: conns } = useQuery({
    queryKey: ['connections'],
    queryFn: api.listConnections,
  })

  const activeConn = conns?.find((c) => c.id === connId) ?? conns?.[0]

  useEffect(() => {
    if (!connId && activeConn) nav(`/c/${activeConn.id}`, { replace: true })
  }, [connId, activeConn, nav])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        toggleCommand()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [toggleCommand])

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 bg-card/40 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/50 text-primary-foreground">
            <Database className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">pgpeek</span>
          <Badge variant="outline" className="text-[10px] font-normal">
            v0.1
          </Badge>
        </div>

        <Separator orientation="vertical" className="h-5" />

        <ConnectionSwitcher connections={conns ?? []} active={activeConn?.id} />

        <div className="ml-auto flex items-center gap-2">
          {health?.read_only && (
            <Badge variant="warning" className="gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> read-only
            </Badge>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={toggleCommand}
                className="gap-2 font-normal text-muted-foreground"
              >
                <CmdIcon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Search</span>
                <kbd className="hidden pointer-events-none select-none rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] md:inline">
                  Ctrl K
                </kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Command palette (Ctrl+K)</TooltipContent>
          </Tooltip>
          {activeConn && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => nav(`/c/${activeConn.id}/query`)}
              className="gap-2"
            >
              <Terminal className="h-3.5 w-3.5" />
              SQL
            </Button>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-border/60 bg-card/20">
          {activeConn ? (
            <SchemaTree connId={activeConn.id} />
          ) : (
            <EmptySidebar />
          )}
        </aside>
        <main className="min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}

function ConnectionSwitcher({
  connections,
  active,
}: {
  connections: { id: string; name: string; host?: string | null; database?: string | null }[]
  active?: string
}) {
  const nav = useNavigate()
  const c = connections.find((x) => x.id === active) ?? connections[0]
  return (
    <div className="flex items-center gap-2">
      <AddConnectionDialog>
        <Button size="icon" variant="ghost" className="h-7 w-7">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </AddConnectionDialog>
      {c ? (
        <button
          onClick={() => nav(`/c/${c.id}`)}
          className="group flex items-center gap-2 rounded-md px-2 py-1 text-xs text-foreground/80 hover:bg-accent"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,0.9)]" />
          <span className="font-medium">{c.database || c.name}</span>
          {c.host && <span className="text-muted-foreground">@ {c.host}</span>}
        </button>
      ) : (
        <span className="text-xs text-muted-foreground">no connection</span>
      )}
    </div>
  )
}

function EmptySidebar() {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
      <div>
        <Database className="mx-auto mb-2 h-5 w-5 opacity-40" />
        No connection yet. Set <code className="rounded bg-muted px-1">DATABASE_URL</code> or add one.
      </div>
    </div>
  )
}
