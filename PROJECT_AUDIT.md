# PROJECT AUDIT — Flora / Atlas
*Generated: 2026-07-10 | Branch: atlas/phase1-execution*

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router, Turbopack), React 19, TypeScript |
| UI library | shadcn/ui via `@flora/ui` (Radix UI + Tailwind CSS) |
| State management | TanStack Query v5 (server state), Zustand (client state) |
| Backend | FastAPI (Python 3.12), async SQLAlchemy, Alembic |
| Task queue | Celery + Redis (Beat scheduler: 30-min self-improvement loop) |
| Database | PostgreSQL 16 + pgvector (1024-dim cosine search) |
| Embeddings | Voyage AI `voyage-3` (1024-dim) |
| LLM | Ollama `qwen3:8b` (default, `LLM_PROVIDER=ollama`) — OpenAI and Anthropic providers also implemented |
| Auth | JWT in httpOnly cookies (`access_token`, `refresh_token`) |
| Monorepo | Turborepo + pnpm workspaces |
| Infra | Docker Compose (postgres, redis, api, worker, web) |

---

## 2. Directory Tree

```
Flora/
├── apps/
│   ├── api/                         FastAPI backend
│   │   └── app/
│   │       ├── api/v1/              Route handlers (10 files)
│   │       ├── core/                config, security, deps
│   │       ├── db/                  async session factory
│   │       ├── engine/              Self-improvement loop (5 files)
│   │       ├── migrations/          Alembic (16 versions)
│   │       ├── models/              ORM models (10 files)
│   │       ├── schemas/             Pydantic v2 schemas (9 files)
│   │       ├── services/            Business logic
│   │       │   ├── knowledge/       Pipeline + collectors (10 files)
│   │       │   └── providers/       LLM abstraction (3 files)
│   │       └── tasks/               Celery tasks (3 files)
│   └── web/                         Next.js frontend
│       └── src/
│           ├── app/
│           │   ├── (app)/           Protected shell (14 pages)
│           │   ├── (atlas)/         Atlas-only shell (1 page)
│           │   └── (auth)/          Public auth pages (3 pages)
│           ├── components/
│           │   ├── atlas/           Atlas-specific (5 components)
│           │   └── *.tsx            Shared components (7 files)
│           ├── lib/api/             Typed API client + all domain calls
│           └── stores/              Zustand: auth, workspace, tasks
├── packages/
│   ├── types/src/                   Shared TS types (11 files)
│   ├── ui/                          shadcn/ui wrapper
│   └── config/                      eslint, tsconfig, tailwind configs
├── scripts/                         nightly_atlas.sh, atlas_ctl.sh
└── Docker Compose configs
```

---

## 3. All Pages

### Auth (no login required)
| Route | File | Purpose |
|---|---|---|
| `/login` | `(auth)/login/page.tsx` | Email + password login |
| `/register` | `(auth)/register/page.tsx` | New account creation |
| `/forgot-password` | `(auth)/forgot-password/page.tsx` | Password reset flow |

### App (JWT-protected shell with sidebar)
| Route | File | LOC | Status |
|---|---|---|---|
| `/workspace` | workspace/page.tsx | 444 | Home dashboard |
| `/projects` | projects/page.tsx | ~200 | Project list |
| `/projects/new` | projects/new/page.tsx | ~100 | Create project |
| `/projects/[id]` | projects/[id]/page.tsx | 413 | Project detail + sources |
| `/projects/[id]/sources/add` | .../sources/add/page.tsx | ~120 | Add source |
| `/projects/[id]/threads/new` | .../threads/new/page.tsx | ~80 | New thread |
| `/threads` | threads/page.tsx | ~150 | Thread list |
| `/threads/[id]` | threads/[id]/page.tsx | ~280 | Thread chat |
| `/insights` | insights/page.tsx | ~220 | Insight list |
| `/insight-center` | insight-center/page.tsx | 552 | AI insight generation |
| `/knowledge` | knowledge/page.tsx | 361 | Knowledge feed browser |
| `/search` | search/page.tsx | ~120 | Hybrid search |
| `/agents` | agents/page.tsx | ~200 | Agent templates |
| `/tasks` | tasks/page.tsx | ~250 | Task manager (localStorage) |
| `/settings` | settings/page.tsx | ~280 | Profile + workspace |
| `/workspaces` | workspaces/page.tsx | ~80 | Workspace switcher |

