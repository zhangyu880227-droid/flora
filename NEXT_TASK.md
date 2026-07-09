# Next Task

_Updated: 2026-07-09 — Flora AI Factory_

---

## Current Session State

Atlas nightly operations are complete. All services verified healthy.
Two security/UX milestones committed (02ab131).

---

## Milestone 3 — Test Suite Baseline (Score: 133, Effort: High)

**Why this is next:** Zero test coverage is a blocker for safe iteration. Any refactor could silently break auth, search, or ingestion.

**Scope (5–10 files):**
1. `apps/api/tests/__init__.py`
2. `apps/api/tests/conftest.py` — async test client, in-memory SQLite or test PostgreSQL
3. `apps/api/tests/test_auth.py` — register, login, refresh, logout
4. `apps/api/tests/test_workspaces.py` — CRUD, member roles
5. `apps/api/tests/test_projects.py` — create, list, get, delete with workspace isolation
6. `apps/api/tests/test_search.py` — hybrid search endpoint
7. `apps/api/tests/test_ingestion.py` — source creation + status flow

**Acceptance criteria:**
- `pytest apps/api/tests` exits 0
- Auth, workspace isolation, and search endpoints covered
- CI-ready (no external dependencies in tests)

**Technical approach:**
- Use `httpx.AsyncClient` with `app` transport (no real server needed)
- Test DB: PostgreSQL with a separate test schema OR use SQLite for speed
- Fixture: auto-created test user + workspace per test

---

## Milestone 4 — Tasks Backend (Score: 80)

After tests: Tasks currently stored in browser localStorage only.

**Files:**
- `apps/api/app/models/task.py`
- `apps/api/app/schemas/task.py`
- `apps/api/app/api/v1/tasks.py`
- `apps/api/migrations/versions/XXXX_tasks_table.py`
- `apps/web/src/stores/tasks.ts` — switch from localStorage to API

---

## Milestone 5 — Cmd+K Global Search (High impact)

- `apps/web/src/components/command-palette.tsx`
- `apps/web/src/providers.tsx` (register keyboard shortcut)

---

## Deferred / Known Issues

- `reprocess.py` has print() statements and asyncio.run() in async context (low priority)
- N+1 query patterns in knowledge_tasks.py (medium priority, fix with asyncio.gather)
- Hardcoded localhost URL in next.config.ts (use NEXT_PUBLIC_API_URL)

---

## Atlas Ops Notes

Pipeline ran 2026-07-09. All 162 docs remain current. 72 items skipped (all already indexed). No failures. Knowledge graph: 315 nodes, 255 edges. 8 knowledge gaps detected.
