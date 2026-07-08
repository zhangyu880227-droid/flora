# Flora — Architecture

Flora is an AI-native Research Operating System. This document describes the tech stack, monorepo layout, and how the frontend and backend connect.

---

## Monorepo layout

Managed by **Turborepo** with **pnpm workspaces** (pnpm ≥9, Node ≥20).

```
Flora/
├── apps/
│   ├── web/          # Next.js 15 frontend (port 3000)
│   └── api/          # FastAPI backend (port 8000)
├── packages/
│   ├── types/        # Shared TypeScript types (@flora/types)
│   ├── ui/           # Shared component library (@flora/ui)
│   └── config/
│       ├── eslint/   # Shared ESLint config
│       ├── tailwind/ # Shared Tailwind config
│       └── typescript/ # Shared tsconfig
├── docker/           # Nginx + Postgres init SQL
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

Root scripts (`pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm type-check`) fan out via Turborepo.

---

## Web stack (`apps/web`)

| Concern | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack in dev) |
| Language | TypeScript 5.6 |
| Styling | Tailwind CSS 3 + `@flora/tailwind-config` |
| UI components | `@flora/ui` (shadcn/ui built on Radix UI primitives) |
| Icons | lucide-react |
| Server state | TanStack Query v5 |
| Client state | Zustand v5 (persisted to localStorage) |
| URL state | nuqs |
| Fonts | Geist |
| Theming | next-themes |

### Directory structure (`apps/web/src/`)

```
app/
  (auth)/       # Login, register — no auth required
  (app)/        # Protected shell (sidebar layout)
    projects/
    search/
    threads/
    insights/
    settings/
    workspace/
  layout.tsx
  providers.tsx # TanStack Query provider + devtools
components/
  app-sidebar.tsx
lib/
  api/
    client.ts   # Typed fetch wrapper (see below)
    index.ts    # All API calls organized by domain
middleware.ts   # Redirects unauthenticated users to /login
stores/
  auth.ts       # Current user (persisted)
  workspace.ts  # Active workspace ID (persisted)
```

---

## API stack (`apps/api`)

| Concern | Technology |
|---|---|
| Framework | FastAPI 0.115+ |
| Language | Python 3.12 |
| ASGI server | Uvicorn |
| ORM | SQLAlchemy 2 (async) |
| Database | PostgreSQL 16 + pgvector extension |
| Migrations | Alembic |
| Async driver | asyncpg |
| Task queue | Celery 5 with Redis broker |
| Cache | Redis 7 |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| Embeddings | Voyage AI `voyage-3` (1024-dim) via `voyageai` |
| LLM (default) | OpenAI Responses API |
| LLM (alt) | Anthropic Messages API (`LLM_PROVIDER=anthropic`) |
| Document parsing | PyMuPDF (PDF), trafilatura (URLs), yt-dlp (YouTube) |
| Text splitting | langchain-text-splitters |
| Config | pydantic-settings |
| Logging | structlog |
| Linting | ruff |

### Directory structure (`apps/api/app/`)

```
main.py             # FastAPI app factory; CORS middleware; mounts api_router
core/
  config.py         # Pydantic Settings — all env vars
  security.py       # JWT creation/decoding, bcrypt hashing
  deps.py           # FastAPI DI: CurrentUser, DB, require_workspace_member
db/
  session.py        # Async SQLAlchemy engine + session factory
models/             # SQLAlchemy ORM models (one file per entity)
schemas/            # Pydantic v2 request/response schemas
services/
  ingestion.py      # PDF/URL/YouTube extraction + chunking
  embedding.py      # Voyage AI batch embedding
  search.py         # Hybrid search: pgvector cosine + tsvector BM25, fused via RRF
  ai.py             # Provider-agnostic RAG streaming + insight generation
  providers/
    base.py         # LLMProvider ABC (stream, complete)
    openai_provider.py
    anthropic_provider.py
  storage.py        # LocalStorageBackend (files at UPLOAD_DIR/{ws_id}/{src_id}/)
