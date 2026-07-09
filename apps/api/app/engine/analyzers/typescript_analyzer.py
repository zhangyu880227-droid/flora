"""TypeScript/TSX analysis via regex patterns."""
from __future__ import annotations

import re

from ..models import Finding
from ..scanner import ScannedFile
from .base import BaseAnalyzer

# (compiled_regex, category, severity, message)
_LINE_PATTERNS: list[tuple[re.Pattern, str, str, str]] = [
    (re.compile(r":\s*any\b"),                   "architecture", "medium", "TypeScript `any` type weakens type safety"),
    (re.compile(r"\bas\s+any\b"),                "architecture", "medium", "TypeScript `as any` cast — avoids type checking"),
    (re.compile(r"console\.(log|warn|error|debug)\s*\("), "style", "low", "console statement left in production code"),
    (re.compile(r"@ts-ignore"),                  "bug",          "medium", "`@ts-ignore` suppresses type errors without fixing them"),
    (re.compile(r"@ts-nocheck"),                 "bug",          "high",   "`@ts-nocheck` disables type checking for the entire file"),
    (re.compile(r"http://localhost:\d+"),        "security",     "low",    "Hardcoded localhost URL — should use NEXT_PUBLIC_API_URL"),
    (re.compile(r"//\s*TODO\b", re.I),           "todo",         "low",    "TODO comment — untracked work"),
    (re.compile(r"//\s*FIXME\b", re.I),          "bug",          "medium", "FIXME comment — known defect"),
    (re.compile(r"//\s*HACK\b", re.I),           "architecture", "medium", "HACK comment — technical debt"),
]

# Patterns that should ONLY match on non-comment lines
_CODE_ONLY: frozenset[int] = frozenset(range(5))  # indices 0-4 (not comment patterns)


class TypeScriptAnalyzer(BaseAnalyzer):
    name = "typescript"

    def analyze(self, files: list[ScannedFile]) -> list[Finding]:
        results: list[Finding] = []
        for f in files:
            if f.extension in (".ts", ".tsx"):
                results.extend(self._analyze_file(f))
        return results

    def _analyze_file(self, f: ScannedFile) -> list[Finding]:
        findings: list[Finding] = []

        # Large file
        if f.lines > 350:
            findings.append(self._finding(
                category="architecture", severity="low",
                file=f.relative_path, line=1,
                message=f"File is {f.lines} lines — consider splitting into smaller components",
                discriminator="file_too_large",
            ))

        seen_per_pattern: set[int] = set()  # track which pattern already fired (one per file for noisy patterns)

        for lineno, raw in enumerate(f.content.splitlines(), 1):
            stripped = raw.strip()
            is_comment = stripped.startswith("//") or stripped.startswith("*")

            for idx, (pattern, cat, sev, msg) in enumerate(_LINE_PATTERNS):
                # Code-only patterns shouldn't fire on comment lines
                if is_comment and idx in _CODE_ONLY:
                    continue
                if not pattern.search(raw):
                    continue

                # Deduplicate noisy findings (console, any) — one per file
                if idx in (0, 1, 2) and idx in seen_per_pattern:
                    continue

                findings.append(self._finding(
                    category=cat, severity=sev,
                    file=f.relative_path, line=lineno,
                    message=msg, detail=stripped[:120],
                    discriminator=f"{idx}:{lineno}",
                ))
                seen_per_pattern.add(idx)
                break  # one finding per line (first match wins)

        # File-level: useQuery without error handling
        if "useQuery" in f.content:
            query_count = f.content.count("useQuery(")
            has_error = "isError" in f.content or re.search(r"\berror\b", f.content)
            if query_count > 0 and not has_error:
                findings.append(self._finding(
                    category="bug", severity="medium",
                    file=f.relative_path, line=1,
                    message=f"{query_count} useQuery hook(s) with no error handling — users see blank screen on API failure",
                    discriminator="missing_query_error_handling",
                ))

        return findings
