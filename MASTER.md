# Flora — Master Document

_AI Factory operating reference. Read this before every milestone._

---

## Mission

Flora is an AI-native Research Operating System. It ingests knowledge from multiple sources, builds a live knowledge graph, and makes that intelligence searchable and conversational.

**Current maturity:** MVP — core flows work, zero test coverage, several known bugs.

**North star:** Production-ready, self-improving, multi-tenant knowledge platform.

---

## Architecture

```
apps/
  api/      FastAPI + Celery + pgvector (Python 3.12)
  web/      Next.js 15 App Router (TypeScript)
packages/
  types/    Shared TypeScript interfaces
  ui/       shadcn/ui component library
  config/   Shared eslint / tsconfig / tailwind
```

**Auth:** JWT in httpOnly cookies (`access_token`, `refresh_token`). All API calls use `credentials: "include"`. Never use Bearer header — the API reads cookies only.

**Data flow:**
1. Source upload → Celery ingest → Voyage AI embed → pgvector
2. Atlas: Feed collection → Ollama extraction → KG builder → gap detector
3. Search: pgvector cosine + tsvector BM25 → RRF fusion → top 8 chunks
4. Chat: RAG context → OpenAI/Anthropic/Ollama SSE stream → persist message

**Key services (local dev):**
- Redis: Docker container (`flora-redis-1`)
- FastAPI: uvicorn :8000
- Celery: worker + beat (`-B` flag)
- Next.js: :3000

---

## Operating Rules

1. Read MASTER.md + ROADMAP.md + NEXT_TASK.md before every milestone.
2. Work 5–15 files per milestone only.
3. Every milestone: Analyze → Implement → Type-check/lint → Fix → Commit → Update NEXT_TASK.md.
4. Never redesign unrelated modules.
5. Always leave the repo in a working state (passing type-check + lint).
6. Each commit must be self-contained and deployable.

---

## Completed Milestones

| # | Milestone | Commit |
|---|---|---|
| 0 | Flora MVP — auth, projects, sources, search, threads, insights | e43107a |
| 1 | Redesign project detail + thread UI | 0e28189 |
| 2 | Sprints S1-S8: Atlas KG, Ask Flora, Intel Briefing, Feed Manager | bc9655a–f13b3ab |
| 3 | Knowledge pipeline, Ollama provider, self-improvement engine | 6061920 |
| 4 | Fix lint errors, remove unused props | 74cafcc |
| 5 | Cookie secure flag, useQuery error states, Nightly Runner | 02ab131 |

---

## Priority Queue (from ROADMAP.md)

| Priority | Item | Effort | Score |
|---|---|---|---|
| ✅ done | Cookie `secure` flag environment-aware | low | 135 |
| ✅ done | useQuery error states (blank screen on failure) | medium | 81 |
| **next** | Test suite baseline — pytest + conftest | high | 133 |
| next | Tasks backend (currently localStorage-only) | medium | 80 |
| next | Cmd+K global search | medium | high |
| next | Collections UI | medium | high |
| next | Password reset flow | medium | high |
| later | N+1 query fixes (asyncio.gather) | medium | 59 |
| later | NEXT_PUBLIC_API_URL (hardcoded localhost) | low | medium |

---

## Dev Credentials

- Email: `zhangyu880227@gmail.com`
- Password: `Flora2026!`
- Workspace ID: `b4159bac-2800-4044-af85-c23d8bf7b747`

---

## Network Rules

- Never disconnect or modify VPN settings.
- Never disable network interfaces.
- If network connectivity fails, verify VPN is connected first.
- If VPN disconnects unexpectedly, notify the user — do not change VPN config.
