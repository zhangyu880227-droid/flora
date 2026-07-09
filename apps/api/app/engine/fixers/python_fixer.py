"""
Python auto-fixers — high-confidence mechanical transformations only.

Each fixer has confidence >= 0.9 and produces a deterministic, reviewable diff.
"""
from __future__ import annotations

import re

from ..models import Finding
from .base_fixer import BaseFixer

# ── Cookie security fixer ────────────────────────────────────────────────────

_COOKIE_INSECURE_RE = re.compile(
    r'(COOKIE_OPTS\s*=\s*dict\([^)]*?)secure\s*=\s*False([^)]*\))',
    re.DOTALL,
)
_SETTINGS_IMPORT_RE = re.compile(r'from app\.core\.config import settings')


class CookieSecurityFixer(BaseFixer):
    name = "cookie_security"
    description = "Make the cookie `secure` flag environment-aware (True in production, False in development)"
    confidence = 0.95

    def can_fix(self, finding: Finding) -> bool:
        return (
            "insecure_cookie" in finding.id
            or ("secure=False" in finding.message and "cookie" in finding.file.lower())
        )

    def apply(self, finding: Finding, content: str) -> tuple[str, str, str]:
        if "COOKIE_OPTS" not in content:
            raise ValueError("COOKIE_OPTS not found in file")

        match = _COOKIE_INSECURE_RE.search(content)
        if not match:
            raise ValueError("Pattern not found")

        before = match.group(0)
        replacement = match.group(1) + 'secure=(settings.environment == "production")' + match.group(2)

        new_content = content[: match.start()] + replacement + content[match.end() :]

        # Ensure `settings` is imported
        if not _SETTINGS_IMPORT_RE.search(new_content):
            # Add import after the first `from app.` import line
            lines = new_content.splitlines()
            insert_at = 0
            for i, line in enumerate(lines):
                if line.startswith("from app.") or line.startswith("import "):
                    insert_at = i + 1
            lines.insert(insert_at, "from app.core.config import settings")
            new_content = "\n".join(lines) + "\n"

        return new_content, before.strip(), replacement.strip()


# ── Bare-except fixer ────────────────────────────────────────────────────────

_BARE_EXCEPT_RE = re.compile(r'^(\s*)except\s*:\s*$', re.MULTILINE)


class BareExceptFixer(BaseFixer):
    name = "bare_except"
    description = "Replace `except:` with `except Exception:` to avoid swallowing KeyboardInterrupt"
    confidence = 0.92

    def can_fix(self, finding: Finding) -> bool:
        return "bare" in finding.message.lower() and "except" in finding.message.lower()

    def apply(self, finding: Finding, content: str) -> tuple[str, str, str]:
        lines = content.splitlines()
        target_line = finding.line - 1  # 0-based
        if target_line < 0 or target_line >= len(lines):
            raise ValueError("Line out of range")

        original_line = lines[target_line]
        if not _BARE_EXCEPT_RE.match(original_line):
            raise ValueError("Line does not match bare except pattern")

        indent = len(original_line) - len(original_line.lstrip())
        fixed_line = " " * indent + "except Exception:"

        lines[target_line] = fixed_line
        return "\n".join(lines) + "\n", original_line, fixed_line


# ── Registry ─────────────────────────────────────────────────────────────────

ALL_PYTHON_FIXERS: list[type[BaseFixer]] = [
    CookieSecurityFixer,
    BareExceptFixer,
]
