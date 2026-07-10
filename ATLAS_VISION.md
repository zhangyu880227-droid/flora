# ATLAS VISION
*Derived from existing code, design, and architecture — not assumptions.*

---

## One-Sentence Definition

Atlas is an AI-native intelligence operating system that continuously collects, connects, and synthesizes information from the world, so that researchers and knowledge workers always know what matters and what to do next.

---

## Product Goals

1. **Zero information anxiety** — Never wonder "what did I miss?" Atlas reads everything you care about and surfaces only what's important.

2. **Connected knowledge** — Every fact links to its source, every source links to related concepts, every concept links to actions. Nothing is siloed.

3. **Autonomous intelligence** — Atlas works while you sleep. It collects feeds, extracts entities, builds a knowledge graph, detects gaps, and drafts briefings — without being asked.

4. **Research acceleration** — When you start a research thread, Atlas already knows what you know. It retrieves the right context, not the full corpus.

5. **Actionable output** — Insights don't end in a document. They become tasks, agent runs, or workflow triggers.

---

## Target Users

**Primary: Knowledge-intensive professionals**
- Investors and analysts tracking markets, companies, technology trends
- Researchers synthesizing literature across papers, news, and reports
- Product strategists monitoring competitors, regulatory changes, technology shifts
- Founders who need to stay informed across multiple domains simultaneously

**Secondary: Power users who have outgrown bookmarks and Notion**
- People who collect information everywhere and can never find it
- People who write long weekly research summaries by hand
- People who want AI help but distrust generic chatbots with no context

**What they have in common:** They process more information than any individual can hold in their head, and they need to act on it — not just archive it.

---

## Core Capabilities (implemented)

### 1. Autonomous Feed Collection
15 configured feeds across tech, AI research, financial filings, GitHub, and market news. Runs on a 30-minute Celery Beat schedule. RSS, ArXiv, GitHub Trending, Google News, SEC EDGAR — all piped through a unified collector interface.

### 2. AI-Powered Knowledge Extraction
Every collected document is processed by an LLM: generates a summary, extracts key insights, identifies named entities (organizations, people, products, technologies), maps relationships between entities, scores confidence and importance. Output is structured JSON stored in PostgreSQL.

### 3. Semantic + Full-Text Search
Voyage AI `voyage-3` embeddings (1024-dim) stored in pgvector. Hybrid retrieval: cosine similarity (top 20) + BM25 tsvector (top 20), fused via Reciprocal Rank Fusion (top 8). Works across source chunks and knowledge documents.

### 4. Knowledge Graph
KG nodes and edges built from extracted entities and relationships. D3-force visualization in the Atlas panel. Supports node search, filtering by type, edge traversal.

### 5. Research Threads
Project-scoped conversation threads with RAG-backed context. Every assistant message cites the source chunks it drew from. Streaming via SSE.

### 6. AI Insight Generation
On-demand synthesis across a project's sources. User specifies topic, Atlas retrieves top chunks, LLM generates a structured insight with key points.

### 7. Self-Improvement Engine
Celery Beat task every 30 minutes: reads current state, detects knowledge gaps, updates ATLAS.md (the system's self-description), generates task suggestions. The system literally improves its own awareness over time.

---

## Future Capabilities (designed but not yet built)

### Real Agent Execution
Beyond templates — actual tool-calling loops. A Research Assistant agent that can search the knowledge graph, follow leads, draft a report, and store findings. Triggered on demand or by schedule.

### Persistent Task Intelligence
Tasks become first-class DB entities. Atlas automatically suggests tasks based on knowledge gaps. Agent runs create follow-up tasks. Tasks have priorities, owners, and due dates.

### Workflow Automation
Visual or config-driven pipelines: "Every morning: collect feeds → summarize overnight news → draft briefing → add to Daily Digest." Workflow steps are composable — collect, search, summarize, notify, create task.

### Knowledge Memory for Agents
Agents read their own run history. The Research Assistant remembers what it already investigated. The Analysis Agent knows which hypotheses it already tested. Memory makes agents more efficient over time.

### Live Collaboration
Shared workspaces where multiple users see the same knowledge graph updating in real time. Presence indicators. Commenting on knowledge documents. Shared task boards.

---

## Why Users Open Atlas Every Day

**The morning habit:** Atlas already ran overnight. There's a briefing ready — 5 bullet points on what changed in your domains. You scan it in 60 seconds. You didn't miss anything.

**The research moment:** You need to understand a topic fast. Instead of 3 hours of Googling, you open Atlas, type the question, and see a synthesized answer backed by 40 documents Atlas has already read and connected.

**The "what should I do" question:** Atlas shows knowledge gaps — topics your feeds cover but your research hasn't explored yet. It surfaces tasks suggested by the AI. The next action is always visible.

**The satisfying graph:** The knowledge graph grows every day. You can watch your understanding of a topic deepen — new nodes appear, new connections form. It's a visible record of cumulative intelligence.

---

## What Atlas Is NOT

- Not a bookmarking tool (bookmarks don't extract meaning or build connections)
- Not a note-taking app (notes are passive; Atlas is active)
- Not a generic chatbot (Atlas has deep context from everything it's read)
- Not a search engine (search is a component, not the product)
- Not a dashboard of widgets (data without synthesis is noise)

---

*Atlas is the research intelligence layer that sits between the world's information and the human decisions that depend on it.*