### Atlas (separate layout)
| Route | File | LOC | Status |
|---|---|---|---|
| `/atlas` | (atlas)/atlas/page.tsx | 311 | KG + research panel |

---

## 4. All Components

### Atlas-specific (`src/components/atlas/`)
| Component | LOC | Purpose |
|---|---|---|
| `research-panel.tsx` | 747 | Docs list + KG nodes + gap tasks |
| `knowledge-graph.tsx` | 320 | D3-force KG visualization |
| `feed-card.tsx` | ~80 | Individual feed status card |
| `metric-bar.tsx` | ~40 | Progress bar with label |
| `atlas-nav.tsx` | ~60 | Atlas-specific top nav |

### Shared components (`src/components/`)
| Component | Purpose |
|---|---|
| `app-sidebar.tsx` | Main nav sidebar with all routes |
| `error-boundary.tsx` | React error boundary wrapper |
| `flora-logo.tsx` | Brand logo |
| `theme-toggle.tsx` | Dark/light mode toggle |
| `topbar.tsx` | Page-level top bar |
| `workspace-switcher.tsx` | Workspace selector dropdown |

---

## 5. All APIs

### Auth (`/api/v1/auth`)
- `POST /register` — Create account
- `POST /login` — Login (sets cookies)
- `POST /logout` — Clear cookies
- `GET /me` — Current user

### Workspaces (`/api/v1/workspaces`)
- `POST /` — Create workspace
- `GET /` — List user's workspaces
- `GET /{id}` — Get workspace
- `PATCH /{id}` — Update workspace
- `GET /{id}/members` — List members
- `POST /{id}/members` — Invite member

### Projects (`/api/v1/projects`)
- `POST /` — Create project
- `GET /` — List (workspace-scoped)
- `GET /{id}` — Get project
- `PATCH /{id}` — Update project
- `DELETE /{id}` — Delete project

### Sources (`/api/v1/sources`)
- `POST /{project_id}/sources` — Add source (triggers ingestion)
- `GET /{project_id}/sources` — List sources
- `GET /{id}` — Get source
- `DELETE /{id}` — Delete source
- `GET /{id}/chunks` — Get chunks

### Collections (`/api/v1/collections`)
- CRUD + add/remove sources, 7 endpoints

### Search (`/api/v1/search`)
- `POST /` — Hybrid pgvector + tsvector search

### Threads (`/api/v1/threads`)
- `POST /` — Create thread
- `GET /` — List (project-scoped)
- `GET /{id}` — Get thread + messages
- `POST /{id}/messages` — Send message (SSE stream)
- `DELETE /{id}` — Delete thread

### Insights (`/api/v1/insights`)
- `GET /` — List insights
- `POST /generate` — Generate insight (SSE stream)
- `DELETE /{id}` — Delete insight

### Engine (`/api/v1/engine`)
- `GET /status` — Self-improvement engine status
- `GET /atlas` — ATLAS.md content
- `GET /tasks` — Engine task list
- `GET /history` — Run history
- `POST /run` — Trigger manual run
- `GET /findings` — Recent findings

### Knowledge (`/api/v1/knowledge`) — 914 lines, 18+ endpoints
- Feed CRUD (list, create, get, update, delete)
- `POST /feeds/{id}/run` — Manual feed run
- `GET /feeds/{id}/runs` — Ingestion run history
- Document endpoints (list, get, delete, reprocess)
- `GET /stats` — Knowledge stats
- `POST /run-all` — Run all workspace feeds
- KG endpoints: stats, nodes, edges, search, recent
- `GET /graph` — Full KG for D3 rendering
- `POST /research-gaps` — Identify research gaps

