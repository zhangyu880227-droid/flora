from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.errors import AppError
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestIdMiddleware, RequestLoggingMiddleware
from app.api.v1.router import api_router

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    configure_logging(environment=settings.environment, level=settings.log_level)
    log.info("Flora OS API starting — env=%s", settings.environment)
    yield
    log.info("Flora OS API shutting down")


app = FastAPI(
    title="Flora OS API",
    version="0.2.0",
    docs_url="/api/docs" if settings.environment != "production" else None,
    redoc_url="/api/redoc" if settings.environment != "production" else None,
    openapi_url="/api/openapi.json" if settings.environment != "production" else None,
    lifespan=lifespan,
)

# ── Middleware (order matters: outermost first) ────────────────────────────────
# RequestId must wrap RequestLogging so the log lines already carry the id.
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global exception handlers ─────────────────────────────────────────────────

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Convert domain AppError → standard { ok, data, error, meta } envelope."""
    log.warning(
        "AppError %s: %s",
        exc.code,
        exc.message,
        extra={"extra": {"code": exc.code, "path": str(request.url.path)}},
    )
    return JSONResponse(
        status_code=exc.http_status,
        content={
            "ok": False,
            "data": None,
            "error": {"code": exc.code, "message": exc.message},
            "meta": None,
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Keep existing HTTPException behaviour; also emit structured log for 5xx."""
    if exc.status_code >= 500:
        log.error(
            "HTTPException %s: %s",
            exc.status_code,
            exc.detail,
            extra={"extra": {"path": str(request.url.path)}},
        )
    # Return plain detail string for backward compatibility with existing routes.
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all: log with traceback, return opaque 500."""
    log.exception(
        "Unhandled exception on %s %s",
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={
            "ok": False,
            "data": None,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
            },
            "meta": None,
        },
    )


# ── Routes ─────────────────────────────────────────────────────────────────────

app.include_router(api_router, prefix="/api/v1")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
