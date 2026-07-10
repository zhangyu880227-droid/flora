# PRODUCT ARCHITECTURE — Flora / Atlas
*Design document for the redesigned product.*

---

## Information Architecture

```
Atlas (Root)
├── Home (Dashboard)           — Today's intelligence + activity
├── Knowledge                  — Feed browser + KG + doc detail
│   ├── Feeds                  — Configure + monitor data sources
│   ├── Documents              — Full document browser + search
│   ├── Graph                  — Knowledge graph visualization
│   └── Favorites              — Bookmarked documents
├── Research (Projects)        — Project-scoped deep research
│   ├── [Project]              — Sources + threads + insights
│   │   ├── Sources            — Uploaded/linked documents
│   │   ├── Threads            — Conversation history
│   │   └── Insights           — Generated synthesis
│   └── New Project
├── Chat                       — Global research chat (no project scope)
├── Agent                      — Autonomous agent runs
│   ├── Research Assistant     — Literature synthesis
│   ├── Market Analyst         — Financial + market intelligence
│   └── [Runs]                 — History of agent executions
├── Tasks                      — AI-suggested + manual tasks
├── Search                     — Global Cmd+K + full search page
└── Settings                   — Profile, workspace, members, integrations
```

---

## Navigation

### Sidebar (persistent, collapsible)
```
[Logo] Atlas

── Intelligence ──
  Dashboard
  Knowledge
  Chat

── Research ──
  Projects
  Insights

── Automation ──
  Agents
  Tasks
  Workflows  (future)

── System ──
  Search
  Settings
```

**Design rules:**
- Sidebar is always visible on desktop (>768px); slide-in sheet on mobile
- Active item has a filled left border + subtle background
- Section headers are muted, non-interactive labels
- No nested expansion in sidebar — depth handled within pages
- Workspace switcher lives at the top of sidebar (above nav items)

---

## Page Designs

---

### Dashboard

**Route:** `/`
**Purpose:** Answer "what happened while I was away?" and "what should I do next?"

**Layout (3-column grid on wide screens):**
```
┌─────────────────────────────────────────────────┐
│  Good morning, Max.                             │
│  Here's what Atlas found since yesterday.       │
└─────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────┐  ┌────────────┐
│ Today's Briefing │  │ Recent Docs  │  │ Agent      │
│                  │  │              │  │ Status     │
│ 5 AI summaries   │  │ 9 new today  │  │            │
│ from overnight   │  │ scroll list  │  │ Last run:  │
│ feed runs        │  │              │  │ 2h ago     │
└──────────────────┘  └──────────────┘  └────────────┘

┌──────────────────┐  ┌──────────────────────────────┐
│ Knowledge Gaps   │  │ Active Tasks                  │
│                  │  │                               │
│ • [gap 1]        │  │ • Review SEC EDGAR findings  │
│ • [gap 2]        │  │ • Read ArXiv batch           │
│ • [gap 3]        │  │                               │
└──────────────────┘  └──────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Quick Actions                                    │
│ [+ New Research]  [Run Feeds]  [Open Chat]      │
└─────────────────────────────────────────────────┘
```

**Data sources:**
- Today's Briefing: parse ATLAS.md or call `/api/v1/engine/atlas`
- Recent Docs: `GET /api/v1/knowledge/documents?limit=10&since=24h`
- Agent Status: `GET /api/v1/engine/status`
- Knowledge Gaps: `GET /api/v1/engine/findings` (type=gap)
- Active Tasks: `GET /api/v1/tasks` (status=todo,in_progress, limit=5)