---

## 6. All Databases

### PostgreSQL tables
| Table | Key columns | Notes |
|---|---|---|
| `users` | id, email, hashed_password, name | |
| `workspaces` | id, name, slug, owner_id | |
| `workspace_members` | workspace_id, user_id, role | role: owner/editor/viewer |
| `projects` | id, workspace_id, name, description | |
| `sources` | id, project_id, type, status, metadata_ | status pipeline |
| `source_chunks` | id, source_id, content, embedding vector(1024) | pgvector |
| `collections` | id, workspace_id, name | |
| `collection_sources` | collection_id, source_id | M2M |
| `threads` | id, project_id, name | |
| `messages` | id, thread_id, role, content, sources_cited JSONB | |
| `insights` | id, workspace_id, project_id, content, type | |
| `tags` / `source_tags` | tag taxonomy | |
| `knowledge_feeds` | id, workspace_id, type, config JSONB, schedule_minutes | 15 defaults |
| `knowledge_documents` | id, workspace_id, content_hash, embedding, entities JSONB | uq on (workspace_id, content_hash) |
| `knowledge_ingestion_runs` | id, feed_id, status, documents_new | |
| `kg_nodes` | id, workspace_id, name, type, properties JSONB | |
| `kg_edges` | id, workspace_id, source_node_id, target_node_id, relation | |

### Redis
- Celery broker + result backend
- No application-level caching yet

---

## 7. All AI Interfaces

| Interface | Provider | Usage |
|---|---|---|
| Embeddings | Voyage AI `voyage-3` | Source chunk embedding + KD embedding |
| LLM (RAG chat) | Ollama `qwen3:8b` / OpenAI / Anthropic | Thread messages, insight generation |
| Knowledge extraction | Same LLM via `extractor.py` | Summary, entities, relationships, tags per doc |
| Self-improvement loop | Same LLM | Gap detection, ATLAS.md synthesis |
| pgvector cosine search | PostgreSQL | Semantic retrieval (top 20) |
| tsvector BM25 | PostgreSQL | Full-text retrieval (top 20) |
| RRF fusion | Python | Combine vector + keyword (top 8) |

---

## 8. Reusable Code

- **`@flora/ui`** — Complete shadcn/ui component set: Button, Card, Badge, Input, Label, Dialog, Skeleton, Tabs, Separator, Switch, Textarea, Toast, cn utility. Every page uses this.
- **`@flora/types`** — All domain types shared between frontend and backend. Update both TS and Pydantic when changing entities.
- **`lib/api/client.ts`** — Typed fetch wrapper with `ApiError`, cookie credentials, request/response typing. Use for every new endpoint.
- **`lib/api/index.ts`** — All domain API functions organized as `{domain}Api.*`. Add new endpoints here, not inline.
- **`services/ai.py`** — Provider-agnostic `stream_chat()` and `generate_insight()`. Handles SSE, context assembly, provider switching. Reuse for any new AI features.
- **`services/embedding.py`** — `embed_texts(texts: list[str])` — batch Voyage AI embed. Use for any new vector storage.
- **`services/search.py`** — `hybrid_search()` — full RRF pipeline, reusable for knowledge doc search too.
- **`core/deps.py`** — `CurrentUser`, `DB`, `require_workspace_member` — all route handlers should use these.
- **Zustand stores** — `useWorkspaceStore`, `useAuthStore` already wired. Add new stores to `stores/`.
- **`relativeTime()` helper** — Defined identically in 4+ page files. Should be extracted to `lib/utils.ts`.

---

## 9. Deprecated / Dead Code

