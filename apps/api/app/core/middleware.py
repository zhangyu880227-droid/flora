"""
ASGI middleware for Flora OS.

RequestIdMiddleware  — injects X-Request-ID header (generates UUID if absent).
RequestLoggingMiddleware — structured request/response log with timing.
"""
from __future__ import annotations

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from app.core.logging import REQUEST_ID_CTX, get_logger

log = get_logger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a unique request id to every request.

    - Reads X-Request-ID from the incoming request if present.
    - Generates a new UUID4 otherwise.
    - Sets the context variable so all loggers in the same async task see it.
    - Echoes the id in the response header.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        token = REQUEST_ID_CTX.set(request_id)
        try:
            response = await call_next(request)
            response.headers[REQUEST_ID_HEADER] = request_id
            return response
        finally:
            REQUEST_ID_CTX.reset(token)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every HTTP request and response with timing.

    Skips health check and static asset paths to reduce noise.
    """

    SKIP_PATHS = {"/api/health", "/api/docs", "/api/redoc", "/api/openapi.json"}

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in self.SKIP_PATHS:
            return await call_next(request)

        t0 = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)

        log.info(
            f"{request.method} {request.url.path} → {response.status_code} ({elapsed_ms}ms)",
            extra={
                "extra": {
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": elapsed_ms,
                }
            },
        )
        return response
