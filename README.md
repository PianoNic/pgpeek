# pgpeek

A single-container Postgres debugging UI. Python (FastAPI + asyncpg) backend, React + shadcn/ui frontend. Inspired by [pgweb](https://github.com/sosedoff/pgweb) but rebuilt from scratch.

## Features
- Auto-connect from `DATABASE_URL` — no login screen
- Schema tree (tables, views) with filter + Cmd-K palette
- Virtualized data grid with sort, infinite scroll, inline editing, row delete
- SQL editor (CodeMirror, PG dialect, schema-aware autocomplete), query history, saved queries
- Table structure view: columns, indexes, foreign keys, row estimate
- Optional HTTP basic auth and read-only mode via env
- Single Docker image — same port serves the API and the SPA

## Quick start

Pull the prebuilt image from Docker Hub:

```bash
cp .env.example .env
docker compose up
```

Then open http://localhost:8081. The bundled `postgres` service is reachable inside the compose network at `postgres:5432` and externally at `localhost:5432`.

To point at an existing database instead of the bundled one, set `DATABASE_URL` in `.env` and run just the `pgpeek` service:

```bash
docker compose up pgpeek
```

Or run pgpeek standalone without compose:

```bash
docker run -p 8081:8000 \
  -e DATABASE_URL=postgres://user:pass@host:5432/db \
  pianonic/pgpeek:latest
```

To build locally from source instead of pulling, edit `docker-compose.yml` (swap `image:` for `build: .`) and run `docker compose up --build`.

## Env vars
| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | (none) | Auto-connect on startup |
| `PGPEEK_AUTH_USER` / `PGPEEK_AUTH_PASS` | (none) | Enable HTTP basic auth |
| `PGPEEK_READ_ONLY` | `false` | Reject all writes |
| `PGPEEK_QUERY_TIMEOUT_MS` | `30000` | Per-statement timeout |

## Local dev (without Docker)

```bash
# backend
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
  uvicorn app.main:app --reload

# frontend (separate terminal)
cd frontend
npm install
npm run dev
```

The dev server proxies `/api` to `http://localhost:8000`.

## Project layout
```
pgpeek/
├── backend/
│   ├── app/
│   │   ├── main.py        FastAPI app + SPA mount
│   │   ├── settings.py    env config
│   │   ├── db.py          asyncpg pool manager
│   │   ├── models.py      pydantic schemas
│   │   └── api.py         all routes
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/    Layout, SchemaTree, DataGrid, CommandPalette, ui/*
│       ├── pages/         HomePage, TablePage, QueryPage
│       ├── lib/           api.ts, utils.ts
│       └── stores/        zustand
├── Dockerfile             multi-stage (frontend → venv → runtime)
└── docker-compose.yml
```

## Safety notes
If `DATABASE_URL` ever points at a production database, **always** set `PGPEEK_READ_ONLY=true` and `PGPEEK_AUTH_USER`/`PGPEEK_AUTH_PASS`. Do not bind the port publicly — either keep it on localhost (`127.0.0.1:8081:8000`) or put it behind a VPN.
