"""
Engine API — serves the Self-Improvement Engine's output to the Insight Center.

Reads from .flora/*.json (pre-computed by the engine).
POST /scan triggers a synchronous scan in a thread pool.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.core.deps import CurrentUser

router = APIRouter()

# ── helpers ──────────────────────────────────────────────────────────────────

def _flora_dir() -> Path:
    """Locate the .flora/ directory relative to the project root."""
    current = Path(__file__).resolve()
    for _ in range(10):
        candidate = current / ".flora"
        if candidate.is_dir():
            return candidate
        current = current.parent
    return Path(".flora")


def _read_json(path: Path) -> Any:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def _health_score(by_severity: dict) -> int:
    score = 100
    score -= min(by_severity.get("critical", 0) * 20, 40)
    score -= min(by_severity.get("high", 0) * 10, 30)
    score -= min(by_severity.get("medium", 0) * 3, 20)
    score -= min(by_severity.get("low", 0) * 1, 10)
    return max(0, score)


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def engine_status(current_user: CurrentUser) -> JSONResponse:
    """Overview metrics: health score, finding counts, scan metadata."""
    flora = _flora_dir()
    atlas = _read_json(flora / "atlas.json") or {}
    tasks_data = _read_json(flora / "tasks.json") or {}
    tasks = tasks_data.get("tasks", []) if isinstance(tasks_data, dict) else []

    metrics = atlas.get("current_metrics", {})
    history = atlas.get("metrics_history", [])
    by_sev = metrics.get("by_severity", {})

    health = _health_score(by_sev)
    prev_health = _health_score(history[-2].get("by_severity", {})) if len(history) >= 2 else health
    delta = health - prev_health

    pending = [t for t in tasks if t.get("status") == "pending" and t.get("score", 0) > 0]
    completed = [t for t in tasks if t.get("status") in ("completed", "auto-resolved")]

    return JSONResponse({
        "last_scan": atlas.get("last_scan"),
        "scan_id": atlas.get("last_scan_id"),
        "scan_count": atlas.get("scan_count", 0),
        "health_score": health,
        "health_delta": delta,
        "files_scanned": metrics.get("files_scanned", 0),
        "python_files": metrics.get("python_files", 0),
        "typescript_files": metrics.get("typescript_files", 0),
        "total_lines": metrics.get("total_lines", 0),
        "total_findings": metrics.get("total_findings", 0),
        "by_severity": by_sev,
        "by_category": metrics.get("by_category", {}),
        "active_tasks": len(pending),
        "completed_tasks": len(completed),
        "is_running": False,
    })


@router.get("/findings")
async def engine_findings(current_user: CurrentUser) -> JSONResponse:
    """All active (unresolved) findings from the latest scan."""
    flora = _flora_dir()
    atlas = _read_json(flora / "atlas.json") or {}
    findings = [f for f in atlas.get("findings", []) if not f.get("resolved")]
    findings.sort(key=lambda f: {"critical": 0, "high": 1, "medium": 2, "low": 3}.get(f.get("severity", "low"), 4))
    return JSONResponse(findings)


@router.get("/tasks")
async def engine_tasks(current_user: CurrentUser) -> JSONResponse:
    """Ranked pending tasks."""
    flora = _flora_dir()
    data = _read_json(flora / "tasks.json") or {}
    tasks = data.get("tasks", []) if isinstance(data, dict) else []
    active = [t for t in tasks if t.get("status") == "pending" and t.get("score", 0) > 0]
    active.sort(key=lambda t: -t.get("score", 0))
    return JSONResponse(active)


@router.get("/atlas")
async def engine_atlas(current_user: CurrentUser) -> JSONResponse:
    """Atlas knowledge base: modules, learning, git stats."""
    flora = _flora_dir()
    atlas = _read_json(flora / "atlas.json") or {}
    return JSONResponse({
        "last_scan": atlas.get("last_scan"),
        "scan_count": atlas.get("scan_count", 0),
        "modules": atlas.get("modules", [])[:20],
        "learning": atlas.get("learning", {}),
        "git_stats": atlas.get("git_stats", {}),
        "opportunities": atlas.get("opportunities", []),
    })


@router.get("/history")
async def engine_history(current_user: CurrentUser) -> JSONResponse:
    """Historical metrics for trend charts."""
    flora = _flora_dir()
    atlas = _read_json(flora / "atlas.json") or {}
    history = atlas.get("metrics_history", [])
    # Return health score per scan
    enriched = []
    for entry in history:
        by_sev = entry.get("by_severity", {})
        enriched.append({
            **entry,
            "health_score": _health_score(by_sev),
        })
    return JSONResponse(enriched)


@router.get("/changelog")
async def engine_changelog(current_user: CurrentUser) -> JSONResponse:
    """Recent auto-fixes applied by the engine."""
    flora = _flora_dir()
    changelog = _read_json(flora / "changelog.json") or []
    return JSONResponse(changelog[:50])


@router.post("/scan")
async def trigger_scan(current_user: CurrentUser) -> JSONResponse:
    """Trigger a synchronous engine scan and return results."""
    def _run():
        from app.engine.core import SelfImprovementEngine
        engine = SelfImprovementEngine()
        result = engine.run()
        return {
            "scan_id": result.scan_id,
            "files_scanned": result.files_scanned,
            "findings": len(result.findings),
            "duration_seconds": round(result.duration_seconds, 2),
        }

    try:
        result = await asyncio.to_thread(_run)
        return JSONResponse(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
