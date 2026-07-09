#!/usr/bin/env bash
# Flora Atlas — Control Script
# Usage: atlas_ctl.sh <start|stop|status|restart|logs>

set -euo pipefail

FLORA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$FLORA_DIR/apps/api"
VENV="$API_DIR/.venv"
LOG_DIR="$FLORA_DIR/.flora/logs"
API_URL="http://127.0.0.1:8000"
WEB_URL="http://127.0.0.1:3000"

mkdir -p "$LOG_DIR"

# Color helpers
if [ -t 1 ]; then
  GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'
else
  GREEN=''; YELLOW=''; RED=''; CYAN=''; RESET=''
fi

ok()   { echo -e "${GREEN}  ✓ $*${RESET}"; }
warn() { echo -e "${YELLOW}  ⚠ $*${RESET}"; }
fail() { echo -e "${RED}  ✗ $*${RESET}"; }
info() { echo -e "${CYAN}  $*${RESET}"; }

# ── Status ────────────────────────────────────────────────────────────────────

cmd_status() {
  echo ""
  echo "Flora Atlas — Service Status"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Redis
  if docker compose -f "$FLORA_DIR/docker-compose.yml" ps redis 2>/dev/null | grep -q "healthy"; then
    ok "Redis          healthy"
  else
    fail "Redis          not running"
  fi

  # FastAPI
  if curl -sf "$API_URL/api/health" >/dev/null 2>&1; then
    ok "FastAPI        healthy ($API_URL)"
  else
    fail "FastAPI        not running"
  fi

  # Celery
  if pgrep -f "celery.*app.tasks.celery_app" >/dev/null 2>&1; then
    local cpid
    cpid=$(pgrep -f "celery.*app.tasks.celery_app" | head -1)
    ok "Celery         running (pid $cpid)"
  else
    fail "Celery         not running"
  fi

  # Next.js
  if curl -sf "$WEB_URL" >/dev/null 2>&1; then
    ok "Next.js        accessible ($WEB_URL)"
  else
    warn "Next.js        not running"
  fi

  # launchd
  if launchctl list com.flora.atlas.nightly >/dev/null 2>&1; then
    local last_exit
    last_exit=$(launchctl list com.flora.atlas.nightly 2>/dev/null | grep LastExitStatus | awk '{print $3}' | tr -d ';')
    if [ "${last_exit:-0}" -eq 0 ]; then
      ok "launchd        scheduled (last exit: 0)"
    else
      warn "launchd        scheduled (last exit: $last_exit — check logs)"
    fi
  else
    warn "launchd        not loaded (run: atlas_ctl.sh install)"
  fi

  echo ""
  echo "Logs: $LOG_DIR/"
  echo ""
}

# ── Start ─────────────────────────────────────────────────────────────────────

cmd_start() {
  echo "Starting Flora Atlas services..."
  echo ""

  # Redis
  if ! docker compose -f "$FLORA_DIR/docker-compose.yml" ps redis 2>/dev/null | grep -q "healthy"; then
    info "Starting Redis..."
    docker compose -f "$FLORA_DIR/docker-compose.yml" up -d redis
    local tries=0
    while ! docker compose -f "$FLORA_DIR/docker-compose.yml" ps redis | grep -q "healthy"; do
      sleep 3; tries=$((tries+1))
      [ "$tries" -ge 20 ] && { fail "Redis failed to become healthy"; exit 1; }
    done
    ok "Redis started"
  else
    ok "Redis already running"
  fi

  # FastAPI
  if ! curl -sf "$API_URL/api/health" >/dev/null 2>&1; then
    info "Starting FastAPI..."
    cd "$API_DIR"
    source "$VENV/bin/activate"
    nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 >> "$LOG_DIR/uvicorn.log" 2>&1 &
    echo $! > "$LOG_DIR/uvicorn.pid"
    local tries=0
    while ! curl -sf "$API_URL/api/health" >/dev/null 2>&1; do
      sleep 2; tries=$((tries+1))
      [ "$tries" -ge 30 ] && { fail "FastAPI failed to start"; exit 1; }
    done
    ok "FastAPI started"
  else
    ok "FastAPI already running"
  fi

  # Celery worker+beat
  if ! pgrep -f "celery.*app.tasks.celery_app" >/dev/null 2>&1; then
    info "Starting Celery worker+beat..."
    cd "$API_DIR"
    source "$VENV/bin/activate"
    nohup celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2 -B \
      >> "$LOG_DIR/celery.log" 2>&1 &
    echo $! > "$LOG_DIR/celery.pid"
    sleep 4
    if pgrep -f "celery.*app.tasks.celery_app" >/dev/null 2>&1; then
      ok "Celery started"
    else
      fail "Celery failed to start — check $LOG_DIR/celery.log"; exit 1
    fi
  else
    ok "Celery already running"
  fi

  echo ""
  cmd_status
}

