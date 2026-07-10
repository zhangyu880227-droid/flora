"""
Unified domain error hierarchy for Flora OS.

All business-layer exceptions inherit from AppError.
The global exception handler in main.py converts these
to the standard { ok, data, error, meta } envelope.
"""
from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base class for all Flora application errors.

    Attributes:
        code: Machine-readable error code (e.g. "NOT_FOUND", "FORBIDDEN").
        http_status: HTTP status code to return to the client.
        message: Human-readable description.
        detail: Optional extra context (not leaked in production).
    """

    code: str = "INTERNAL_ERROR"
    http_status: int = 500

    def __init__(
        self,
        message: str = "An unexpected error occurred",
        *,
        code: str | None = None,
        http_status: int | None = None,
        detail: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if http_status is not None:
            self.http_status = http_status
        self.detail = detail

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(code={self.code!r}, message={self.message!r})"


# ── 4xx client errors ─────────────────────────────────────────────────────────

class ValidationError(AppError):
    code = "VALIDATION_ERROR"
    http_status = 422

    def __init__(self, message: str = "Validation failed", **kwargs: Any) -> None:
        super().__init__(message, **kwargs)


class UnauthorizedError(AppError):
    code = "UNAUTHORIZED"
    http_status = 401

    def __init__(self, message: str = "Authentication required", **kwargs: Any) -> None:
        super().__init__(message, **kwargs)


class ForbiddenError(AppError):
    code = "FORBIDDEN"
    http_status = 403

    def __init__(self, message: str = "Insufficient permissions", **kwargs: Any) -> None:
        super().__init__(message, **kwargs)


class NotFoundError(AppError):
    code = "NOT_FOUND"
    http_status = 404

    def __init__(self, resource: str = "Resource", **kwargs: Any) -> None:
        super().__init__(f"{resource} not found", **kwargs)


class ConflictError(AppError):
    code = "CONFLICT"
    http_status = 409

    def __init__(self, message: str = "Resource already exists", **kwargs: Any) -> None:
        super().__init__(message, **kwargs)


class RateLimitError(AppError):
    code = "RATE_LIMITED"
    http_status = 429

    def __init__(self, message: str = "Too many requests", **kwargs: Any) -> None:
        super().__init__(message, **kwargs)


# ── 5xx server errors ─────────────────────────────────────────────────────────

class ServiceUnavailableError(AppError):
    code = "SERVICE_UNAVAILABLE"
    http_status = 503

    def __init__(self, service: str = "Service", **kwargs: Any) -> None:
        super().__init__(f"{service} is temporarily unavailable", **kwargs)


class ExternalServiceError(AppError):
    code = "EXTERNAL_SERVICE_ERROR"
    http_status = 502

    def __init__(self, service: str = "External service", **kwargs: Any) -> None:
        super().__init__(f"{service} returned an error", **kwargs)


# ── Domain-specific errors ────────────────────────────────────────────────────

class WorkspaceNotFoundError(NotFoundError):
    code = "WORKSPACE_NOT_FOUND"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__("Workspace", **kwargs)


class ProjectNotFoundError(NotFoundError):
    code = "PROJECT_NOT_FOUND"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__("Project", **kwargs)


class SourceNotFoundError(NotFoundError):
    code = "SOURCE_NOT_FOUND"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__("Source", **kwargs)


class ThreadNotFoundError(NotFoundError):
    code = "THREAD_NOT_FOUND"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__("Thread", **kwargs)


class InsightNotFoundError(NotFoundError):
    code = "INSIGHT_NOT_FOUND"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__("Insight", **kwargs)


class UserNotFoundError(NotFoundError):
    code = "USER_NOT_FOUND"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__("User", **kwargs)


class InvalidCredentialsError(UnauthorizedError):
    code = "INVALID_CREDENTIALS"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__("Invalid email or password", **kwargs)


class TokenExpiredError(UnauthorizedError):
    code = "TOKEN_EXPIRED"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__("Token has expired", **kwargs)


class IngestionError(AppError):
    code = "INGESTION_ERROR"
    http_status = 422

    def __init__(self, message: str = "Failed to ingest source", **kwargs: Any) -> None:
        super().__init__(message, **kwargs)


class EmbeddingError(AppError):
    code = "EMBEDDING_ERROR"
    http_status = 502

    def __init__(self, message: str = "Failed to generate embeddings", **kwargs: Any) -> None:
        super().__init__(message, **kwargs)


class LLMError(AppError):
    code = "LLM_ERROR"
    http_status = 502

    def __init__(self, message: str = "LLM provider error", **kwargs: Any) -> None:
        super().__init__(message, **kwargs)
