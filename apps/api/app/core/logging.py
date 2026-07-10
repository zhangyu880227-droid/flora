"""
Structured JSON logging for Flora OS.

Provides:
- get_logger(name)  — returns a logger that emits JSON lines in production,
                      and human-readable colored output in development.
- configure_logging() — called once at app startup.
- REQUEST_ID_CTX — contextvars token holding the current request id.
"""
from __future__ import annotations

import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any

# Context variable holding the current request id (set by RequestIdMiddleware).
REQUEST_ID_CTX: ContextVar[str] = ContextVar("request_id", default="-")


# ── JSON formatter ────────────────────────────────────────────────────────────

class JsonFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        log: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": REQUEST_ID_CTX.get("-"),
            "msg": record.getMessage(),
        }
        if record.exc_info:
            log["exc"] = self.formatException(record.exc_info)
        if hasattr(record, "extra"):
            log.update(record.extra)  # type: ignore[arg-type]
        return json.dumps(log, ensure_ascii=False)


# ── Dev formatter ─────────────────────────────────────────────────────────────

class DevFormatter(logging.Formatter):
    """Human-readable colored formatter for development."""

    COLORS = {
        "DEBUG": "\033[36m",     # cyan
        "INFO": "\033[32m",      # green
        "WARNING": "\033[33m",   # yellow
        "ERROR": "\033[31m",     # red
        "CRITICAL": "\033[35m",  # magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, "")
        req_id = REQUEST_ID_CTX.get("-")
        prefix = f"{color}[{record.levelname}]{self.RESET} [{req_id}] {record.name}: "
        return prefix + record.getMessage()


# ── Public API ────────────────────────────────────────────────────────────────

def configure_logging(environment: str = "development", level: str = "INFO") -> None:
    """Configure root logging. Call once at application startup."""
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove any existing handlers to avoid duplicate output.
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    if environment == "production":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(DevFormatter())

    root.addHandler(handler)

    # Suppress noisy third-party loggers.
    for noisy in ("uvicorn.access", "sqlalchemy.engine", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a module-level logger.

    Usage:
        log = get_logger(__name__)
        log.info("Project created", extra={"extra": {"project_id": str(project.id)}})
    """
    return logging.getLogger(name)
