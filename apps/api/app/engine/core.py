"""
Flora Self-Improvement Engine — main orchestrator.

Wires together: scanner → analyzers → task ranker → atlas → status report.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path

from .models import Finding, ScanResult
from .scanner import FileScanner
from .analyzers.python_analyzer import PythonAnalyzer
from .analyzers.typescript_analyzer import TypeScriptAnalyzer
from .analyzers.architecture_analyzer import ArchitectureAnalyzer
from .analyzers.git_analyzer import GitAnalyzer
from .analyzers.performance_analyzer import PerformanceAnalyzer
from .generators.task_ranker import generate_tasks
from .generators.atlas_updater import AtlasUpdater
from .generators.status_reporter import StatusReporter
from .generators.test_generator import TestGenerator
from .detectors.opportunity_detector import OpportunityDetector
from .fixers.applier import FixApplier
from .roadmap import generate_roadmap

logger = logging.getLogger(__name__)


class SelfImprovementEngine:
    """
    Scans the entire Flora project, detects problems, generates ranked tasks,
    updates Atlas knowledge, and rewrites PROJECT_STATUS.md.

    Never modifies source files — read-only analysis + documentation output only.
    """

    def __init__(self, project_root: Path | None = None) -> None:
        self.project_root = project_root or _detect_root()
        self.flora_dir = self.project_root / ".flora"
        self.flora_dir.mkdir(parents=True, exist_ok=True)

        self.scanner = FileScanner(self.project_root)
        self.analyzers = [
            PythonAnalyzer(self.project_root),
            TypeScriptAnalyzer(self.project_root),
            ArchitectureAnalyzer(self.project_root),
            GitAnalyzer(self.project_root),
            PerformanceAnalyzer(self.project_root),
        ]
        self.atlas = AtlasUpdater(self.project_root, self.flora_dir)
        self.reporter = StatusReporter(self.project_root)
        self.test_generator = TestGenerator(self.project_root)
        self.opportunity_detector = OpportunityDetector(self.project_root)
        self.fixer = FixApplier(self.project_root, self.flora_dir)

    def run(self) -> ScanResult:
        started = datetime.now(timezone.utc)
        scan_id = hashlib.sha1(started.isoformat().encode()).hexdigest()[:8]
        logger.info("[engine] scan %s started — root: %s", scan_id, self.project_root)

        # ── Step 1: scan all source files ────────────────────────────────────
        files = self.scanner.scan()
        py_files = [f for f in files if f.extension == ".py"]
        ts_files = [f for f in files if f.extension in (".ts", ".tsx")]
        logger.info("[engine] scanned %d files (%d py, %d ts)", len(files), len(py_files), len(ts_files))

        # ── Step 2: run all analyzers ─────────────────────────────────────────
        raw_findings: list[Finding] = []
        for analyzer in self.analyzers:
            try:
                found = analyzer.analyze(files)
                raw_findings.extend(found)
                logger.info("[engine] %s → %d findings", analyzer.name, len(found))
            except Exception as exc:
                logger.warning("[engine] analyzer %s failed: %s", analyzer.name, exc, exc_info=True)

        # Deduplicate by stable ID
        seen: set[str] = set()
        findings: list[Finding] = []
        for f in raw_findings:
            if f.id not in seen:
                seen.add(f.id)
                findings.append(f)

        # ── Step 3: collect git intelligence ─────────────────────────────────
        git_stats: dict = {}
        for analyzer in self.analyzers:
            if isinstance(analyzer, GitAnalyzer):
                git_stats = analyzer.get_recent_changes()
                break

        # ── Step 4: build module metrics ──────────────────────────────────────
        module_metrics = [
            {"path": f.relative_path, "ext": f.extension, "lines": f.lines}
            for f in sorted(files, key=lambda x: x.lines, reverse=True)[:30]
        ]

        completed = datetime.now(timezone.utc)
        result = ScanResult(
            scan_id=scan_id,
            project_root=str(self.project_root),
            started_at=started.isoformat(),
            completed_at=completed.isoformat(),
            duration_seconds=(completed - started).total_seconds(),
            files_scanned=len(files),
            python_files=len(py_files),
            typescript_files=len(ts_files),
            findings=findings,
            git_stats=git_stats,
            module_metrics=module_metrics,
        )

        # ── Step 4b: detect opportunities ────────────────────────────────────
        opportunities = self.opportunity_detector.detect(files)
        logger.info("[engine] %d opportunities detected", len(opportunities))

        # ── Step 5: update Atlas ──────────────────────────────────────────────
        atlas_data = self.atlas.update(result, files)
        # Persist opportunities into atlas.json
        atlas_data["opportunities"] = [
            {
                "id": o.id,
                "title": o.title,
                "description": o.description,
                "rationale": o.rationale,
                "effort": o.effort,
                "impact": o.impact,
                "phase": o.phase,
                "category": o.category,
            }
            for o in opportunities
        ]
        self.atlas.atlas_path.write_text(
            __import__("json").dumps(atlas_data, indent=2, default=str)
        )

        # ── Step 6: generate + rank tasks ─────────────────────────────────────
        existing_ids = self.atlas.get_existing_task_ids()
        tasks = generate_tasks(findings, existing_ids)
        active_fids = {f.id for f in findings}
        self.atlas.save_tasks(tasks, active_finding_ids=active_fids)
        logger.info("[engine] %d new tasks generated", len(tasks))

        # ── Step 7: rewrite PROJECT_STATUS.md ────────────────────────────────
        # Load all tasks (existing + new) for the report
        import json
        try:
            all_tasks_raw = json.loads((self.flora_dir / "tasks.json").read_text())
            all_tasks_data = all_tasks_raw.get("tasks", []) if isinstance(all_tasks_raw, dict) else all_tasks_raw
        except Exception:
            all_tasks_data = []

        from .models import Task
        all_tasks = [
            Task(
                id=str(t.get("id", "")),
                title=t.get("title", ""),
                description=t.get("description", ""),
                category=t.get("category", ""),
                priority=t.get("priority", 99),
                score=float(t.get("score", 0)),
                impact=t.get("impact", "low"),
                effort=t.get("effort", "medium"),
                status=t.get("status", "pending"),
                files=t.get("files", []),
                finding_ids=t.get("finding_ids", []),
                acceptance_criteria=t.get("acceptance_criteria", []),
                analyzer=t.get("analyzer", ""),
                dependencies=t.get("dependencies", []),
                created_at=t.get("created_at", ""),
                updated_at=t.get("updated_at", ""),
            )
            for t in all_tasks_data
            if isinstance(t, dict)
        ]

        self.reporter.generate(findings, all_tasks, atlas_data)

        # ── Step 7b: generate test skeletons for uncovered modules ───────────
        coverage_gaps = self.test_generator.coverage_gaps()
        atlas_data["coverage_gaps"] = coverage_gaps[:50]
        logger.info("[engine] %d uncovered modules detected", len(coverage_gaps))

        # ── Step 8: generate roadmap ──────────────────────────────────────────
        import json as _json
        try:
            tasks_raw = _json.loads((self.flora_dir / "tasks.json").read_text())
            tasks_list = tasks_raw.get("tasks", []) if isinstance(tasks_raw, dict) else tasks_raw
            opp_dicts = atlas_data.get("opportunities", [])
            generate_roadmap(tasks_list, opp_dicts, self.project_root)
        except Exception as exc:
            logger.warning("[engine] roadmap generation failed: %s", exc)

        logger.info(
            "[engine] scan %s complete — %d findings, %d tasks, %.1fs",
            scan_id, len(findings), len(tasks), result.duration_seconds,
        )
        return result

    def register_analyzer(self, analyzer) -> None:
        """Extensibility hook — add a custom analyzer at runtime."""
        self.analyzers.append(analyzer)


def _detect_root() -> Path:
    """Walk up from this file to find the monorepo root."""
    current = Path(__file__).resolve().parent
    for _ in range(10):
        if (current / "turbo.json").exists() or (current / "pnpm-workspace.yaml").exists():
            return current
        current = current.parent
    # Fallback: 4 levels up from engine/core.py = repo root
    return Path(__file__).resolve().parents[4]
