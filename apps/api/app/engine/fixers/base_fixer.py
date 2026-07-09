"""Abstract base class for safe auto-fixers."""
from __future__ import annotations

import hashlib
import subprocess
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path

from ..changelog import ChangeEntry, Changelog
from ..models import Finding


class BaseFixer(ABC):
    name: str = "base"
    description: str = ""
    confidence: float = 0.0   # 0-1; only fixers ≥ 0.9 run automatically

    def __init__(self, project_root: Path, changelog: Changelog) -> None:
        self.project_root = project_root
        self.changelog = changelog

    @abstractmethod
    def can_fix(self, finding: Finding) -> bool:
        """Return True if this fixer applies to this finding."""
        ...

    @abstractmethod
    def apply(self, finding: Finding, content: str) -> tuple[str, str, str]:
        """
        Return (new_content, before_snippet, after_snippet).
        Raise ValueError if the fix cannot be applied.
        """
        ...

    # ── public entry point ───────────────────────────────────────────────────

    def try_fix(self, finding: Finding, scan_id: str, dry_run: bool = False) -> ChangeEntry | None:
        """
        Apply the fix safely:
        1. Verify git is clean (bail if not)
        2. Apply the fix to the file
        3. Commit the change
        4. Record in changelog
        5. Roll back on any failure
        """
        file_path = self.project_root / finding.file
        if not file_path.exists():
            return None

        original = file_path.read_text(encoding="utf-8")

        try:
            new_content, before, after = self.apply(finding, original)
        except (ValueError, NotImplementedError):
            return None

        if new_content == original:
            return None

        entry = ChangeEntry(
            id=_entry_id(finding.id, self.name),
            timestamp=datetime.now(timezone.utc).isoformat(),
            scan_id=scan_id,
            finding_id=finding.id,
            file=finding.file,
            line=finding.line,
            change_type="auto-fix",
            fixer=self.name,
            title=f"Auto-fix: {finding.message[:60]}",
            description=self.description,
            before=before,
            after=after,
            git_commit="",
            reversible=False,
            status="failed",
        )

        if dry_run:
            entry.status = "dry-run"
            return entry

        # Check git is available and the working tree is clean for this file
        if not _git_clean(self.project_root, finding.file):
            return None

        # Write the fix
        file_path.write_text(new_content, encoding="utf-8")

        # Commit
        commit_sha = _git_commit(
            self.project_root,
            finding.file,
            f"fix(engine): {finding.message[:72]}",
        )

        if commit_sha:
            entry.git_commit = commit_sha
            entry.reversible = True
            entry.status = "applied"
        else:
            # Commit failed — restore original
            file_path.write_text(original, encoding="utf-8")
            entry.status = "failed"

        self.changelog.record(entry)
        return entry if entry.status == "applied" else None


# ── helpers ──────────────────────────────────────────────────────────────────

def _git_clean(project_root: Path, rel_path: str) -> bool:
    """Return True if the file has no uncommitted changes."""
    result = subprocess.run(
        ["git", "status", "--porcelain", rel_path],
        cwd=project_root,
        capture_output=True,
        text=True,
        timeout=10,
    )
    return result.returncode == 0 and result.stdout.strip() == ""


def _git_commit(project_root: Path, rel_path: str, message: str) -> str:
    """Stage the file and commit. Return commit SHA or empty string on failure."""
    add = subprocess.run(
        ["git", "add", rel_path],
        cwd=project_root,
        capture_output=True,
        timeout=10,
    )
    if add.returncode != 0:
        return ""
    commit = subprocess.run(
        ["git", "commit", "-m", message],
        cwd=project_root,
        capture_output=True,
        text=True,
        timeout=15,
    )
    if commit.returncode != 0:
        return ""
    # Extract SHA from "master abc1234" style output
    log = subprocess.run(
        ["git", "log", "-1", "--format=%H"],
        cwd=project_root,
        capture_output=True,
        text=True,
        timeout=10,
    )
    return log.stdout.strip()[:12] if log.returncode == 0 else ""


def _entry_id(finding_id: str, fixer_name: str) -> str:
    key = f"{finding_id}:{fixer_name}:{datetime.now(timezone.utc).isoformat()}"
    return hashlib.sha1(key.encode()).hexdigest()[:12]
