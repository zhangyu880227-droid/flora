"""Traverse the project and return structured file objects."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

IGNORE_DIRS: frozenset[str] = frozenset({
    "node_modules", ".next", "__pycache__", ".venv", "venv",
    "dist", "build", ".git", ".turbo", ".pytest_cache",
    "coverage", ".mypy_cache", "site-packages", ".cache",
})

SOURCE_EXTENSIONS: frozenset[str] = frozenset({".py", ".ts", ".tsx"})


@dataclass
class ScannedFile:
    path: Path
    relative_path: str       # relative to project root
    extension: str
    lines: int
    content: str


class FileScanner:
    def __init__(self, root: Path) -> None:
        self.root = root

    def scan(self, extensions: frozenset[str] | None = None) -> list[ScannedFile]:
        exts = extensions or SOURCE_EXTENSIONS
        results: list[ScannedFile] = []

        for path in self._walk(exts):
            try:
                content = path.read_text(encoding="utf-8", errors="replace")
            except (OSError, PermissionError):
                continue
            results.append(
                ScannedFile(
                    path=path,
                    relative_path=str(path.relative_to(self.root)),
                    extension=path.suffix,
                    lines=content.count("\n") + 1,
                    content=content,
                )
            )

        return results

    def _walk(self, exts: frozenset[str]):
        for root_str, dirs, files in os.walk(self.root):
            # Prune ignored dirs in-place so os.walk doesn't descend into them
            dirs[:] = [
                d for d in dirs
                if d not in IGNORE_DIRS and not d.startswith(".")
            ]
            root_path = Path(root_str)
            for filename in files:
                if Path(filename).suffix in exts:
                    yield root_path / filename
