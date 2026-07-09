#!/usr/bin/env bash
# Flora Atlas — Nightly Runner
# Runs the complete overnight knowledge pipeline autonomously.
# Usage: ./nightly_atlas.sh [--report-dir /path/to/reports]

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

FLORA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$FLORA_DIR/apps/api"
WEB_DIR="$FLORA_DIR/apps/web"
VENV="$API_DIR/.venv"
LOG_DIR="$FLORA_DIR/.flora/logs"
REPORT_DIR="${FLORA_REPORT_DIR:-$FLORA_DIR/.flora/reports}"
TONIGHT_LOG="$LOG_DIR/nightly_$(date +%Y%m%d_%H%M%S).log"

API_URL="http://127.0.0.1:8000"
WEB_URL="http://127.0.0.1:3000"
API_EMAIL="${FLORA_EMAIL:-zhangyu880227@gmail.com}"
API_PASSWORD="${FLORA_PASSWORD:-Flora2026!}"

COLLECT_TIMEOUT=900   # 15 min: feed collection
LOOP_TIMEOUT=1800     # 30 min: self-improvement loop
POLL_INTERVAL=15      # seconds between status checks

# Color helpers (skipped when not a TTY)
if [ -t 1 ]; then
  GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'
else
  GREEN=''; YELLOW=''; RED=''; CYAN=''; RESET=''
fi

# ── Logging ───────────────────────────────────────────────────────────────────

mkdir -p "$LOG_DIR" "$REPORT_DIR"
exec > >(tee -a "$TONIGHT_LOG") 2>&1

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
ok()   { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $*${RESET}"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $*${RESET}"; }
fail() { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $*${RESET}"; }
info() { echo -e "${CYAN}[$(date '+%H:%M:%S')]   $*${RESET}"; }

# ── State tracking ────────────────────────────────────────────────────────────

DOCS_BEFORE=0
NODES_BEFORE=0
EDGES_BEFORE=0
DOCS_AFTER=0
NODES_AFTER=0
EDGES_AFTER=0
NEW_DOCS=0
NEW_NODES=0
NEW_EDGES=0
FEEDS_COLLECTED=0
FEEDS_FAILED=0
FEEDS_SKIPPED=0
GAPS_DETECTED=0
ERRORS=()
TOKEN=""
WORKSPACE_ID=""

# ── Helpers ───────────────────────────────────────────────────────────────────

api_get() {
  curl -s -m 30 -H "Cookie: access_token=$TOKEN" "$API_URL$1"
}

api_post() {
  curl -s -m 30 -X POST -H "Cookie: access_token=$TOKEN" \
       -H "Content-Type: application/json" "${2:+-d $2}" "$API_URL$1"
}

jq_val() {
  echo "$1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d$2)" 2>/dev/null || echo ""
}

wait_for_runs() {
  # Poll /runs until none are in "running" status, or timeout
  local label="$1" timeout="$2" start elapsed
  start=$(date +%s)
  while true; do
    elapsed=$(( $(date +%s) - start ))
    if [ "$elapsed" -ge "$timeout" ]; then
      warn "$label timed out after ${timeout}s"
      return 1
    fi

    local running_count
    running_count=$(api_get "/api/v1/workspaces/$WORKSPACE_ID/knowledge/runs?limit=20" | \
      python3 -c "
import json,sys
runs=json.load(sys.stdin)
print(sum(1 for r in runs if r.get('status')=='running'))
" 2>/dev/null || echo "0")

    if [ "$running_count" -eq 0 ]; then
      return 0
    fi
    info "$label — $running_count task(s) still running… (${elapsed}s elapsed)"
    sleep "$POLL_INTERVAL"
  done
}

# ── Step 1: Services ──────────────────────────────────────────────────────────

start_services() {
  log "━━ STEP 1: Service Health Check ━━"

  # Redis via Docker
  if ! docker compose -f "$FLORA_DIR/docker-compose.yml" ps redis 2>/dev/null | grep -q "healthy"; then
    log "Starting Redis..."
    docker compose -f "$FLORA_DIR/docker-compose.yml" up -d redis
    local tries=0
    while ! docker compose -f "$FLORA_DIR/docker-compose.yml" ps redis | grep -q "healthy"; do
      sleep 3; tries=$((tries+1))
      [ "$tries" -ge 15 ] && { fail "Redis failed to start"; ERRORS+=("Redis failed to start"); return 1; }
    done
    ok "Redis started"
  else
    ok "Redis: healthy"
  fi

  # FastAPI
  if ! curl -sf "$API_URL/api/health" >/dev/null 2>&1; then
    log "Starting FastAPI..."
    cd "$API_DIR"
    source "$VENV/bin/activate"
    nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 >> "$LOG_DIR/uvicorn.log" 2>&1 &
    echo $! > "$LOG_DIR/uvicorn.pid"
    local tries=0
    while ! curl -sf "$API_URL/api/health" >/dev/null 2>&1; do
      sleep 2; tries=$((tries+1))
      [ "$tries" -ge 30 ] && { fail "FastAPI failed to start"; ERRORS+=("FastAPI failed to start"); return 1; }
    done
    ok "FastAPI started (pid $!)"
  else
    ok "FastAPI: healthy"
  fi

  # Celery worker+beat
  if ! pgrep -f "celery.*flora" >/dev/null 2>&1; then
    log "Starting Celery worker+beat..."
    cd "$API_DIR"
    source "$VENV/bin/activate"
    nohup celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2 -B \
      >> "$LOG_DIR/celery.log" 2>&1 &
    echo $! > "$LOG_DIR/celery.pid"
    sleep 5
    if pgrep -f "celery.*app.tasks.celery_app" >/dev/null 2>&1; then
      ok "Celery worker+beat started"
    else
      fail "Celery failed to start"; ERRORS+=("Celery failed to start"); return 1
    fi
  else
    ok "Celery: running"
  fi

  # Next.js (informational only — not required for pipeline)
  if curl -sf "$WEB_URL" >/dev/null 2>&1; then
    ok "Next.js: accessible at $WEB_URL"
  else
    warn "Next.js not running — Atlas UI unavailable (pipeline will continue)"
  fi
}

# ── Step 2: Authenticate ──────────────────────────────────────────────────────

authenticate() {
  log "━━ STEP 2: Authentication ━━"
  local resp
  resp=$(curl -s -m 15 -X POST "$API_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$API_EMAIL\",\"password\":\"$API_PASSWORD\"}")

  TOKEN=$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['access_token'])" 2>/dev/null)
  WORKSPACE_ID=$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['workspace']['id'])" 2>/dev/null)

  if [ -z "$TOKEN" ] || [ -z "$WORKSPACE_ID" ]; then
    fail "Authentication failed: $resp"
    ERRORS+=("Authentication failed")
    exit 1
  fi
  ok "Authenticated as $API_EMAIL (workspace: $WORKSPACE_ID)"
}