| File / Pattern | Issue |
|---|---|
| `apps/web/src/app/(app)/workspaces/page.tsx` | Duplicate of workspace switcher; not linked from sidebar |
| Separate `(atlas)/` layout | Atlas lives at `/atlas` with its own nav, disconnected from main `(app)/` shell. Creates jarring UX context switch. |
| `MASTER.md`, `ROADMAP.md`, `NEXT_TASK.md`, `PROJECT_STATUS.md`, `ATLAS.md` | Engine-generated doc files in repo root. Not wrong, but auto-overwritten — do not hand-edit. |
| `apps/web/src/app/(app)/insight-center/page.tsx` (552L) | Overlaps heavily with `insights/page.tsx`. Two insight UIs for the same data. |
| `tasks/page.tsx` localStorage backend | `useTasksStore` persists only to `localStorage`. Data disappears on new browser/device. Needs API backend. |
| `agents/page.tsx` template links | All "Run Agent" links point to existing app pages (`/projects`, `/threads`, `/search`). No real agent execution. |
| `apps/api/reprocess.py` | One-off script in api root, not importable. |
| `.flora/` directory | Engine outputs: `tasks.json`, `atlas.json`. Fine as runtime artifacts, confusing as source files. |

---

## 10. Top 10 Problems

1. **Tasks are ephemeral** — `useTasksStore` writes only to `localStorage`. No API, no DB, no sharing across devices. Promised "Tasks" feature is a toy.

2. **No real agent execution** — The `/agents` page shows templates (Research Assistant, Document Analyst, etc.) that link to other pages. There is no agent runtime, no tool calling, no autonomous execution.

3. **Dual insight UIs** — `/insight-center` (552L) and `/insights` (220L) both display and generate insights with different layouts. Confusing UX; should be one page.

4. **Atlas is isolated** — `/atlas` uses a completely different layout (`(atlas)/`) with its own nav bar. Users switch between two navigation systems. Atlas should be inside the main `(app)/` shell.

5. **Knowledge pipeline crash was critical** — The `UniqueViolationError` → `PendingRollbackError` bug killed the entire 15-feed pipeline after the first duplicate. Fixed in this session with `no_autoflush` + `begin_nested()`, but the fix should be covered by an integration test.

6. **No global search UI** — `POST /api/v1/search` exists and works (hybrid vector + BM25), but `/search` page has minimal UI. No Cmd+K launcher, no instant results, no filter by type.

7. **LLM reliability** — Ollama `qwen3:8b` has a 45s timeout with semaphore(2). During batch runs (15 feeds × N items), timeouts cause silent extraction failures. No retry logic on LLM calls.

8. **knowledge.py is 914 lines** — One route file handling feeds, documents, KG, stats, research gaps. Violates single-responsibility. Hard to maintain.

9. **No real-time updates** — Knowledge ingestion runs for minutes, but the UI has no live progress indicator. User must manually refresh to see new documents.

10. **Missing test coverage** — No pytest suite. The pipeline's complex session management (autoflush fix, savepoints) has zero automated tests. Critical bugs will recur.

---

## 11. Top 10 Opportunities

1. **Persistent Tasks backend** — Move from `localStorage` to a proper `tasks` table + API. Tasks become collaborative, cross-device, AI-assignable.

2. **Global Cmd+K search** — Wire the existing hybrid search API to a keyboard-triggered modal. Show results by type (documents, threads, insights). High utility, low effort.

3. **Real agent loop** — Build a minimal agent executor: define a `run_agent(agent_type, context)` function that calls the LLM with a system prompt + tool descriptions + loop until done. Even one working agent (Research Assistant) would transform the product.

4. **Merge Atlas into main nav** — Move `/atlas` into `(app)/` shell. Knowledge graph becomes a tab in the Knowledge page or a sidebar panel. Eliminates UX context switch.

5. **Live ingestion progress (SSE)** — Add `GET /api/v1/knowledge/feeds/{id}/runs/live` SSE endpoint. Frontend polls or streams progress during pipeline runs. Users see docs appearing in real time.

6. **Knowledge favorites + bookmarks** — Add `is_favorited` flag to `knowledge_documents`. Frontend shows a Favorites section. Zero schema change needed (add column + endpoint).