**Design rules:**
- No placeholder text. All sections must show real data or a "No data yet" empty state with a CTA.
- AI Briefing is the hero section — always at top, always shows something.
- Quick Actions are contextual (e.g., if feeds haven't run today, highlight "Run Feeds").

---

### Knowledge

**Route:** `/knowledge`
**Purpose:** Browse, search, and explore everything Atlas has learned.

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│  [Search knowledge...]         [Filter: Type ▾] [Sort ▾] │
└──────────────────────────────────────────────────────────┘

┌────────────┐  ┌───────────────────────────────────────────┐
│ Sidebar    │  │ Document list                              │
│            │  │                                            │
│ All (1.2k) │  │ ┌─────────────────────────────────────┐  │
│ Today (9)  │  │ │ [doc title]              [tag] [★]  │  │
│ Favorites  │  │ │ Hacker News • 2h ago                │  │
│ ──────     │  │ │ AI extracted summary here...        │  │
│ By type:   │  │ └─────────────────────────────────────┘  │
│  arxiv (8) │  │                                            │
│  rss (45)  │  │ ┌─────────────────────────────────────┐  │
│  github(12)│  │ │ [doc title]              [tag] [★]  │  │
│ ──────     │  │ │ ArXiv • 4h ago                     │  │
│ By tag:    │  │ │ AI extracted summary here...        │  │
│  ai (23)   │  │ └─────────────────────────────────────┘  │
│  llm (15)  │  │                                            │
│  ...       │  └───────────────────────────────────────────┘
└────────────┘

Tabs: [Documents] [Knowledge Graph] [Feeds]
```

**Document detail (slide-in panel or full page):**
- Full clean content
- AI summary + key insights
- Extracted entities (chips)
- Relationships (mini graph)
- Source feed info + collected date
- Favorite toggle
- Related documents (by entity overlap)

**Feeds sub-page:**
- List of all 15+ configured feeds
- Status: last run, docs collected, consecutive failures
- Manual "Run Now" button per feed
- Live progress indicator during run

**Graph sub-page:**
- Full D3-force KG (existing component)
- Node type filter (org, person, product, tech, concept)
- Click node → show related documents panel
- Search nodes by name

---

### Chat

**Route:** `/chat`
**Purpose:** Global research chat — not scoped to a project. Ask anything across the full knowledge base.

**Layout:**
```
┌──────────────────┐  ┌──────────────────────────────────────┐
│ History          │  │ Chat window                           │
│                  │  │                                        │
│ Today            │  │ ┌─────────────────────────────────┐  │
│  • What is TSMC  │  │ │ Assistant (streaming)            │  │
│  • ArXiv summary │  │ │                                  │  │
│ Yesterday        │  │ │ Sources cited: [src1] [src2]    │  │
│  • LLM trends    │  │ └─────────────────────────────────┘  │
│                  │  │                                        │
│ [+ New Chat]     │  │ [Ask anything about your knowledge...]│
└──────────────────┘  └──────────────────────────────────────┘
```

**Key differences from current `/threads`:**
- Not project-scoped — searches across all workspace knowledge
- Chat history is global, persisted in DB
- Model selector in top bar (Ollama / OpenAI / Anthropic)
- Each message shows cited documents as expandable cards below text

**Implementation note:** Reuse existing SSE streaming and `stream_chat()` service. Add a global thread concept (no `project_id` required).

---

### Agent

**Route:** `/agents`
**Purpose:** Configure, run, and review autonomous AI agent executions.

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│  Agents                              [+ New Agent Run]   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Agent Templates                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Research     │  │ Market       │  │ Literature   │  │
│  │ Assistant    │  │ Analyst      │  │ Review       │  │
│  │              │  │              │  │              │  │
│  │ [Run]        │  │ [Run]        │  │ [Run]        │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Recent Runs                                              │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Research Assistant     2h ago     ✓ Completed       │ │
│  │ "Summarize TSMC news this week"                     │ │
│  │ Output: 3 insights, 1 task created                  │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Market Analyst         1d ago     ✓ Completed       │ │
│  │ "Analyze semiconductor supply chain"                │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Agent run detail:**
- Goal / prompt used
- Steps taken (tool calls logged as expandable items)
- Output (structured report)
- Documents consulted (citations)
- Tasks created
- Duration + tokens used

---

### Memory (future)

**Route:** `/memory` (not yet built)
**Purpose:** Persistent facts Atlas has learned about the user's context — not documents, but structured beliefs.

Examples:
- "User is tracking TSMC's supply chain strategy"
- "User's research focus: AI hardware and inference efficiency"
- "Research gaps identified last week: post-training scaling laws"

Populated by agent runs + engine loop. Editable by user.

---

### Reasoning (future)

**Route:** `/reasoning` (not yet built)
**Purpose:** Hypothesis tracking. User or agent proposes a hypothesis; Atlas tracks evidence for/against it from incoming feeds.

---

### Tasks

**Route:** `/tasks`
**Purpose:** Everything that needs to happen next.

**Current state:** localStorage-backed, works for single user/device.
**Target state:** DB-backed, AI-suggested, cross-device.

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│  Tasks                         [+ Add Task] [Filter ▾]  │
└──────────────────────────────────────────────────────────┘

┌────────────────────────────┐  ┌──────────────────────────┐
│ In Progress                │  │ AI Suggested             │
│ ─────────────────────────  │  │ ─────────────────────────│
│ □ Review SEC findings      │  │ ○ Investigate gap:       │
│   High · Research          │  │   "Post-training scaling" │
│                            │  │   [Accept] [Dismiss]     │
│ To Do                      │  │                          │
│ ─────────────────────────  │  │ ○ Follow up on:          │
│ □ Read ArXiv batch         │  │   TSMC Q3 earnings       │
│   Medium · Knowledge       │  │   [Accept] [Dismiss]     │
│                            │  │                          │
│ Done                       │  └──────────────────────────┘
│ ─────────────────────────  │
│ ✓ Configure SEC EDGAR feed │
└────────────────────────────┘
```

---

### Search

**Route:** `/search` + Cmd+K modal
**Purpose:** Find anything in the knowledge base instantly.

**Cmd+K modal:**
- Triggers from any page
- Input: instant results as you type
- Result sections: Documents, Projects, Threads, Insights, Knowledge Graph nodes
- Keyboard navigable (↑↓ Enter)
- Each result shows type chip + snippet + timestamp

**Full search page:**
- Same as modal but expanded
- Filters: source type, date range, confidence score
- Sort: relevance, date, importance score
- Export results (future)

---

### Settings

**Route:** `/settings`
**Purpose:** Configure everything that affects how Atlas behaves.

**Tabs:**
1. **Profile** — Name, email, password, avatar
2. **Workspace** — Name, slug, plan
3. **Members** — Invite, role management
4. **Feeds** — Quick link to Knowledge > Feeds
5. **AI** — LLM provider selection, API key entry (future: full self-hosted config)
6. **Integrations** — Future: Slack, email, Notion, GitHub (webhooks)

---

## Routing Map (final target)

```
/                     → redirect to /dashboard
/dashboard            → Home (replaces /workspace)
/knowledge            → Knowledge browser (Documents tab default)
/knowledge/graph      → Knowledge Graph tab
/knowledge/feeds      → Feeds tab
/chat                 → Global chat (replaces /threads as primary)
/research             → Projects list (rename /projects)
/research/[id]        → Project detail
/research/[id]/[tid]  → Thread (project-scoped)
/insights             → Consolidated insights (merge insight-center)
/agents               → Agent templates + run history
/tasks                → Tasks (DB-backed)
/search               → Full search page
/settings             → Settings (tabs)
```

**Removed:**
- `/atlas` — KG folded into `/knowledge/graph`
- `/insight-center` — merged into `/insights`
- `/threads` — global chat moves to `/chat`; project threads at `/research/[id]/[tid]`
- `/workspaces` — workspace switching stays in sidebar only

---

## Design System Constraints

- **Component library:** `@flora/ui` only. No new component libraries.
- **Icons:** Lucide React. Same set throughout.
- **Colors:** Tailwind CSS variables via `@flora/ui`. Dark mode via `next-themes`.
- **Typography:** System font stack. No custom web fonts.
- **Spacing:** Tailwind scale (4/8/12/16/24/32). No arbitrary values.
- **Motion:** Framer Motion only if already in the bundle. Prefer CSS transitions.
- **Breakpoints:** Mobile-first. Full layout at `md` (768px) and above.

---

## Implementation Priority (PHASE 4 order)

1. **Dashboard** — Most visible, uses real APIs already available
2. **Knowledge** — Core value prop, pipeline already works
3. **Chat** — Reuse thread SSE, just remove project scope
4. **Agent** — Requires new executor, highest engineering complexity
5. **Tasks** — DB migration first, then UI update
6. **Search** — Cmd+K modal (existing API), then full page
7. **Settings** — Add AI tab, clean up existing tabs
8. **Memory** — Future milestone, schema TBD
