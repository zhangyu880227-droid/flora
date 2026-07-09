"""
Change log — every auto-fix the engine applies is recorded here with full reversibility.

Storage: .flora/changelog.json
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class ChangeEntry:
    id: str
    timestamp: str
    scan_id: str
    finding_id: str
    file: str
    line: int
    change_type: str       # "auto-fix" | "suggestion"
    fixer: str             # name of the fixer module
    title: str
    description: str
    before: str            # original line(s)
    after: str             # replacement line(s)
    git_commit: str        # SHA of the commit, empty if not committed
    reversible: bool       # True if a git commit was created
    status: str            # "applied" | "reverted" | "failed"


class Changelog:
    def __init__(self, flora_dir: Path, project_root: Path) -> None:
        self.path = flora_dir / "changelog.json"
        self.project_root = project_root

    def load(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            return json.loads(self.path.read_text())
        except (json.JSONDecodeError, OSError):
            return []

    def record(self, entry: ChangeEntry) -> None:
        entries = self.load()
        entries.insert(0, asdict(entry))         # newest first
        entries = entries[:200]                   # keep last 200
        self.path.write_text(json.dumps(entries, indent=2))

    def revert(self, entry_id: str) -> bool:
        """Revert a specific entry by running `git revert <commit>`."""
        entries = self.load()
        target = next((e for e in entries if e["id"] == entry_id), None)
        if not target or not target.get("git_commit"):
            return False
        result = subprocess.run(
            ["git", "revert", "--no-edit", target["git_commit"]],
            cwd=self.project_root,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            target["status"] = "reverted"
            self.path.write_text(json.dumps(entries, indent=2))
            return True
        return False

    def get_recent(self, limit: int = 20) -> list[dict]:
        return self.load()[:limit]

    def applied_finding_ids(self) -> set[str]:
        return {e["finding_id"] for e in self.load() if e.get("status") == "applied"}
