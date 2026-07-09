"""Cross-cutting architecture analysis: missing tests, schema/type sync, security, etc."""
from __future__ import annotations

import re
from pathlib import Path

from ..models import Finding
from ..scanner import ScannedFile
from .base import BaseAnalyzer

_PYDANTIC_RESPONSE_RE = re.compile(r"class\s+(\w+Response)\s*\(")
_TS_EXPORT_RE = re.compile(r"export\s+(?:interface|type)\s+(\w+)\b")
_SOURCE_TYPE_RE = re.compile(r'(\w+)\s*=\s*"(\w+)"')


class ArchitectureAnalyzer(BaseAnalyzer):
    name = "architecture"

    def analyze(self, files: list[ScannedFile]) -> list[Finding]:
        findings: list[Finding] = []
        findings.extend(self._check_migrations())
        findings.extend(self._check_test_coverage(files))
        findings.extend(self._check_schema_type_sync(files))
        findings.extend(self._check_cookie_security(files))
        findings.extend(self._check_youtube_ingestion(files))
        findings.extend(self._check_task_persistence(files))
        findings.extend(self._check_token_refresh(files))
        return findings

    # ── individual checks ────────────────────────────────────────────────────

    def _check_migrations(self) -> list[Finding]:
        api_dir = self.project_root / "apps" / "api"
        has_migrations = (api_dir / "alembic").exists() or (api_dir / "migrations").exists()
        if not has_migrations:
            return [self._finding(
                category="architecture", severity="critical",
                file="apps/api", line=0,
                message="No Alembic migrations directory — schema cannot be reproduced or deployed reliably",
                detail="cd apps/api && alembic init alembic && alembic revision --autogenerate -m 'initial'",
                discriminator="missing_alembic",
            )]
        return []

    def _check_test_coverage(self, files: list[ScannedFile]) -> list[Finding]:
        test_files = {f for f in files if "test_" in f.relative_path or "_test." in f.relative_path}
        if not test_files:
            return [self._finding(
                category="test_coverage", severity="critical",
                file="apps/api/tests", line=0,
                message="Zero test coverage — no test files found in the entire project",
                detail="Start with: tests/test_auth.py, tests/test_search.py, tests/test_ingestion.py",
                discriminator="no_tests",
            )]

        # Check which API modules have no corresponding test
        api_modules = [
            f for f in files
            if f.extension == ".py"
            and "app/api/v1" in f.relative_path
            and "__init__" not in f.relative_path
        ]
        test_names = {f.path.stem.replace("test_", "") for f in test_files}
        findings = []
        for module in api_modules:
            stem = module.path.stem
            if stem not in test_names:
                findings.append(self._finding(
                    category="test_coverage", severity="medium",
                    file=module.relative_path, line=0,
                    message=f"API module `{stem}` has no test file",
                    detail=f"Create apps/api/tests/test_{stem}.py",
                    discriminator=f"no_test:{stem}",
                ))
        return findings

    def _check_schema_type_sync(self, files: list[ScannedFile]) -> list[Finding]:
        """Flag Pydantic Response schemas with no matching TypeScript type."""
        pydantic_schemas: set[str] = set()
        for f in files:
            if f.extension == ".py" and "schemas" in f.relative_path:
                for m in _PYDANTIC_RESPONSE_RE.finditer(f.content):
                    pydantic_schemas.add(m.group(1))

        ts_types: set[str] = set()
        for f in files:
            if f.extension == ".ts" and "packages/types" in f.relative_path:
                for m in _TS_EXPORT_RE.finditer(f.content):
                    ts_types.add(m.group(1))

        findings = []
        for schema in sorted(pydantic_schemas):
            base = schema.replace("Response", "")
            if base not in ts_types and schema not in ts_types:
                findings.append(self._finding(
                    category="architecture", severity="medium",
                    file="packages/types/src", line=0,
                    message=f"Pydantic `{schema}` has no matching TypeScript type in packages/types",
                    detail=f"Add `export interface {base} {{...}}` to the appropriate file in packages/types/src/",
                    discriminator=f"missing_ts_type:{schema}",
                ))
        return findings

    def _check_cookie_security(self, files: list[ScannedFile]) -> list[Finding]:
        findings = []
        for f in files:
            if f.extension != ".py":
                continue
            # Skip the engine's own files (they reference the string as guidance text)
            if "engine" in f.relative_path:
                continue
            for lineno, line in enumerate(f.content.splitlines(), 1):
                stripped = line.strip()
                # Only flag actual assignment, not string literals / comments
                if "secure=False" in line and not stripped.startswith("#") and "COOKIE" in f.content:
                    findings.append(self._finding(
                        category="security", severity="high",
                        file=f.relative_path, line=lineno,
                        message="Cookie `secure=False` hardcoded — must be True in production",
                        detail="Use: secure=(settings.environment == 'production')",
                        discriminator="insecure_cookie",
                    ))
                    break
        return findings

    def _check_youtube_ingestion(self, files: list[ScannedFile]) -> list[Finding]:
        """Flag the known gap: YouTube sources only index video description, not transcripts."""
        for f in files:
            if "ingestion.py" in f.relative_path and "youtube" in f.content.lower():
                if "subtitle" not in f.content and "transcript" not in f.content and "caption" not in f.content:
                    return [self._finding(
                        category="missing_feature", severity="high",
                        file=f.relative_path, line=0,
                        message="YouTube ingestion indexes video description only — transcripts/subtitles are not extracted",
                        detail="Use yt-dlp subtitle download (writesubtitles=True) and parse the VTT/SRT file for actual content",
                        discriminator="youtube_no_transcript",
                    )]
        return []

    def _check_task_persistence(self, files: list[ScannedFile]) -> list[Finding]:
        """Flag Tasks being frontend-only (localStorage, no backend)."""
        has_tasks_route = any(
            "tasks" in f.relative_path and "api" in f.relative_path and f.extension == ".py"
            for f in files
        )
        has_tasks_model = any(
            "task" in f.relative_path.lower() and "models" in f.relative_path and f.extension == ".py"
            for f in files
        )
        if not has_tasks_route or not has_tasks_model:
            return [self._finding(
                category="missing_feature", severity="high",
                file="apps/api/app/api/v1", line=0,
                message="Tasks are stored in browser localStorage only — lost on device change, not collaborative",
                detail="Add: models/task.py, schemas/task.py, api/v1/tasks.py, Alembic migration",
                discriminator="tasks_no_backend",
            )]
        return []

    def _check_token_refresh(self, files: list[ScannedFile]) -> list[Finding]:
        """Flag missing token refresh endpoint."""
        has_refresh = any(
            "refresh" in f.content and "auth" in f.relative_path and f.extension == ".py"
            for f in files
        )
        if not has_refresh:
            return [self._finding(
                category="bug", severity="high",
                file="apps/api/app/api/v1/auth.py", line=0,
                message="No token refresh endpoint — users are silently logged out after 30 minutes",
                detail="Add POST /auth/refresh that validates refresh_token cookie and issues a new access_token",
                discriminator="no_token_refresh",
            )]
        return []
