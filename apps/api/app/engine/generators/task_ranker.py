"""Group findings into actionable tasks and rank them by impact score."""
from __future__ import annotations

from datetime import datetime, timezone

from ..models import Finding, Task

# Impact weights
_SEVERITY_BASE: dict[str, float] = {
    "critical": 100,
    "high":     70,
    "medium":   40,
    "low":      15,
}

_CATEGORY_MULTIPLIER: dict[str, float] = {
    "security":        1.8,
    "bug":             1.4,
    "test_coverage":   1.3,
    "performance":     1.2,
    "missing_feature": 1.1,
    "architecture":    1.0,
    "dead_code":       0.7,
    "duplication":     0.7,
    "style":           0.4,
    "todo":            0.3,
}

# Curated templates: task_key -> {title, effort, criteria}
_TEMPLATES: dict[str, dict] = {
    "bare_except": {
        "title": "Replace bare except clauses with typed exception handlers",
        "effort": "low",
        "criteria": [
            "No `except:` without a specific exception type remains",
            "All handlers either log or re-raise the caught exception",
        ],
    },
    "await_in_loop": {
        "title": "Fix N+1 query pattern — batch awaits with asyncio.gather()",
        "effort": "medium",
        "criteria": [
            "No `await` inside for loops performing DB queries",
            "Replaced with asyncio.gather() or single-query batch SELECT",
        ],
    },
    "no_tests": {
        "title": "Add test suite baseline — zero coverage is a blocker for safe iteration",
        "effort": "high",
        "criteria": [
            "pytest suite exists at apps/api/tests/",
            "Auth, hybrid search, and ingestion pipeline are covered",
            "Tests pass cleanly with `pytest`",
        ],
    },
    "missing_alembic": {
        "title": "Initialize Alembic migrations directory",
        "effort": "low",
        "criteria": [
            "alembic/ directory exists under apps/api/",
            "Initial migration generated from current ORM models",
            "`alembic upgrade head` creates the schema from scratch",
        ],
    },
    "insecure_cookie": {
        "title": "Make cookie `secure` flag environment-aware",
        "effort": "low",
        "criteria": [
            "secure=True when settings.environment == 'production'",
            "secure=False only in development and test",
        ],
    },
    "youtube_no_transcript": {
        "title": "Fix YouTube ingestion to extract transcripts, not just description",
        "effort": "medium",
        "criteria": [
            "yt-dlp subtitle download (writesubtitles=True) is used",
            "VTT/SRT content is parsed and stored as raw_text",
            "YouTube sources return meaningful chunks in search results",
        ],
    },
    "tasks_no_backend": {
        "title": "Persist Tasks to backend database — replace localStorage-only store",
        "effort": "high",
        "criteria": [
            "Task model + migration exist in apps/api/",
            "CRUD API at /api/v1/tasks",
            "Frontend Zustand store uses TanStack Query instead of localStorage",
        ],
    },
    "no_token_refresh": {
        "title": "Implement token refresh — prevent silent 30-min logouts",
        "effort": "low",
        "criteria": [
            "POST /auth/refresh endpoint validates refresh_token cookie",
            "Frontend client.ts retries on 401 before throwing ApiError",
            "Users stay logged in for the full refresh_token TTL (30 days)",
        ],
    },
    "missing_query_error_handling": {
        "title": "Add error states to useQuery hooks — prevent blank screens on API failure",
        "effort": "medium",
        "criteria": [
            "All useQuery hooks handle isError state",
            "Error UI visible to user instead of blank/loading state",
        ],
    },
    "typescript_any": {
        "title": "Eliminate TypeScript `any` types — replace with proper interfaces",
        "effort": "medium",
        "criteria": [
            "No `any` type annotations in production code",
            "Unknown shapes use `unknown` with runtime narrowing",
        ],
    },
    "console_statements": {
        "title": "Remove console statements from production code",
        "effort": "low",
        "criteria": [
            "No console.log/warn/error calls in apps/web/src/",
            "Debug output uses structured logging or is removed",
        ],
    },
}