# ── Stop ──────────────────────────────────────────────────────────────────────

cmd_stop() {
  echo "Stopping Flora Atlas services..."
  echo ""

  # Celery
  if pgrep -f "celery.*app.tasks.celery_app" >/dev/null 2>&1; then
    pkill -TERM -f "celery.*app.tasks.celery_app" 2>/dev/null || true
    sleep 3
    pkill -KILL -f "celery.*app.tasks.celery_app" 2>/dev/null || true
    ok "Celery stopped"
  else
    warn "Celery was not running"
  fi

  # FastAPI
  if [ -f "$LOG_DIR/uvicorn.pid" ]; then
    local pid; pid=$(cat "$LOG_DIR/uvicorn.pid")
    kill "$pid" 2>/dev/null || true
    rm -f "$LOG_DIR/uvicorn.pid"
    ok "FastAPI stopped (pid $pid)"
  elif pgrep -f "uvicorn app.main:app" >/dev/null 2>&1; then
    pkill -f "uvicorn app.main:app" 2>/dev/null || true
    ok "FastAPI stopped"
  else
    warn "FastAPI was not running"
  fi

  # Leave Redis running (shared service)
  warn "Redis left running (shared Docker service — stop manually if needed)"
  echo ""
  info "Next.js must be stopped manually (pnpm dev is user-managed)"
}

# ── Restart ───────────────────────────────────────────────────────────────────

cmd_restart() {
  cmd_stop
  echo ""
  sleep 2
  cmd_start
}

# ── Install launchd ───────────────────────────────────────────────────────────

cmd_install() {
  local plist="$HOME/Library/LaunchAgents/com.flora.atlas.nightly.plist"
  local runner="$FLORA_DIR/scripts/nightly_atlas.sh"

  if [ ! -x "$runner" ]; then
    chmod +x "$runner"
  fi

  # Default: 2:30 AM every night
  local hour="${FLORA_NIGHTLY_HOUR:-2}"
  local minute="${FLORA_NIGHTLY_MINUTE:-30}"

  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.flora.atlas.nightly</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$runner</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>$hour</integer>
    <key>Minute</key>
    <integer>$minute</integer>
  </dict>

  <key>WorkingDirectory</key>
  <string>$FLORA_DIR</string>

  <key>StandardOutPath</key>
  <string>$LOG_DIR/launchd_stdout.log</string>

  <key>StandardErrorPath</key>
  <string>$LOG_DIR/launchd_stderr.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>FLORA_REPORT_DIR</key>
    <string>$FLORA_DIR/.flora/reports</string>
  </dict>

  <key>RunAtLoad</key>
  <false/>

  <key>StartInterval</key>
  <integer>0</integer>
</dict>
</plist>
PLIST

  launchctl load "$plist"
  ok "launchd service installed and loaded: com.flora.atlas.nightly"
  info "Scheduled: daily at ${hour}:$(printf '%02d' $minute)"
  info "Plist: $plist"
  info "To run now: launchctl start com.flora.atlas.nightly"
}

# ── Uninstall launchd ─────────────────────────────────────────────────────────

cmd_uninstall() {
  local plist="$HOME/Library/LaunchAgents/com.flora.atlas.nightly.plist"
  if [ -f "$plist" ]; then
    launchctl unload "$plist" 2>/dev/null || true
    rm -f "$plist"
    ok "launchd service removed"
  else
    warn "launchd service not installed"
  fi
}

# ── Logs ──────────────────────────────────────────────────────────────────────

cmd_logs() {
  local service="${1:-nightly}"
  case "$service" in
    nightly) ls -lt "$LOG_DIR"/nightly_*.log 2>/dev/null | head -5 | awk '{print $NF}' | xargs tail -100 ;;
    celery)  tail -100 "$LOG_DIR/celery.log" ;;
    api)     tail -100 "$LOG_DIR/uvicorn.log" ;;
    *)       echo "Usage: atlas_ctl.sh logs [nightly|celery|api]" ;;
  esac
}

# ── Dispatch ──────────────────────────────────────────────────────────────────

CMD="${1:-status}"
shift || true

case "$CMD" in
  start)     cmd_start ;;
  stop)      cmd_stop ;;
  restart)   cmd_restart ;;
  status)    cmd_status ;;
  install)   cmd_install ;;
  uninstall) cmd_uninstall ;;
  logs)      cmd_logs "$@" ;;
  run)
    exec "$FLORA_DIR/scripts/nightly_atlas.sh" "$@"
    ;;
  *)
    echo "Usage: atlas_ctl.sh <start|stop|restart|status|install|uninstall|run|logs>"
    exit 1
    ;;
esac
