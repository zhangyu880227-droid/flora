"""Python static analysis via AST + regex."""
from __future__ import annotations

import ast
import re

from ..models import Finding
from ..scanner import ScannedFile
from .base import BaseAnalyzer

_COMMENT_PATTERNS = [
    (re.compile(r"\bTODO\b", re.I),  "todo",         "low",    "TODO comment — untracked work"),
    (re.compile(r"\bFIXME\b", re.I), "bug",          "medium", "FIXME comment — known defect"),
    (re.compile(r"\bHACK\b",  re.I), "architecture", "medium", "HACK comment — intentional technical debt"),
    (re.compile(r"\bXXX\b",   re.I), "bug",          "medium", "XXX comment — needs urgent attention"),
]

_PRINT_RE = re.compile(r"^\s*print\s*\(")


class PythonAnalyzer(BaseAnalyzer):
    name = "python"

    def analyze(self, files: list[ScannedFile]) -> list[Finding]:
        results: list[Finding] = []
        for f in files:
            if f.extension == ".py":
                results.extend(self._analyze_file(f))
        return results

    # ── file-level ──────────────────────────────────────────────────────────

    # Paths the engine should not analyse (would produce self-referential noise)
    _SKIP_PATHS = ("engine/", "migrations/", "alembic/")

    def _analyze_file(self, f: ScannedFile) -> list[Finding]:
        # Skip the engine's own code and auto-generated migration files
        if any(p in f.relative_path for p in self._SKIP_PATHS):
            return []

        findings: list[Finding] = []

        # File too large
        if f.lines > 500:
            findings.append(self._finding(
                category="architecture", severity="low",
                file=f.relative_path, line=1,
                message=f"File is {f.lines} lines — consider splitting into focused modules",
                discriminator="file_too_large",
            ))

        # Comment + print() checks (line-by-line, no parse needed)
        findings.extend(self._scan_lines(f))

        # AST analysis
        try:
            tree = ast.parse(f.content, filename=f.relative_path)
            findings.extend(self._ast_checks(f, tree))
        except SyntaxError:
            pass

        return findings

    # ── line scanning ────────────────────────────────────────────────────────

    def _scan_lines(self, f: ScannedFile) -> list[Finding]:
        findings: list[Finding] = []
        for lineno, raw in enumerate(f.content.splitlines(), 1):
            stripped = raw.strip()

            # Comment-only checks
            if stripped.startswith("#"):
                for pattern, cat, sev, msg in _COMMENT_PATTERNS:
                    if pattern.search(stripped):
                        findings.append(self._finding(
                            category=cat, severity=sev,
                            file=f.relative_path, line=lineno,
                            message=msg, detail=stripped[:120],
                            discriminator=f"{cat}:{lineno}",
                        ))

            # print() in non-comment, non-test, non-CLI code
            elif _PRINT_RE.match(raw) and "test" not in f.relative_path and "cli.py" not in f.relative_path:
                findings.append(self._finding(
                    category="style", severity="low",
                    file=f.relative_path, line=lineno,
                    message="print() statement left in production code",
                    detail=stripped[:100],
                    discriminator=f"print:{lineno}",
                ))

        return findings

    # ── AST checks ──────────────────────────────────────────────────────────

    def _ast_checks(self, f: ScannedFile, tree: ast.AST) -> list[Finding]:
        findings: list[Finding] = []

        for node in ast.walk(tree):

            # 1. Bare except:
            if isinstance(node, ast.ExceptHandler) and node.type is None:
                findings.append(self._finding(
                    category="bug", severity="high",
                    file=f.relative_path, line=node.lineno,
                    message="Bare `except:` silently swallows all exceptions including KeyboardInterrupt",
                    detail="Replace with `except Exception as e:` or a specific exception type",
                    discriminator=f"bare_except:{node.lineno}",
                ))

            # 2. Long functions (>60 lines)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                end = getattr(node, "end_lineno", node.lineno)
                length = end - node.lineno
                if length > 60:
                    findings.append(self._finding(
                        category="architecture", severity="low",
                        file=f.relative_path, line=node.lineno,
                        message=f"Function `{node.name}` is {length} lines — aim for ≤60 lines per function",
                        discriminator=f"long_fn:{node.name}",
                    ))

            # 3. await inside for loop (N+1 pattern)
            elif isinstance(node, (ast.For, ast.AsyncFor)):
                if _has_await_child(node):
                    findings.append(self._finding(
                        category="performance", severity="medium",
                        file=f.relative_path, line=node.lineno,
                        message="await inside for loop — likely N+1 query; consider asyncio.gather() or batch SELECT",
                        discriminator=f"await_in_loop:{node.lineno}",
                    ))

            # 4. asyncio.run() outside of designated task/migration files
            elif isinstance(node, ast.Call) and _is_asyncio_run(node):
                safe = ("task" in f.relative_path.lower() or "__main__" in f.relative_path
                        or "migration" in f.relative_path or "env.py" in f.relative_path)
                if not safe:
                    findings.append(self._finding(
                        category="bug", severity="medium",
                        file=f.relative_path, line=node.lineno,
                        message="asyncio.run() inside an async codebase can cause 'event loop already running' errors",
                        discriminator=f"asyncio_run:{node.lineno}",
                    ))

        return findings


# ── helpers ──────────────────────────────────────────────────────────────────

def _has_await_child(loop_node: ast.AST) -> bool:
    """Return True if any Await node is a direct or nested child of loop_node."""
    for child in ast.walk(loop_node):
        if child is loop_node:
            continue
        if isinstance(child, ast.Await):
            return True
        # Don't descend into nested function/class definitions
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            return False
    return False


def _is_asyncio_run(node: ast.Call) -> bool:
    func = node.func
    return (
        isinstance(func, ast.Attribute)
        and func.attr == "run"
        and isinstance(func.value, ast.Name)
        and func.value.id == "asyncio"
    )