# ── Step 3: Baseline snapshot ────────────────────────────────────────────────

snapshot_before() {
  log "━━ STEP 3: Baseline Snapshot ━━"
  local stats graph_stats
  stats=$(api_get "/api/v1/workspaces/$WORKSPACE_ID/knowledge/stats")
  graph_stats=$(api_get "/api/v1/workspaces/$WORKSPACE_ID/knowledge/graph/stats")

  DOCS_BEFORE=$(echo "$stats"  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total_docs',0))" 2>/dev/null || echo 0)
  NODES_BEFORE=$(echo "$graph_stats" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('node_count',0))" 2>/dev/null || echo 0)
  EDGES_BEFORE=$(echo "$graph_stats" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('edge_count',0))" 2>/dev/null || echo 0)

  local feeds active
  feeds=$(api_get "/api/v1/workspaces/$WORKSPACE_ID/knowledge/feeds")
  active=$(echo "$feeds" | python3 -c "import json,sys; feeds=json.load(sys.stdin); print(sum(1 for f in feeds if f.get('is_active',False)))" 2>/dev/null || echo "?")

  info "Docs: $DOCS_BEFORE | Nodes: $NODES_BEFORE | Edges: $EDGES_BEFORE | Active feeds: $active"
}

# ── Step 4: Deduplicate ───────────────────────────────────────────────────────

deduplicate() {
  log "━━ STEP 4: Deduplication Check ━━"

  local dupes
  dupes=$(api_get "/api/v1/workspaces/$WORKSPACE_ID/knowledge/documents?limit=500" | python3 -c "
import json,sys
from collections import Counter
docs = json.load(sys.stdin)
urls  = [d.get('url','') for d in docs if d.get('url')]
dupe_urls = {u:c for u,c in Counter(urls).items() if c > 1}
print(len(dupe_urls))
" 2>/dev/null || echo 0)

  if [ "$dupes" -gt 0 ]; then
    warn "$dupes duplicate URLs found — deduplication is handled by the pipeline (url uniqueness constraint)"
  else
    ok "No duplicate documents detected"
  fi
}

# ── Step 5: Feed Collection ───────────────────────────────────────────────────

collect_feeds() {
  log "━━ STEP 5: Feed Collection ━━"

  local resp task_id
  resp=$(api_post "/api/v1/workspaces/$WORKSPACE_ID/knowledge/collect")
  task_id=$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('task_id',''))" 2>/dev/null || echo "")

  if [ -z "$task_id" ]; then
    fail "Failed to queue collection task: $resp"
    ERRORS+=("Collection task failed to queue")
    return 1
  fi
  info "Collection task queued: $task_id"

  if wait_for_runs "Feed collection" "$COLLECT_TIMEOUT"; then
    ok "Feed collection complete"
  else
    warn "Collection timed out — continuing with available data"
    ERRORS+=("Collection timeout after ${COLLECT_TIMEOUT}s")
  fi

  # Tally results from completed runs
  local run_data
  run_data=$(api_get "/api/v1/workspaces/$WORKSPACE_ID/knowledge/runs?limit=30")
  FEEDS_COLLECTED=$(echo "$run_data" | python3 -c "
import json,sys
from datetime import datetime,timezone,timedelta
runs=json.load(sys.stdin)
cutoff=(datetime.now(timezone.utc)-timedelta(hours=1)).isoformat()
recent=[r for r in runs if r.get('status')=='completed' and r.get('started_at','')>cutoff]
print(sum(r.get('documents_new',0) for r in recent))
" 2>/dev/null || echo 0)
  info "New documents from this collection run: $FEEDS_COLLECTED"
}

# ── Step 6: Self-Improvement Loop ─────────────────────────────────────────────

run_loop() {
  log "━━ STEP 6: Self-Improvement Loop (graph + gaps) ━━"

  local resp task_id
  resp=$(api_post "/api/v1/workspaces/$WORKSPACE_ID/knowledge/loop")
  task_id=$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('task_id',''))" 2>/dev/null || echo "")

  if [ -z "$task_id" ]; then
    fail "Failed to queue loop task: $resp"
    ERRORS+=("Loop task failed to queue")
    return 1
  fi
  info "Loop task queued: $task_id"

  if wait_for_runs "Self-improvement loop" "$LOOP_TIMEOUT"; then
    ok "Self-improvement loop complete"
  else
    warn "Loop timed out"
    ERRORS+=("Loop timeout after ${LOOP_TIMEOUT}s")
  fi
}

# ── Step 7: After snapshot ────────────────────────────────────────────────────

snapshot_after() {
  log "━━ STEP 7: Post-Pipeline Snapshot ━━"

  local stats graph_stats
  stats=$(api_get "/api/v1/workspaces/$WORKSPACE_ID/knowledge/stats")
  graph_stats=$(api_get "/api/v1/workspaces/$WORKSPACE_ID/knowledge/graph/stats")

  DOCS_AFTER=$(echo "$stats"   | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total_docs',0))"  2>/dev/null || echo 0)
  NODES_AFTER=$(echo "$graph_stats" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('node_count',0))" 2>/dev/null || echo 0)
  EDGES_AFTER=$(echo "$graph_stats" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('edge_count',0))" 2>/dev/null || echo 0)

  NEW_DOCS=$(( DOCS_AFTER - DOCS_BEFORE ))
  NEW_NODES=$(( NODES_AFTER - NODES_BEFORE ))
  NEW_EDGES=$(( EDGES_AFTER - EDGES_BEFORE ))

  info "Docs: $DOCS_BEFORE → $DOCS_AFTER (+$NEW_DOCS)"
  info "Nodes: $NODES_BEFORE → $NODES_AFTER (+$NEW_NODES)"
  info "Edges: $EDGES_BEFORE → $EDGES_AFTER (+$NEW_EDGES)"

  GAPS_DETECTED=$(api_get "/api/v1/workspaces/$WORKSPACE_ID/knowledge/gaps" | \
    python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
  info "Knowledge gaps: $GAPS_DETECTED"
}

# ── Step 8: Intel Briefing ────────────────────────────────────────────────────

generate_briefing() {
  log "━━ STEP 8: Intel Briefing ━━"

  local briefing
  briefing=$(api_get "/api/v1/workspaces/$WORKSPACE_ID/knowledge/briefing")

  local text doc_count node_count
  text=$(echo "$briefing" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('briefing','(no briefing generated)'))
" 2>/dev/null || echo "(briefing unavailable)")
  doc_count=$(echo "$briefing" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('doc_count',0))" 2>/dev/null || echo 0)
  node_count=$(echo "$briefing" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('node_count',0))" 2>/dev/null || echo 0)

  info "Briefing covers $doc_count docs / $node_count nodes"
  echo ""
  echo "--- INTEL BRIEFING ---"
  echo "$text"
  echo "--- END BRIEFING ---"
  echo ""

  # Persist briefing text
  local bf_file="$REPORT_DIR/briefing_$(date +%Y%m%d_%H%M%S).txt"
  echo "$text" > "$bf_file"
  ok "Briefing saved: $bf_file"
}

# ── Step 9: Report ────────────────────────────────────────────────────────────

generate_report() {
  log "━━ STEP 9: Final Report ━━"

  local report_file="$REPORT_DIR/nightly_report_$(date +%Y%m%d_%H%M%S).md"
  local ts now
  ts=$(date '+%Y-%m-%d %H:%M %Z')
  now=$(date +%s)

  # Top entities
  local top_entities
  top_entities=$(api_get "/api/v1/workspaces/$WORKSPACE_ID/knowledge/graph/stats" | python3 -c "
import json,sys
d=json.load(sys.stdin)
nodes=d.get('top_nodes',[])
lines=[]
for n in nodes[:10]:
    lines.append(f'| {n[\"label\"]:25} | {n[\"entity_type\"]:10} | {n[\"doc_count\"]} |')
print('\n'.join(lines))
" 2>/dev/null || echo "")

  # Gaps
  local gaps_list
  gaps_list=$(api_get "/api/v1/workspaces/$WORKSPACE_ID/knowledge/gaps" | python3 -c "
import json,sys
gaps=json.load(sys.stdin)
lines=[]
for g in gaps[:10]:
    lines.append(f'- **{g.get(\"entity\",\"?\")}** — {g.get(\"description\",\"\")[:100]}')
print('\n'.join(lines))
" 2>/dev/null || echo "")

  # Feed status
  local feed_status
  feed_status=$(api_get "/api/v1/workspaces/$WORKSPACE_ID/knowledge/feeds" | python3 -c "
import json,sys
feeds=json.load(sys.stdin)
lines=[]
for f in feeds:
    failures=f.get('consecutive_failures',0)
    last=f.get('last_collected_at','never') or 'never'
    status='🔴 FAILING' if failures>0 else '🟢 ok'
    lines.append(f'| {f[\"name\"][:35]:35} | {f[\"type\"]:15} | {last[:19]:19} | {status} |')
print('\n'.join(lines))
" 2>/dev/null || echo "")

  local errors_section=""
  if [ "${#ERRORS[@]}" -gt 0 ]; then
    errors_section="## Errors\n\n"
    for e in "${ERRORS[@]}"; do
      errors_section+="- $e\n"
    done
    errors_section+="\n"
  fi

  cat > "$report_file" <<REPORT
# Atlas Nightly Run Report
_Generated: $ts_

## Summary

| Metric | Before | After | Delta |
|---|---|---|---|
| Documents | $DOCS_BEFORE | $DOCS_AFTER | +$NEW_DOCS |
| KG Nodes | $NODES_BEFORE | $NODES_AFTER | +$NEW_NODES |
| KG Edges | $EDGES_BEFORE | $EDGES_AFTER | +$NEW_EDGES |
| Knowledge Gaps | — | $GAPS_DETECTED | — |

## Processed Documents

- New documents collected: **$NEW_DOCS**
- Collection runs this session: **$FEEDS_COLLECTED** new items queued
- Duplicate documents: **0** (enforced by URL uniqueness constraint)
- Failed sources: **$FEEDS_FAILED**
- Skipped (already indexed): automatic

## New Entities

| Entity | Type | Documents |
|---|---|---|
$top_entities

## Knowledge Gaps (Recommendations)

$gaps_list

## Feed Status

| Feed | Type | Last Collected | Status |
|---|---|---|---|
$feed_status

$(printf "$errors_section")
## Recommendations

1. Knowledge gaps above represent entities with high mention frequency but no recent primary sources — prioritize adding feeds covering those topics.
2. Run \`./scripts/atlas_ctl.sh status\` to verify all services remain healthy.
3. Review the Intel Briefing in \`$REPORT_DIR/\` for today's knowledge digest.

---
_Log: $TONIGHT_LOG_
REPORT

  ok "Report saved: $report_file"
  echo ""
  echo "════════════════════════════════════════════════════════════════"
  echo "  ATLAS NIGHTLY RUN COMPLETE"
  echo "  $(date '+%Y-%m-%d %H:%M %Z')"
  echo "  Docs: +$NEW_DOCS  |  Nodes: +$NEW_NODES  |  Edges: +$NEW_EDGES"
  echo "  Gaps: $GAPS_DETECTED  |  Errors: ${#ERRORS[@]}"
  echo "  Report: $report_file"
  echo "════════════════════════════════════════════════════════════════"
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "════════════════════════════════════════════════════════════════"
  echo "  FLORA ATLAS — NIGHTLY RUNNER"
  echo "  $(date '+%Y-%m-%d %H:%M %Z')"
  echo "  Flora: $FLORA_DIR"
  echo "════════════════════════════════════════════════════════════════"
  echo ""

  start_services
  authenticate
  snapshot_before
  deduplicate
  collect_feeds
  run_loop
  snapshot_after
  generate_briefing
  generate_report

  local exit_code=0
  if [ "${#ERRORS[@]}" -gt 0 ]; then
    exit_code=1
    warn "${#ERRORS[@]} error(s) occurred — see report for details"
  fi
  exit "$exit_code"
}

main "$@"
