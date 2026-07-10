"""Performance Analyzer — detects latency and resource-usage anti-patterns."""
from __future__ import annotations

import ast
import re

from ..models import Finding
from ..scanner import ScannedFile
from .base import BaseAnalyzer

_SKIP_PATHS = ("engine/", "migrations/", "alembic/", "tests/")

# Patterns for line-level checks
_SYNC_DB_RE = re.compile(r"\bdb\.execute\s*\(|session\.query\s*\(")
_SELECT_STAR_RE = re.compile(r'select\s*\(\s*["\']?\*["\']?\s*\)')
_LIMIT_RE = re.compile(r'\.limit\s*\(')
_RESPONSE_HUGE_RE = re.compile(r'\.all\s*\(\)')


class PerformanceAnalyzer(BaseAnalyzer):
    name = "performance"

    def analyze(self, files: list[ScannedFile]) -> list[Finding]:
        results: list[Finding] = []
        for f in files:
            if f.extension == ".py" and not any(p in f.relative_path for p in _SKIP_PATHS):
                results.extend(self._analyze_file(f))
        return results

    def _analyze_file(self, f: ScannedFile) -> list[Finding]:
        findings: list[Finding] = []
        findings.extend(self._ast_checks(f))
        findings.extend(self._line_checks(f))
        return findings

    def _ast_checks(self, f: ScannedFile) -> list[Finding]:
        findings: list[Finding] = []
        try:
            tree = ast.parse(f.content, filename=f.relative_path)
        except SyntaxError:
            return findings

        for node in ast.walk(tree):
            # Detect missing .limit() before .all() in select queries
            if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
                src = ast.get_source_segment(f.content, node) or ""
                if ".all()" in src and ".limit(" not in src and "select(" in src:
                    findings.append(self._finding(
                        category="performance", severity="medium",
                        file=f.relative_path, line=node.lineno,
                        message=f"`{node.name}`: select().all() without .limit() — unbounded query risks full table scan",
                        detail="Add .limit(n) or pagination to any DB query that calls .all()",
                        discriminator=f"unbounded_query:{node.name}:{node.lineno}",
                    ))

            # Nested awaits inside list comprehension (hidden N+1)
            if isinstance(node, ast.ListComp):
                for gen in node.generators:
                    if _has_await_child(node):
                        findings.append(self._finding(
                            category="performance", severity="medium",
                            file=f.relative_path, line=node.col_offset,
                            message="await inside list comprehension — likely N+1; use asyncio.gather() or batch query",
                            discriminator=f"await_in_listcomp:{getattr(node, 'lineno', 0)}",
                        ))
                        break

            # time.sleep() in async code path (blocks the event loop)
            if isinstance(node, ast.Call):
                if _is_time_sleep(node):
                    findings.append(self._finding(
                        category="performance", severity="high",
                        file=f.relative_path, line=node.lineno,
                        message="time.sleep() blocks the asyncio event loop — use `await asyncio.sleep()` instead",
                        discriminator=f"time_sleep:{node.lineno}",
                    ))

        return findings

    def _line_checks(self, f: ScannedFile) -> list[Finding]:
        findings: list[Finding] = []
        lines = f.content.splitlines()
        for i, line in enumerate(lines, 1):
            # select("*") anti-pattern (over-fetching columns)
            if _SELECT_STAR_RE.search(line):
                findings.append(self._finding(
                    category="performance", severity="low",
                    file=f.relative_path, line=i,
                    message='select("*") fetches all columns — use select(Model) or explicit columns',
                    discriminator=f"select_star:{i}",
                ))
        return findings


def _has_await_child(node: ast.AST) -> bool:
    for child in ast.walk(node):
        if child is node:
            continue
        if isinstance(child, ast.Await):
            return True
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return False
    return False


def _is_time_sleep(node: ast.Call) -> bool:
    func = node.func
    return (
        isinstance(func, ast.Attribute)
        and func.attr == "sleep"
        and isinstance(func.value, ast.Name)
        and func.value.id == "time"
    )
