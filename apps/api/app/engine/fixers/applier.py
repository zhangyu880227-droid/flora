"""
FixApplier — orchestrates all registered fixers against the current findings.

Only runs fixers with confidence >= AUTO_THRESHOLD automatically.
Lower-confidence fixers are logged as suggestions only.
"""
from __future__ import annotations

import logging
from pathlib import Path

from ..changelog import ChangeEntry, Changelog
from ..models import Finding
from .base_fixer import BaseFixer
from .python_fixer import ALL_PYTHON_FIXERS

logger = logging.getLogger(__name__)

AUTO_THRESHOLD = 0.90   # only auto-apply fixes above this confidence


class FixApplier:
    def __init__(self, project_root: Path, flora_dir: Path) -> None:
        self.project_root = project_root
        self.changelog = Changelog(flora_dir, project_root)
        self._fixers: list[BaseFixer] = [
            cls(project_root, self.changelog)
            for cls in ALL_PYTHON_FIXERS
        ]

    def register(self, fixer: BaseFixer) -> None:
        """Extensibility hook — add a custom fixer at runtime."""
        self._fixers.append(fixer)

    def run(
        self,
        findings: list[Finding],
        scan_id: str,
        dry_run: bool = False,
    ) -> list[ChangeEntry]:
        """
        Attempt to auto-fix findings.
        Returns a list of successfully applied (or dry-run) change entries.
        """
        already_fixed = self.changelog.applied_finding_ids()
        applied: list[ChangeEntry] = []

        for finding in findings:
            if finding.id in already_fixed:
                continue  # don't re-fix already-fixed issues

            for fixer in self._fixers:
                if fixer.confidence < AUTO_THRESHOLD:
                    continue
                if not fixer.can_fix(finding):
                    continue
                try:
                    entry = fixer.try_fix(finding, scan_id, dry_run=dry_run)
                    if entry:
                        applied.append(entry)
                        logger.info(
                            "[fixer] %s applied to %s:%d",
                            fixer.name, finding.file, finding.line,
                        )
                except Exception as exc:
                    logger.warning("[fixer] %s failed on %s: %s", fixer.name, finding.file, exc)
                break  # one fixer per finding

        return applied
