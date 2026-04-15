import datetime
import decimal
import re
import time
import uuid as uuid_mod
from typing import Any, List, Optional
from urllib.parse import urlparse

import asyncpg
from fastapi import APIRouter, Body, HTTPException, Query

from .db import manager
from .models import (
    BookmarkIn,
    BookmarkOut,
    ColumnInfo,
    FKInfo,
    IndexInfo,
    QueryRequest,
    QueryResponse,
    RowsResponse,
    TableInfo,
    TableSummary,
)
from .settings import settings

router = APIRouter()

_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_WRITE_RE = re.compile(
    r"^\s*(insert|update|delete|drop|truncate|alter|create|grant|revoke|comment|call|do|vacuum|reindex|merge)\b",
    re.IGNORECASE,
)
_READ_PREFIX = re.compile(r"^\s*(select|with|show|explain|values|table|fetch)\b", re.IGNORECASE)


def _qident(s: str) -> str:
    if _IDENT.match(s):
        return '"' + s + '"'
    return '"' + s.replace('"', '""') + '"'


def _serialize(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, decimal.Decimal):
        f = float(v)
        return f if f.is_finite() else str(v)
    if isinstance(v, (datetime.datetime, datetime.date, datetime.time)):
        return v.isoformat()
    if isinstance(v, datetime.timedelta):
        return str(v)
    if isinstance(v, uuid_mod.UUID):
        return str(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return "\\x" + bytes(v).hex()
    if isinstance(v, (list, tuple)):
        return [_serialize(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _serialize(x) for k, x in v.items()}
    if isinstance(v, asyncpg.Range):
        return str(v)
    return str(v)


def _bookmark_out(b) -> BookmarkOut:
    try:
        u = urlparse(b.url)
        return BookmarkOut(
            id=b.id,
            name=b.name,
            host=u.hostname,
            database=(u.path or "/").lstrip("/") or None,
        )
    except Exception:
        return BookmarkOut(id=b.id, name=b.name)


def _check_writes() -> None:
    if settings.read_only:
        raise HTTPException(403, "Read-only mode")


async def _pool(conn_id: str):
    try:
        return await manager.pool(conn_id)
    except KeyError:
        raise HTTPException(404, "Connection not found")


@router.get("/connections", response_model=List[BookmarkOut])
async def list_connections():
    return [_bookmark_out(b) for b in manager.list()]


@router.post("/connections", response_model=BookmarkOut)
async def add_connection(payload: BookmarkIn):
    try:
        c = await asyncpg.connect(payload.url, timeout=5)
        await c.close()
    except Exception as e:
        raise HTTPException(400, f"Cannot connect: {e}")
    b = manager.add(payload.name, payload.url)
    return _bookmark_out(b)


@router.delete("/connections/{conn_id}")
async def delete_connection(conn_id: str):
    await manager.remove(conn_id)
    return {"ok": True}


@router.get("/connections/{conn_id}/schemas")
async def list_schemas(conn_id: str):
    pool = await _pool(conn_id)
    async with pool.acquire() as c:
        rows = await c.fetch(
            """
            SELECT schema_name FROM information_schema.schemata
            WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
              AND schema_name NOT LIKE 'pg_temp%'
              AND schema_name NOT LIKE 'pg_toast_temp%'
            ORDER BY schema_name
            """
        )
    return [r["schema_name"] for r in rows]


@router.get("/connections/{conn_id}/tables", response_model=List[TableSummary])
async def list_tables(conn_id: str, schema: Optional[str] = None):
    pool = await _pool(conn_id)
    async with pool.acquire() as c:
        if schema:
            rows = await c.fetch(
                """
                SELECT table_schema, table_name, table_type
                FROM information_schema.tables
                WHERE table_schema = $1
                ORDER BY table_name
                """,
                schema,
            )
        else:
            rows = await c.fetch(
                """
                SELECT table_schema, table_name, table_type
                FROM information_schema.tables
                WHERE table_schema NOT IN ('pg_catalog','information_schema')
                ORDER BY table_schema, table_name
                """
            )
    return [
        TableSummary(
            schema=r["table_schema"],
            name=r["table_name"],
            kind="view" if r["table_type"] in ("VIEW", "MATERIALIZED VIEW") else "table",
        )
        for r in rows
    ]


@router.get("/connections/{conn_id}/tables/{schema}/{table}", response_model=TableInfo)
async def table_info(conn_id: str, schema: str, table: str):
    pool = await _pool(conn_id)
    async with pool.acquire() as c:
        cols = await c.fetch(
            """
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            ORDER BY ordinal_position
            """,
            schema,
            table,
        )
        if not cols:
            raise HTTPException(404, "Table not found")

        pk = await c.fetch(
            """
            SELECT a.attname AS column_name
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            JOIN pg_class c ON c.oid = i.indrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relname = $2 AND i.indisprimary
            """,
            schema,
            table,
        )
        pk_cols = [r["column_name"] for r in pk]

        idx = await c.fetch(
            """
            SELECT i.relname AS name,
                   array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS columns,
                   ix.indisunique AS is_unique,
                   ix.indisprimary AS is_primary
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = $1 AND t.relname = $2
            GROUP BY i.relname, ix.indisunique, ix.indisprimary
            ORDER BY i.relname
            """,
            schema,
            table,
        )

        fks = await c.fetch(
            """
            SELECT con.conname AS name,
                   array_agg(att1.attname ORDER BY u.ord) AS columns,
                   nsp2.nspname AS ref_schema,
                   cl2.relname AS ref_table,
                   array_agg(att2.attname ORDER BY u.ord) AS ref_columns
            FROM pg_constraint con
            JOIN pg_class cl1 ON cl1.oid = con.conrelid
            JOIN pg_namespace nsp1 ON nsp1.oid = cl1.relnamespace
            JOIN pg_class cl2 ON cl2.oid = con.confrelid
            JOIN pg_namespace nsp2 ON nsp2.oid = cl2.relnamespace
            JOIN unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
            JOIN pg_attribute att1 ON att1.attrelid = con.conrelid AND att1.attnum = u.attnum
            JOIN pg_attribute att2 ON att2.attrelid = con.confrelid AND att2.attnum = con.confkey[u.ord]
            WHERE con.contype = 'f' AND nsp1.nspname = $1 AND cl1.relname = $2
            GROUP BY con.conname, nsp2.nspname, cl2.relname
            ORDER BY con.conname
            """,
            schema,
            table,
        )

        est = await c.fetchval(
            """
            SELECT reltuples::bigint
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relname = $2
            """,
            schema,
            table,
        )

    return TableInfo(
        schema=schema,
        name=table,
        estimated_rows=est if est and est >= 0 else None,
        primary_key=pk_cols,
        columns=[
            ColumnInfo(
                name=r["column_name"],
                data_type=r["data_type"],
                nullable=r["is_nullable"] == "YES",
                default=r["column_default"],
                is_pk=r["column_name"] in pk_cols,
            )
            for r in cols
        ],
        indexes=[
            IndexInfo(
                name=r["name"],
                columns=list(r["columns"]),
                unique=r["is_unique"],
                primary=r["is_primary"],
            )
            for r in idx
        ],
        foreign_keys=[
            FKInfo(
                name=r["name"],
                columns=list(r["columns"]),
                ref_schema=r["ref_schema"],
                ref_table=r["ref_table"],
                ref_columns=list(r["ref_columns"]),
            )
            for r in fks
        ],
    )


@router.get(
    "/connections/{conn_id}/tables/{schema}/{table}/rows",
    response_model=RowsResponse,
)
async def get_rows(
    conn_id: str,
    schema: str,
    table: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    sort: Optional[str] = None,
    order: str = "asc",
    include_total: bool = Query(False),
):
    pool = await _pool(conn_id)
    schema_q = _qident(schema)
    table_q = _qident(table)

    order_clause = ""
    if sort:
        order_clause = f" ORDER BY {_qident(sort)} {'DESC' if order.lower() == 'desc' else 'ASC'}"

    sql = f"SELECT * FROM {schema_q}.{table_q}{order_clause} LIMIT $1 OFFSET $2"

    async with pool.acquire() as c:
        try:
            rows = await c.fetch(sql, limit, offset)
        except Exception as e:
            raise HTTPException(400, str(e))
        total = None
        if include_total:
            try:
                total = await c.fetchval(f"SELECT count(*) FROM {schema_q}.{table_q}")
            except Exception:
                total = None

    if not rows:
        # still want to expose columns when the table is empty
        async with pool.acquire() as c:
            try:
                empty = await c.fetch(f"SELECT * FROM {schema_q}.{table_q} LIMIT 0")
                cols = list(empty[0].keys()) if empty else [
                    r["column_name"]
                    for r in await c.fetch(
                        """SELECT column_name FROM information_schema.columns
                           WHERE table_schema=$1 AND table_name=$2
                           ORDER BY ordinal_position""",
                        schema,
                        table,
                    )
                ]
            except Exception:
                cols = []
        return RowsResponse(columns=cols, rows=[], total=total)

    cols = list(rows[0].keys())
    out_rows = [[_serialize(r[c]) for c in cols] for r in rows]
    return RowsResponse(columns=cols, rows=out_rows, total=total)


@router.patch("/connections/{conn_id}/tables/{schema}/{table}/rows")
async def update_row(
    conn_id: str,
    schema: str,
    table: str,
    payload: dict = Body(...),
):
    _check_writes()
    pk = payload.get("pk") or {}
    sets = payload.get("set") or {}
    if not pk or not sets:
        raise HTTPException(400, "pk and set required")

    pool = await _pool(conn_id)
    schema_q = _qident(schema)
    table_q = _qident(table)

    set_parts: List[str] = []
    args: List[Any] = []
    for k, v in sets.items():
        args.append(v)
        set_parts.append(f"{_qident(k)} = ${len(args)}")
    where_parts: List[str] = []
    for k, v in pk.items():
        args.append(v)
        where_parts.append(f"{_qident(k)} = ${len(args)}")

    sql = (
        f"UPDATE {schema_q}.{table_q} SET {', '.join(set_parts)} "
        f"WHERE {' AND '.join(where_parts)} RETURNING *"
    )

    async with pool.acquire() as c:
        try:
            row = await c.fetchrow(sql, *args)
        except Exception as e:
            raise HTTPException(400, str(e))
    if not row:
        raise HTTPException(404, "Row not found")
    return {"ok": True, "row": {k: _serialize(row[k]) for k in row.keys()}}


@router.delete("/connections/{conn_id}/tables/{schema}/{table}/rows")
async def delete_row(
    conn_id: str,
    schema: str,
    table: str,
    payload: dict = Body(...),
):
    _check_writes()
    pk = payload.get("pk") or {}
    if not pk:
        raise HTTPException(400, "pk required")
    pool = await _pool(conn_id)
    schema_q = _qident(schema)
    table_q = _qident(table)
    args: List[Any] = []
    where_parts: List[str] = []
    for k, v in pk.items():
        args.append(v)
        where_parts.append(f"{_qident(k)} = ${len(args)}")
    sql = f"DELETE FROM {schema_q}.{table_q} WHERE {' AND '.join(where_parts)}"
    async with pool.acquire() as c:
        try:
            result = await c.execute(sql, *args)
        except Exception as e:
            raise HTTPException(400, str(e))
    return {"ok": True, "result": result}


@router.post("/connections/{conn_id}/query", response_model=QueryResponse)
async def run_query(conn_id: str, payload: QueryRequest):
    sql = payload.sql.strip().rstrip(";")
    if not sql:
        raise HTTPException(400, "Empty SQL")
    if settings.read_only and _WRITE_RE.match(sql):
        raise HTTPException(403, "Read-only mode")

    is_read = bool(_READ_PREFIX.match(sql))

    pool = await _pool(conn_id)
    start = time.perf_counter()
    async with pool.acquire() as c:
        try:
            if is_read:
                rows = await c.fetch(sql)
                cols = list(rows[0].keys()) if rows else []
                out_rows = [[_serialize(r[col]) for col in cols] for r in rows]
                duration = (time.perf_counter() - start) * 1000
                return QueryResponse(
                    columns=cols,
                    rows=out_rows,
                    row_count=len(out_rows),
                    duration_ms=round(duration, 2),
                )
            else:
                result = await c.execute(sql)
                duration = (time.perf_counter() - start) * 1000
                return QueryResponse(
                    columns=[],
                    rows=[],
                    row_count=0,
                    duration_ms=round(duration, 2),
                    notice=result,
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(400, str(e))


@router.get("/connections/{conn_id}/explain")
async def explain(conn_id: str, sql: str):
    if settings.read_only and _WRITE_RE.match(sql):
        raise HTTPException(403, "Read-only mode")
    pool = await _pool(conn_id)
    async with pool.acquire() as c:
        try:
            row = await c.fetchrow(f"EXPLAIN (ANALYZE, FORMAT JSON) {sql}")
        except Exception as e:
            raise HTTPException(400, str(e))
    plan = row[0]
    if isinstance(plan, str):
        import json

        plan = json.loads(plan)
    return {"plan": plan}