7. **Dashboard with real AI summary** — `/workspace` currently shows static stats. Wire the engine's ATLAS.md → parse → render "Today's Intelligence Briefing" section on the home dashboard.

8. **Split knowledge.py** — Refactor into `knowledge_feeds.py`, `knowledge_docs.py`, `knowledge_graph.py`. Each ~200-300 lines. Improve maintainability.

9. **Agent memory** — Store agent runs in DB. Each agent has a `memories` JSONB column. Agents improve over time by reading their own history.

10. **Workflow builder** — A simple visual pipeline: Trigger → Steps → Output. Even a hard-coded "Daily Briefing" workflow (collect → summarize → email) demonstrates the OS vision.

---

## 12. Atlas Completion Percentage

| Module | Status | % Complete |
|---|---|---|
| Knowledge pipeline (feeds, dedup, embedding) | Working, 15 feeds running | **80%** |
| Knowledge UI (doc browser, feed cards) | Functional but sparse | **65%** |
| Knowledge Graph (D3 render, nodes/edges) | Renders, limited interaction | **60%** |
| Research Panel (docs + gaps) | Working, good layout | **70%** |
| Chat / Threads | Project-scoped, SSE streaming works | **55%** |
| Insights | Two overlapping UIs, but data is real | **50%** |
| Agents | Templates only, no execution | **15%** |
| Tasks | Works but localStorage only | **35%** |
| Dashboard / Home | Real data, but no AI summary | **60%** |
| Search | API works, UI is minimal | **40%** |
| Settings | Profile + workspace + members | **70%** |
| Auth | Complete | **95%** |
| Self-improvement engine | Running on Celery Beat | **75%** |
| **Overall** | | **~58%** |

---

## 13. Recommended 4-Week Development Plan

### Week 1 — Foundation & Dashboard
**Goal:** Make what exists feel polished and complete.

- [ ] Merge Atlas into main `(app)/` shell — remove `(atlas)/` layout
- [ ] Dashboard redesign: wire AI summary from ATLAS.md, add live stats (docs ingested today, active feeds, recent threads)
- [ ] Consolidate `/insights` + `/insight-center` into one page
- [ ] Add `TODAY_REPORT.md` auto-generation to engine loop
- [ ] Extract `relativeTime()` to shared utility

**Commit:** `feat: merge atlas, dashboard redesign, consolidate insights`

### Week 2 — Search & Knowledge
**Goal:** Make knowledge discovery actually useful.

- [ ] Cmd+K global search modal (existing hybrid API)
- [ ] Knowledge page: full-text search, category filter, favorites, doc detail panel
- [ ] Live ingestion progress via SSE
- [ ] Split `knowledge.py` into 3 files

**Commit:** `feat: cmd+k search, knowledge page v2, live progress`

### Week 3 — Tasks & Agent Execution
**Goal:** Turn templates into real capabilities.

- [ ] Tasks: DB table + API + move from localStorage
- [ ] Agent executor: `run_agent(type, context)` with tool loop
- [ ] Research Assistant agent: search → synthesize → return report
- [ ] Agent page: show real run history, status, next tasks

**Commit:** `feat: tasks backend, first real agent (research assistant)`

### Week 4 — Memory, Workflow & Polish
**Goal:** Ship the OS vision.

- [ ] Agent memory: store runs, read own history
- [ ] "Daily Briefing" workflow (hard-coded pipeline, triggers via Celery Beat)
- [ ] Real-time KG updates (feed run → new nodes/edges appear in graph)
- [ ] Test suite baseline: pytest + 10 critical path tests
- [ ] Performance: TanStack Query cache tuning, Suspense boundaries

**Commit:** `feat: agent memory, daily briefing workflow, test suite`

---

*This audit covers 100+ Python files, 30+ TypeScript files, 21 pages, 5 Atlas components, 18+ API routes, 16 DB tables, and the full AI pipeline.*
