"""Git history analysis — churn, hotspots, recent change learning."""
from __future__ import annotations

import subprocess
from collections import Counter
from pathlib import Path

from ..models import Finding
from ..scanner import ScannedFile
from .base import BaseAnalyzer

_GIT_TIMEOUT = 10  # seconds


class GitAnalyzer(BaseAnalyzer):
    name = "git"

    def analyze(self, files: list[ScannedFile]) -> list[Finding]:
        findings: list[Finding] = []
        try:
            findings.extend(self._check_churn())
            findings.extend(self._check_large_uncommitted(files))
        except Exception:
            pass
        return findings

    def get_recent_changes(self) -> dict:
        """Return git metadata for the Atlas learning layer."""
        try:
            return {
                "recent_commits": self._git("log", "--oneline", "-20").splitlines(),
                "changed_files_last_week": self._changed_files_since("1.week.ago"),
                "top_churn_files": self._top_churn(limit=10),
            }
        except Exception:
            return {}

    # ── private ──────────────────────────────────────────────────────────────

    def _check_churn(self) -> list[Finding]:
        """Flag files changed >8 times in the last 50 commits."""
        output = self._git("log", "--name-only", "--pretty=format:", "-n", "50")
        changed = [ln for ln in output.splitlines() if ln.strip()]
        counter = Counter(changed)
        findings = []
        for filepath, count in counter.most_common(5):
            if count >= 8:
                findings.append(self._finding(
                    category="architecture", severity="low",
                    file=filepath, line=0,
                    message=f"High-churn file — modified {count}× in last 50 commits; may indicate design instability",
                    detail="Consider whether the file's responsibilities are too broad",
                    discriminator=f"high_churn:{filepath}",
                ))
        return findings

    def _check_large_uncommitted(self, files: list[ScannedFile]) -> list[Finding]:
        """Flag very large files as architecture concern (supplement to churn)."""
        findings = []
        for f in files:
            if f.lines > 400 and f.extension in (".py", ".ts", ".tsx"):
                findings.append(self._finding(
                    category="architecture", severity="low",
                    file=f.relative_path, line=1,
                    message=f"Large file ({f.lines} lines) — potential single-responsibility violation",
                    discriminator=f"large_file:{f.relative_path}",
                ))
        return findings

    def _top_churn(self, limit: int = 10) -> list[dict]:
        output = self._git("log", "--name-only", "--pretty=format:", "-n", "100")
        changed = [ln for ln in output.splitlines() if ln.strip()]
        return [{"file": f, "changes": c} for f, c in Counter(changed).most_common(limit)]

    def _changed_files_since(self, since: str) -> list[str]:
        output = self._git("log", "--name-only", "--pretty=format:", f"--since={since}")
        return list({ln for ln in output.splitlines() if ln.strip()})

    def _git(self, *args: str) -> str:
        result = subprocess.run(
            ["git", *args],
            cwd=self.project_root,
            capture_output=True,
            text=True,
            timeout=_GIT_TIMEOUT,
        )
        return result.stdout.strip() if result.returncode == 0 else ""
