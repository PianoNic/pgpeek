export type Bookmark = {
  id: string
  name: string
  host?: string | null
  database?: string | null
}

export type TableSummary = { schema: string; name: string; kind: 'table' | 'view' }
export type ColumnInfo = {
  name: string
  data_type: string
  nullable: boolean
  default: string | null
  is_pk: boolean
}
export type IndexInfo = { name: string; columns: string[]; unique: boolean; primary: boolean }
export type FKInfo = {
  name: string
  columns: string[]
  ref_schema: string
  ref_table: string
  ref_columns: string[]
}
export type TableInfo = {
  schema: string
  name: string
  estimated_rows: number | null
  primary_key: string[]
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  foreign_keys: FKInfo[]
}

export type RowsResponse = {
  columns: string[]
  rows: unknown[][]
  total: number | null
}

export type QueryResponse = {
  columns: string[]
  rows: unknown[][]
  row_count: number
  duration_ms: number
  notice: string | null
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    let detail = text
    try {
      detail = JSON.parse(text).detail ?? text
    } catch {}
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  health: () => req<{ ok: boolean; read_only: boolean; auth: boolean }>('/api/health'),
  listConnections: () => req<Bookmark[]>('/api/connections'),
  addConnection: (name: string, url: string) =>
    req<Bookmark>('/api/connections', {
      method: 'POST',
      body: JSON.stringify({ name, url }),
    }),
  deleteConnection: (id: string) =>
    req<{ ok: boolean }>(`/api/connections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listSchemas: (conn: string) =>
    req<string[]>(`/api/connections/${encodeURIComponent(conn)}/schemas`),
  listTables: (conn: string, schema?: string) => {
    const q = schema ? `?schema=${encodeURIComponent(schema)}` : ''
    return req<TableSummary[]>(`/api/connections/${encodeURIComponent(conn)}/tables${q}`)
  },
  tableInfo: (conn: string, schema: string, table: string) =>
    req<TableInfo>(
      `/api/connections/${encodeURIComponent(conn)}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`,
    ),
  rows: (
    conn: string,
    schema: string,
    table: string,
    opts: { limit: number; offset: number; sort?: string; order?: 'asc' | 'desc'; include_total?: boolean },
  ) => {
    const p = new URLSearchParams()
    p.set('limit', String(opts.limit))
    p.set('offset', String(opts.offset))
    if (opts.sort) p.set('sort', opts.sort)
    if (opts.order) p.set('order', opts.order)
    if (opts.include_total) p.set('include_total', 'true')
    return req<RowsResponse>(
      `/api/connections/${encodeURIComponent(conn)}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows?${p}`,
    )
  },
  updateRow: (
    conn: string,
    schema: string,
    table: string,
    pk: Record<string, unknown>,
    set: Record<string, unknown>,
  ) =>
    req<{ ok: boolean; row: Record<string, unknown> }>(
      `/api/connections/${encodeURIComponent(conn)}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows`,
      { method: 'PATCH', body: JSON.stringify({ pk, set }) },
    ),
  deleteRow: (conn: string, schema: string, table: string, pk: Record<string, unknown>) =>
    req<{ ok: boolean; result: string }>(
      `/api/connections/${encodeURIComponent(conn)}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows`,
      { method: 'DELETE', body: JSON.stringify({ pk }) },
    ),
  runQuery: (conn: string, sql: string) =>
    req<QueryResponse>(`/api/connections/${encodeURIComponent(conn)}/query`, {
      method: 'POST',
      body: JSON.stringify({ sql }),
    }),
  explain: (conn: string, sql: string) =>
    req<{ plan: unknown }>(
      `/api/connections/${encodeURIComponent(conn)}/explain?sql=${encodeURIComponent(sql)}`,
    ),
}
