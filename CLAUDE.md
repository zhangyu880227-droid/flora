# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Flora — AI-native Research Operating System

Turborepo monorepo with a Next.js 15 frontend (`apps/web`) and FastAPI backend (`apps/api`).

---

## Commands

### Root (run from `/Users/max/Flora`)
```bash
pnpm dev            # start all services via Turborepo (requires Docker for DB/Redis)
pnpm build          # build all apps
pnpm lint           # lint all apps
pnpm type-check     # tsc across all apps
```

### Infrastructure
```bash
docker compose up -d db redis        # start only DB + Redis (for local API dev)
docker compose up -d                 # start full stack
docker compose down
```

### Backend (`apps/api`)
```bash
# From apps/api:
pip install -e ".[dev]"              # install Python deps
uvicorn app.main:app --reload        # run API dev server
celery -A app.tasks.celery_app worker --loglevel=debug   # run Celery worker

# Migrations (requires DATABASE_URL in env):
alembic revision --autogenerate -m "description"
alembic upgrade head
alembic downgrade -1
```

### Frontend (`apps/web`)
```bash
# From apps/web (or via pnpm --filter @flora/web):
pnpm dev            # Next.js dev server with Turbopack on :3000
pnpm build
pnpm type-check
```

---

## Architecture

### Monorepo layout
- `apps/web` — Next.js 15 (App Router), port 3000
- `apps/api` — FastAPI (Python 3.12), port 8000
- `packages/types` — Shared TypeScript types mirroring Pydantic schemas
- `packages/ui` — Shared shadcn/ui component library
- `packages/config` — Shared eslint, tsconfig, tailwind configs

### Backend (`apps/api/app/`)
- `core/config.py` — Pydantic Settings; all env vars read here
- `core/security.py` — JWT creation/decoding, bcrypt password hashing
- `core/deps.py` — FastAPI DI: `CurrentUser`, `DB`, `require_workspace_member`
- `db/session.py` — async SQLAlchemy engine + session factory
- `models/` — SQLAlchemy ORM models (one file per entity)
- `schemas/` — Pydantic v2 request/response schemas
- `services/` — Stateless business logic:
  - `ingestion.py` — PDF/URL/YouTube text extraction + chunking
  - `embedding.py` — Voyage AI `voyage-3` (1024-dim) batch embedding
  - `search.py` — Hybrid search: pgvector cosine + PostgreSQL tsvector, fused via RRF
  - `ai.py` — provider-agnostic RAG streaming + insight generation; selects backend via `LLM_PROVIDER`
  - `providers/base.py` — `LLMProvider` ABC (`stream`, `complete`)
  - `providers/openai_provider.py` — OpenAI Responses API (default)
  - `providers/anthropic_provider.py` — Anthropic Messages API (set `LLM_PROVIDER=anthropic` + install `anthropic` package)
  - `storage.py` — `LocalStorageBackend` (abstract interface for future S3 swap)
- `tasks/` — Celery app + `ingest_source` task
- `api/v1/` — FastAPI route handlers (auth, workspaces, projects, sources, collections, search, threads, insights)
- `migrations/` — Alembic migrations (async engine)

### Frontend (`apps/web/src/`)
- `app/(auth)/` — Login and register pages (no auth required)
- `app/(app)/` — Protected shell with sidebar; all research pages
- `middleware.ts` — Redirects unauthenticated users to `/login`; reads `access_token` cookie
- `lib/api/client.ts` — Typed fetch wrapper (credentials: include, throws `ApiError`)
- `lib/api/index.ts` — All API calls organized by domain (authApi, projectsApi, etc.)
- `stores/auth.ts` — Zustand: current user (persisted to localStorage)
- `stores/workspace.ts` — Zustand: active workspace ID (persisted)
- `components/app-sidebar.tsx` — Main nav sidebar
- `providers.tsx` — TanStack Query + devtools

### Data flow
1. **Ingestion**: `POST /api/v1/projects/{id}/sources` → creates Source record → dispatches `ingest_source` Celery task → extraction → chunking → Voyage AI embed → store in pgvector → status=ready
2. **Search**: `POST /api/v1/search` → embed query → pgvector cosine (top 20) + tsvector BM25 (top 20) → RRF fusion → top 8 chunks
3. **Chat**: `POST /api/v1/threads/{id}/messages` → search → assemble context → LLM SSE stream (OpenAI Responses API by default) → persist message with `sources_cited`

### Auth
- JWT in httpOnly cookies (`access_token`, `refresh_token`)
- All API requests use `credentials: "include"` — no manual token management
- FastAPI reads cookies via `Cookie()` dependency in `get_current_user`

### Database schema (key tables)
```
users, workspaces, workspace_members (role: owner|editor|viewer)
projects (workspace-scoped), sources (project-scoped, has status pipeline)
source_chunks (vector(1024) embedding column via pgvector)
collections, collection_sources
threads, messages (sources_cited JSONB)
insights, tags, source_tags
```

---

## Key conventions

- **All DB queries are async** — use `await db.execute(select(...))` pattern
- **Workspace isolation** — every query joins through `workspace_members` to enforce access
- **Source `metadata_` column** is named `metadata` in the DB (SQLAlchemy alias); access as `source.metadata_` in Python
- **SSE endpoints** return `StreamingResponse` with `media_type="text/event-stream"` and `data: {...}\n\n` lines
- **Celery tasks** call `asyncio.run()` — they are sync entry points wrapping async service calls
- **Shared types** in `packages/types` must stay in sync with Pydantic schemas; update both when changing an entity
- **File uploads** stored at `UPLOAD_DIR/{workspace_id}/{source_id}/{filename}` via `LocalStorageBackend`
