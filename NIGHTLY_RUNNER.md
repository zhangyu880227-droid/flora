# Flora Atlas — Nightly Runner

Autonomous overnight pipeline that keeps the Atlas knowledge base fresh without human intervention.

---

## What It Does

Each night, the runner executes this sequence in order:

| Step | Action |
|---|---|
| 1 | Start Redis, FastAPI, Celery if not running |
| 2 | Authenticate with the Flora API |
| 3 | Snapshot current doc / node / edge counts |
| 4 | Detect and report duplicate documents |
| 5 | Trigger full feed collection (all 15 feeds) |
| 6 | Run Self-Improvement Loop (graph build + gap detection) |
| 7 | Snapshot final counts and compute deltas |
| 8 | Generate Intel Briefing |
| 9 | Write a Markdown report to `.flora/reports/` |

Any step that fails is logged; the runner continues unless the error is unrecoverable.

---

## Quick Start

```bash
# Manual one-shot run (right now)
./scripts/atlas_ctl.sh run

# Install launchd service (runs at 2:30 AM nightly)
./scripts/atlas_ctl.sh install

# Check service health
./scripts/atlas_ctl.sh status

# Start services manually
./scripts/atlas_ctl.sh start

# Stop API + Celery (Redis stays up)
./scripts/atlas_ctl.sh stop
```

---

## Commands

### `atlas_ctl.sh`

| Command | Description |
|---|---|
| `start` | Start Redis (Docker), FastAPI (uvicorn), Celery worker+beat |
| `stop` | Stop FastAPI and Celery (Redis left running) |
| `restart` | Stop then start |
| `status` | Show health of every service + launchd schedule |
| `install` | Install and load the launchd nightly service |
| `uninstall` | Unload and remove the launchd service |
| `run` | Run the full nightly pipeline now (alias for nightly_atlas.sh) |
| `logs [nightly\|celery\|api]` | Tail the relevant log |

### `nightly_atlas.sh`

The main pipeline script. Called by launchd and by `atlas_ctl.sh run`.

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `FLORA_EMAIL` | `zhangyu880227@gmail.com` | API login email |
| `FLORA_PASSWORD` | `Flora2026!` | API login password |
| `FLORA_REPORT_DIR` | `.flora/reports/` | Where to write nightly reports |
| `FLORA_NIGHTLY_HOUR` | `2` | Hour for launchd schedule (0–23) |
| `FLORA_NIGHTLY_MINUTE` | `30` | Minute for launchd schedule |

---

## Scheduling

The launchd service (`com.flora.atlas.nightly`) runs `nightly_atlas.sh` at **2:30 AM** every night.

```bash
# Install the schedule
./scripts/atlas_ctl.sh install

# Trigger a manual launchd run (without waiting for 2:30 AM)
launchctl start com.flora.atlas.nightly

# Check last run exit code
launchctl list com.flora.atlas.nightly

# View launchd output
cat ~/.flora/logs/launchd_stdout.log
```

The plist is installed at `~/Library/LaunchAgents/com.flora.atlas.nightly.plist`.

To change the schedule, set `FLORA_NIGHTLY_HOUR` / `FLORA_NIGHTLY_MINUTE` before running `install`, or edit the plist directly and reload:

```bash
launchctl unload ~/Library/LaunchAgents/com.flora.atlas.nightly.plist
launchctl load  ~/Library/LaunchAgents/com.flora.atlas.nightly.plist
```

---

## Output Files

All output lands in `.flora/`:

```
.flora/
├── logs/
│   ├── nightly_20260709_023001.log   # full run log (timestamped)
│   ├── celery.log                    # Celery worker output
│   ├── uvicorn.log                   # FastAPI output
│   ├── launchd_stdout.log            # launchd stdout
│   └── launchd_stderr.log            # launchd stderr
└── reports/
    ├── nightly_report_20260709_023001.md    # Markdown run report
    └── briefing_20260709_023001.txt         # Intel Briefing text
```

---

## Architecture

```
nightly_atlas.sh
│
├── atlas_ctl.sh start        → Redis (docker compose), uvicorn, celery -B
├── POST /auth/login          → JWT cookie
├── GET  /knowledge/stats     → baseline
├── POST /knowledge/collect   → queues run_knowledge_pipeline Celery task
│     └── Celery: run_workspace() → for each feed:
│              collector (RSS/arxiv/GitHub/SEC/Google News)
│              → raw_content → extract_knowledge(Ollama) → KnowledgeDocument
│              → embed (Voyage AI or local fallback)
│              → KnowledgeIngestionRun record
├── POST /knowledge/loop      → queues run_self_improvement_loop Celery task
│     └── Celery: SelfImprovementLoop.run()
│              → recover stale runs
│              → run_workspace() (second pass for any new feeds)
│              → KnowledgeGraphBuilder.build() → KGNode / KGEdge upserts
│              → GapDetector.detect() → research task list
│              → _update_atlas() → ATLAS.md Knowledge Intelligence section
├── GET  /knowledge/stats     → final snapshot
├── GET  /knowledge/briefing  → instant data-driven briefing
└── write .flora/reports/     → Markdown report
```

---

## Failure Handling

- **Feed collection failure**: logged, runner continues to loop step
- **Loop timeout** (>30 min): logged, runner continues to briefing
- **Authentication failure**: fatal — runner exits with code 1
- **Service start failure**: fatal for API/Celery, warning for Next.js
- **Stale Celery runs**: the loop automatically recovers runs stuck for >15 minutes
- **Duplicate documents**: prevented at DB level (URL uniqueness constraint) and checked at start

Exit code: `0` if all steps succeeded, `1` if any non-fatal errors occurred.

---

## Troubleshooting

**"Not authenticated" from API**

The httpOnly cookie auth requires the `Cookie: access_token=...` header. The runner extracts the token from the login response and passes it explicitly — no curl cookie jar needed.

**Pipeline runs but no new documents appear**

Feeds may all be up-to-date (documents already indexed = `skipped`). This is normal if collection was triggered recently. The pipeline deduplicates by URL.

**Celery tasks queue but never run**

Check that Celery is running with the Beat scheduler (`-B` flag) and that Redis is healthy:
```bash
./scripts/atlas_ctl.sh status
./scripts/atlas_ctl.sh logs celery
```

**Ollama timeouts on AI extraction**

The extractor has a 45-second timeout per document with a semaphore limiting concurrent calls to 2. If Ollama is slow, documents are stored without AI summaries and can be reprocessed:
```bash
curl -s -X POST -H "Cookie: access_token=TOKEN" \
  http://127.0.0.1:8000/api/v1/workspaces/WORKSPACE_ID/knowledge/reprocess
```
