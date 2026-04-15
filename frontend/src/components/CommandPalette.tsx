import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Table2, Terminal, Eye, Database } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { api } from '@/lib/api'
import { useUI } from '@/stores/connection'

export default function CommandPalette() {
  const { commandOpen, setCommandOpen } = useUI()
  const { connId } = useParams()
  const nav = useNavigate()

  const { data: tables = [] } = useQuery({
    queryKey: ['tables', connId],
    queryFn: () => (connId ? api.listTables(connId) : Promise.resolve([])),
    enabled: Boolean(connId),
  })

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: api.listConnections,
  })

  const go = (path: string) => {
    setCommandOpen(false)
    nav(path)
  }

  return (
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
      <CommandInput placeholder="Search tables, run query, switch connection…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {connId && (
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => go(`/c/${connId}/query`)}>
              <Terminal /> Open SQL editor
            </CommandItem>
          </CommandGroup>
        )}
        {connId && tables.length > 0 && (
          <CommandGroup heading="Tables">
            {tables.map((t) => (
              <CommandItem
                key={`${t.schema}.${t.name}`}
                onSelect={() =>
                  go(
                    `/c/${connId}/t/${encodeURIComponent(t.schema)}/${encodeURIComponent(t.name)}`,
                  )
                }
                value={`${t.schema}.${t.name}`}
              >
                {t.kind === 'view' ? <Eye /> : <Table2 />}
                <span className="font-mono text-[13px]">
                  {t.schema}.{t.name}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {connections.length > 1 && (
          <CommandGroup heading="Connections">
            {connections.map((c) => (
              <CommandItem
                key={c.id}
                onSelect={() => go(`/c/${c.id}`)}
                value={`${c.name} ${c.host ?? ''} ${c.database ?? ''}`}
              >
                <Database />
                <span>{c.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {c.host ?? ''} {c.database ?? ''}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