api/v1/
  router.py         # Aggregates all sub-routers under /api/v1
  auth.py           # /auth/register, /auth/login, /auth/refresh, /auth/logout
  workspaces.py
  projects.py
  sources.py
  collections.py
  search.py
  threads.py
  insights.py
tasks/
  celery_app.py     # Celery app configured against Redis
  ingest_source     # Task: extract → chunk → embed → store → update status
migrations/         # Alembic revision files (async engine)
```

### Database schema (key tables)

```
users
workspaces
workspace_members       (role: owner | editor | viewer)
projects                (workspace-scoped)
sources                 (project-scoped; status pipeline: pending→processing→ready|failed)
source_chunks           (vector(1024) via pgvector; FK → sources)
collections
collection_sources
threads
messages                (sources_cited JSONB)
insights
tags
source_tags
```

---

## How frontend calls backend

### Request path

1. The web app imports `api` from `lib/api/client.ts`, a thin typed wrapper around `fetch`.
2. Every request goes to `${NEXT_PUBLIC_API_URL}/api/v1/<path>` with `credentials: "include"` so cookies are sent automatically.
3. FastAPI reads the `access_token` httpOnly cookie in `get_current_user` (no Authorization header needed).
4. Non-OK responses throw `ApiError(status, detail)` which TanStack Query surfaces to the UI.

### Auth flow

- **Login**: `POST /api/v1/auth/login` → FastAPI sets `access_token` + `refresh_token` httpOnly cookies.
- **Protected pages**: `middleware.ts` checks for the `access_token` cookie; redirects to `/login` if absent.
- **Token refresh**: `POST /api/v1/auth/refresh` uses the refresh cookie; no client-side token storage.

### Streaming (SSE)

Chat messages (`POST /api/v1/threads/{id}/messages`) return `text/event-stream`. The client reads the response body as a ReadableStream; each `data: {...}\n\n` chunk is a partial LLM token or a metadata event.

### File uploads

Sources are uploaded via `api.postForm` (multipart/form-data, no `Content-Type` header override) to `POST /api/v1/projects/{id}/sources`. The API stores the file locally and dispatches the `ingest_source` Celery task asynchronously.

---

## Infrastructure (Docker Compose)

| Service | Image / Build | Port |
|---|---|---|
| `db` | pgvector/pgvector:pg16 | 5432 |
| `redis` | redis:7-alpine | 6379 |
| `api` | `apps/api/Dockerfile` | 8000 |
| `worker` | same image, Celery command | — |
| `web` | `apps/web/Dockerfile` | 3000 |
| `nginx` | nginx:alpine | 80 |

Nginx reverse-proxies `/api` → `api:8000` and `/` → `web:3000`. In production the frontend sets `NEXT_PUBLIC_API_URL=http://localhost/api` so all traffic flows through Nginx on port 80.

---

## Data flow summary

```
User → Web (Next.js) → fetch /api/v1/* → Nginx → FastAPI
                                                    ↓
                                          Celery task (ingest)
                                                    ↓
                                    Voyage AI embed → pgvector store
                                                    ↓
                                    Search: pgvector + tsvector → RRF
                                                    ↓
                                    LLM (OpenAI/Anthropic) SSE stream
                                                    ↓
                                         Web streams tokens to UI
```

---

## Shared packages

| Package | Purpose |
|---|---|
| `@flora/types` | TypeScript interfaces mirroring Pydantic schemas; consumed by `@flora/web` |
| `@flora/ui` | shadcn/ui component library (Radix UI + Tailwind); consumed by `@flora/web` |
| `@flora/eslint-config` | Shared ESLint flat config |
| `@flora/tailwind-config` | Shared Tailwind preset |
| `@flora/typescript-config` | Shared `tsconfig.json` base |
