"""
Unified API response envelope for Flora OS.

Every new endpoint should return:
    { "ok": true,  "data": <payload>, "error": null, "meta": <meta|null> }
    { "ok": false, "data": null, "error": { "code": "...", "message": "..." }, "meta": null }

Existing endpoints are NOT migrated in Phase 1 — they keep their current
response shapes for backward compatibility. New routes in Phase 2+ will use
the helpers defined here.
"""
from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


# ── Error detail ──────────────────────────────────────────────────────────────

class ErrorDetail(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code: str
    message: str
    detail: Any = None


# ── Pagination meta ───────────────────────────────────────────────────────────

class PaginationMeta(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int

    @classmethod
    def of(cls, total: int, page: int, page_size: int) -> "PaginationMeta":
        pages = max(1, (total + page_size - 1) // page_size) if page_size > 0 else 1
        return cls(total=total, page=page, page_size=page_size, pages=pages)


# ── Response envelope ─────────────────────────────────────────────────────────

class ApiResponse(BaseModel, Generic[T]):
    """Standard Flora API response envelope."""

    model_config = ConfigDict(populate_by_name=True)

    ok: bool
    data: T | None = None
    error: ErrorDetail | None = None
    meta: PaginationMeta | dict[str, Any] | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def ok(
    data: Any = None,
    *,
    meta: PaginationMeta | dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a successful response dict.

    Example:
        return ok({"id": user.id, "name": user.name})
        return ok(items, meta=PaginationMeta.of(total, page, page_size))
    """
    return {
        "ok": True,
        "data": data,
        "error": None,
        "meta": meta.model_dump() if isinstance(meta, PaginationMeta) else meta,
    }


def err(
    code: str,
    message: str,
    *,
    http_status: int = 400,
    detail: Any = None,
) -> tuple[dict[str, Any], int]:
    """Build an error response (dict, http_status) tuple.

    Example:
        return err("NOT_FOUND", "Project not found", http_status=404)
    """
    return (
        {
            "ok": False,
            "data": None,
            "error": {"code": code, "message": message, "detail": detail},
            "meta": None,
        },
        http_status,
    )


def paginated(
    items: list[Any],
    total: int,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    """Build a paginated success response.

    Example:
        return paginated(projects, total=42, page=1, page_size=20)
    """
    return ok(items, meta=PaginationMeta.of(total, page, page_size))
