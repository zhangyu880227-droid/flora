"""Core data models for the Self-Improvement Engine."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Finding:
    """A single issue detected by an analyzer."""

    id: str                  # stable hash: category + file + message[:80]
    category: str            # bug | security | performance | architecture | dead_code | duplication | style | test_coverage | todo
    severity: str            # critical | high | medium | low
    file: str                # path relative to project root
    line: int                # 0 if file-level
    message: str             # short human-readable description
    analyzer: str            # which analyzer produced this
    detail: str = ""         # extra context / suggested fix


@dataclass
class Task:
    """A ranked, actionable improvement task derived from findings."""

    id: str
    title: str
    description: str
    category: str
    priority: int            # 1-based rank (1 = highest)
    score: float             # composite 0-100
    impact: str              # high | medium | low
    effort: str              # low | medium | high
    status: str              # pending | in_progress | completed | rejected
    files: list[str]
    finding_ids: list[str]
    acceptance_criteria: list[str]
    analyzer: str
    dependencies: list[str]
    created_at: str
    updated_at: str


@dataclass
class ScanResult:
    """Output of one full engine scan."""

    scan_id: str
    project_root: str
    started_at: str
    completed_at: str
    duration_seconds: float
    files_scanned: int
    python_files: int
    typescript_files: int
    findings: list[Finding]
    git_stats: dict[str, Any]
    module_metrics: list[dict[str, Any]]