def generate_tasks(findings: list[Finding], existing_task_ids: set[str]) -> list[Task]:
    """Group findings into tasks, score them, and return a ranked list."""
    grouped: dict[str, list[Finding]] = {}
    for f in findings:
        key = _task_key(f)
        grouped.setdefault(key, []).append(f)

    now = datetime.now(timezone.utc).isoformat()
    tasks: list[Task] = []

    for key, group in grouped.items():
        task_id = f"engine-{_short_hash(key)}"
        if task_id in existing_task_ids:
            continue

        score = _score(group)
        impact = "high" if score >= 60 else "medium" if score >= 30 else "low"
        tpl = _TEMPLATES.get(key, {})

        tasks.append(Task(
            id=task_id,
            title=tpl.get("title") or _default_title(group[0]),
            description=_description(group),
            category=group[0].category,
            priority=0,               # will be set after sorting
            score=round(score, 1),
            impact=impact,
            effort=tpl.get("effort", "medium"),
            status="pending",
            files=_unique_files(group),
            finding_ids=[f.id for f in group],
            acceptance_criteria=tpl.get("criteria", [_default_criterion(group[0])]),
            analyzer=group[0].analyzer,
            dependencies=[],
            created_at=now,
            updated_at=now,
        ))

    tasks.sort(key=lambda t: t.score, reverse=True)
    for rank, task in enumerate(tasks, 1):
        task.priority = rank

    return tasks


# ── helpers ──────────────────────────────────────────────────────────────────

def _task_key(f: Finding) -> str:
    """Map a finding to a canonical task grouping key."""
    msg = f.message.lower()
    disc = f.id

    if "bare" in msg and "except" in msg:               return "bare_except"
    if "await" in msg and "loop" in msg:                return "await_in_loop"
    if "zero test" in msg or "no test" in msg:          return "no_tests"
    if "migration" in msg and "alembic" in disc:        return "missing_alembic"
    if "secure=false" in msg or "insecure_cookie" in disc: return "insecure_cookie"
    if "youtube" in msg and "transcript" in msg:        return "youtube_no_transcript"
    if "localStorage" in f.detail or "tasks_no_backend" in disc: return "tasks_no_backend"
    if "token refresh" in msg or "no_token_refresh" in disc: return "no_token_refresh"
    if "usequery" in msg and "error" in msg:            return "missing_query_error_handling"
    if "`any`" in msg or "as any" in msg:               return "typescript_any"
    if "console." in msg:                               return "console_statements"
    if "print()" in msg:                                return "print_statements"
    if "todo" in msg.lower():                           return f"todo:{f.file[:40]}"
    if "fixme" in msg.lower():                          return f"fixme:{f.file[:40]}"
    if "high-churn" in msg or "high_churn" in disc:    return f"high_churn:{f.file[:40]}"

    return f"{f.category}:{f.file[:50]}"


def _score(group: list[Finding]) -> float:
    base = _SEVERITY_BASE.get(group[0].severity, 15)
    mult = _CATEGORY_MULTIPLIER.get(group[0].category, 1.0)
    count_bonus = min(len(group) * 3, 25)
    return base * mult + count_bonus


def _short_hash(key: str) -> str:
    import hashlib
    return hashlib.sha1(key.encode()).hexdigest()[:8]


def _default_title(f: Finding) -> str:
    return f.message[:80]


def _default_criterion(f: Finding) -> str:
    return f"No findings of type '{f.category}' remain in the affected files"


def _description(group: list[Finding]) -> str:
    count = len(group)
    files = _unique_files(group)
    locations = "; ".join(f"{f.file}:{f.line}" for f in group[:3])
    extra = f" (+{count - 3} more)" if count > 3 else ""
    return (
        f"Found {count} instance(s) across {len(files)} file(s).\n"
        f"Locations: {locations}{extra}\n"
        f"First occurrence: {group[0].message}"
    )


def _unique_files(group: list[Finding]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for f in group:
        if f.file not in seen:
            seen.add(f.file)
            out.append(f.file)
    return out
