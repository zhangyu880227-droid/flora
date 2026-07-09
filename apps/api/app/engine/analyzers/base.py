"""Abstract base class for all analyzers."""
from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from pathlib import Path

from ..models import Finding
from ..scanner import ScannedFile


class BaseAnalyzer(ABC):
    name: str = "base"

    def __init__(self, project_root: Path) -> None:
        self.project_root = project_root

    @abstractmethod
    def analyze(self, files: list[ScannedFile]) -> list[Finding]:
        """Run analysis and return findings. Must not raise."""
        ...

    # ── helpers ──────────────────────────────────────────────────────────────

    def _fid(self, category: str, rel_path: str, discriminator: str) -> str:
        """Stable 12-char hex ID for a finding."""
        key = f"{category}:{rel_path}:{discriminator[:100]}"
        return hashlib.sha1(key.encode()).hexdigest()[:12]

    def _finding(
        self,
        *,
        category: str,
        severity: str,
        file: str,
        line: int,
        message: str,
        detail: str = "",
        discriminator: str | None = None,
    ) -> Finding:
        disc = discriminator or f"{message[:80]}:{line}"
        return Finding(
            id=self._fid(category, file, disc),
            category=category,
            severity=severity,
            file=file,
            line=line,
            message=message,
            analyzer=self.name,
            detail=detail,
        )
