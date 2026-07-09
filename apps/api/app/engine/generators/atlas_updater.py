"""
Atlas — the engine's persistent knowledge base.

Writes two artefacts:
  .flora/atlas.json   machine-readable state (findings, metrics, learning data)
  ATLAS.md            human-readable snapshot generated from atlas.json
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..models import Finding, ScanResult, Task
from ..scanner import ScannedFile


class AtlasUpdater:
    def __init__(self, project_root: Path, flora_dir: Path) -> None:
        self.project_root = project_root
        self.flora_dir = flora_dir
        self.atlas_path = flora_dir / "atlas.json"
        self.atlas_md_path = project_root / "ATLAS.md"

    # ── public API ───────────────────────────────────────────────────────────

    def load(self) -> dict[str, Any]:
        if self.atlas_path.exists():
            try:
                return json.loads(self.atlas_path.read_text())
            except (json.JSONDecodeError, OSError):
                pass
        return _empty_atlas()

    def update(self, scan: ScanResult, files: list[ScannedFile]) -> dict[str, Any]:
        atlas = self.load()
        now = datetime.now(timezone.utc).isoformat()

        # Metadata
        atlas["last_scan"] = now
        atlas["scan_count"] = atlas.get("scan_count", 0) + 1
        atlas["last_scan_id"] = scan.scan_id

        # Metrics snapshot
        metrics: dict[str, Any] = {
            "timestamp": now,
            "scan_id": scan.scan_id,
            "files_scanned": scan.files_scanned,
            "python_files": scan.python_files,
            "typescript_files": scan.typescript_files,
            "total_lines": sum(f.lines for f in files),
            "total_findings": len(scan.findings),
            "by_severity": _count_by(scan.findings, "severity"),
            "by_category": _count_by(scan.findings, "category"),
            "duration_seconds": round(scan.duration_seconds, 2),
        }
        atlas["current_metrics"] = metrics
        history: list = atlas.setdefault("metrics_history", [])
        history.append(metrics)
        atlas["metrics_history"] = history[-60:]   # keep last 60 scans

        # Module inventory (top 50 by size)
        atlas["modules"] = sorted(
            [{"path": f.relative_path, "ext": f.extension, "lines": f.lines} for f in files],
            key=lambda m: m["lines"],
            reverse=True,
        )[:50]

        # Merge findings (resolve stale, update seen, add new)
        existing: dict[str, Any] = {f["id"]: f for f in atlas.get("findings", [])}
        current_ids = {f.id for f in scan.findings}

        for fid, rec in existing.items():
            if fid not in current_ids and not rec.get("resolved"):
                rec["resolved"] = True
                rec["resolved_at"] = now

        for f in scan.findings:
            if f.id in existing:
                existing[f.id]["last_seen"] = now
                existing[f.id]["resolved"] = False
                existing[f.id].pop("resolved_at", None)
            else:
                existing[f.id] = {
                    "id": f.id,
                    "category": f.category,
                    "severity": f.severity,
                    "file": f.file,
                    "line": f.line,
                    "message": f.message,
                    "analyzer": f.analyzer,
                    "detail": f.detail,
                    "first_seen": now,
                    "last_seen": now,
                    "resolved": False,
                }

        atlas["findings"] = list(existing.values())

        # Learning layer — resolution rates per category
        atlas["learning"] = _compute_learning(atlas["findings"])

        # Git stats
        atlas["git_stats"] = scan.git_stats

        # Persist
        self.atlas_path.write_text(json.dumps(atlas, indent=2, default=str))

        # Generate human-readable ATLAS.md
        self._write_atlas_md(atlas)

        return atlas

    def get_existing_task_ids(self) -> set[str]:
        tasks_path = self.flora_dir / "tasks.json"
        if not tasks_path.exists():
            return set()
        try:
            data = json.loads(tasks_path.read_text())
            tasks = data.get("tasks", []) if isinstance(data, dict) else data
            return {str(t.get("id", "")) for t in tasks if isinstance(t, dict)}
        except (json.JSONDecodeError, OSError):
            return set()

    def save_tasks(self, new_tasks: list[Task], active_finding_ids: set[str] | None = None) -> None:
        tasks_path = self.flora_dir / "tasks.json"

        # Load existing (preserve non-engine tasks and completed/rejected engine tasks)
        existing: list[dict] = []
        if tasks_path.exists():
            try:
                raw = json.loads(tasks_path.read_text())
                existing = raw.get("tasks", []) if isinstance(raw, dict) else raw
            except (json.JSONDecodeError, OSError):
                pass

        now = datetime.now(timezone.utc).isoformat()

        # Auto-resolve engine tasks whose underlying findings have all disappeared
        if active_finding_ids is not None:
            for task in existing:
                if (
                    str(task.get("id", "")).startswith("engine-")
                    and task.get("status") == "pending"
                    and task.get("finding_ids")
                ):
                    task_finding_ids: list[str] = task["finding_ids"]
                    if not any(fid in active_finding_ids for fid in task_finding_ids):
                        task["status"] = "auto-resolved"
                        task["updated_at"] = now

        existing_ids = {str(t.get("id")) for t in existing}

        # Only add genuinely new tasks (engine-generated, not yet tracked)
        additions = [
            {
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "category": t.category,
                "priority": t.priority,
                "score": t.score,
                "impact": t.impact,
                "effort": t.effort,
                "status": t.status,
                "files": t.files,
                "finding_ids": t.finding_ids,
                "acceptance_criteria": t.acceptance_criteria,
                "source": "engine",
                "analyzer": t.analyzer,
                "dependencies": t.dependencies,
                "created_at": t.created_at,
                "updated_at": t.updated_at,
            }
            for t in new_tasks
            if t.id not in existing_ids
        ]

        output = {
            "project": "Flora",
            "description": "Managed by Flora Self-Improvement Engine",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "tasks": existing + additions,
        }
        tasks_path.write_text(json.dumps(output, indent=2, default=str))

    # ── ATLAS.md generation ──────────────────────────────────────────────────

    def _write_atlas_md(self, atlas: dict[str, Any]) -> None:
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        scan_count = atlas.get("scan_count", 0)
        metrics = atlas.get("current_metrics", {})
        history = atlas.get("metrics_history", [])
        findings = [f for f in atlas.get("findings", []) if not f.get("resolved")]
        learning = atlas.get("learning", {})

        lines: list[str] = [
            "# Flora Atlas — Knowledge Base",
            f"_Auto-generated · {now_str} · Scan #{scan_count}_",
            "",
            "---",
            "",
            "## Codebase Snapshot",
            "",
            f"| Metric | Value |",
            f"|---|---|",
            f"| Total files scanned | {metrics.get('files_scanned', '—')} |",
            f"| Python files | {metrics.get('python_files', '—')} |",
            f"| TypeScript files | {metrics.get('typescript_files', '—')} |",
            f"| Total lines of code | {metrics.get('total_lines', 0):,} |",
            f"| Active findings | {len(findings)} |",
            f"| Completed scans | {scan_count} |",
            "",
        ]

        # Trend
        if len(history) >= 2:
            prev_count = history[-2].get("total_findings", 0)
            curr_count = history[-1].get("total_findings", 0)
            delta = curr_count - prev_count
            if delta < 0:
                trend = f"↓ {abs(delta)} resolved since last scan"
            elif delta > 0:
                trend = f"↑ {delta} new since last scan"
            else:
                trend = "→ no change since last scan"
            lines += [f"**Trend:** {trend}", ""]

        # Module inventory
        modules = atlas.get("modules", [])[:12]
        if modules:
            lines += ["## Largest Modules", "", "| File | Lines | Type |", "|---|---|---|"]
            for m in modules:
                lines.append(f"| `{m['path']}` | {m['lines']} | {m['ext']} |")
            lines.append("")

        # Active findings summary
        by_cat: dict[str, list] = {}
        for f in findings:
            by_cat.setdefault(f["category"], []).append(f)

        if by_cat:
            lines += ["## Active Findings by Category", ""]
            for cat in sorted(by_cat, key=lambda c: -len(by_cat[c])):
                count = len(by_cat[cat])
                sample = by_cat[cat][0]["message"][:80]
                lines.append(f"- **{cat.replace('_',' ').title()}** ({count}) — e.g. _{sample}_")
            lines.append("")

        # Learning summary
        if learning:
            lines += ["## Learning — Resolution Rates by Category", ""]
            lines += ["| Category | Total Seen | Resolved | Rate |", "|---|---|---|---|"]
            for cat, stats in sorted(learning.items()):
                total = stats["total"]
                resolved = stats["resolved"]
                rate = f"{stats['rate']:.0%}"
                lines.append(f"| {cat} | {total} | {resolved} | {rate} |")
            lines.append("")

        # Scan history (last 10)
        if history:
            lines += ["## Scan History (last 10)", "", "| Scan | Findings | Duration |", "|---|---|---|"]
            for entry in history[-10:][::-1]:
                sid = entry.get("scan_id", "—")
                total = entry.get("total_findings", "—")
                dur = f"{entry.get('duration_seconds', 0):.1f}s"
                lines.append(f"| {sid} | {total} | {dur} |")
            lines.append("")

        self.atlas_md_path.write_text("\n".join(lines))


# ── helpers ──────────────────────────────────────────────────────────────────

def _count_by(findings: list[Finding], attr: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for f in findings:
        key = getattr(f, attr, "unknown")
        counts[key] = counts.get(key, 0) + 1
    return counts


def _compute_learning(all_findings: list[dict]) -> dict[str, dict]:
    """Compute per-category resolution rates to guide future prioritization."""
    cats: dict[str, dict[str, int]] = {}
    for f in all_findings:
        cat = f.get("category", "unknown")
        rec = cats.setdefault(cat, {"total": 0, "resolved": 0})
        rec["total"] += 1
        if f.get("resolved"):
            rec["resolved"] += 1
    for cat, rec in cats.items():
        rec["rate"] = rec["resolved"] / rec["total"] if rec["total"] else 0.0
    return cats


def _empty_atlas() -> dict[str, Any]:
    return {
        "project": "Flora",
        "version": "1.0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_scan": None,
        "last_scan_id": None,
        "scan_count": 0,
        "current_metrics": {},
        "metrics_history": [],
        "modules": [],
        "findings": [],
        "learning": {},
        "git_stats": {},
    }
