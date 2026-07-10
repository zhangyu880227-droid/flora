"""
Cache abstraction for Flora OS.

CacheBackend — abstract interface.
MemoryCacheBackend — in-process dict (default for dev/test).
RedisCacheBackend — Redis-backed (activated when CACHE_BACKEND=redis).

flora-redis-1 container is already running; the Redis backend
is wired but left as a lightweight wrapper to avoid adding aioredis
as a hard dependency in Phase 1.  Activate via settings.cache_backend = "redis".
"""
from __future__ import annotations

import asyncio
import time
from abc import ABC, abstractmethod
from typing import Any

from app.core.logging import get_logger

log = get_logger(__name__)


# ── Abstract interface ────────────────────────────────────────────────────────

class CacheBackend(ABC):
    @abstractmethod
    async def get(self, key: str) -> Any | None: ...

    @abstractmethod
    async def set(self, key: str, value: Any, ttl: int | None = None) -> None: ...

    @abstractmethod
    async def delete(self, key: str) -> None: ...

    @abstractmethod
    async def exists(self, key: str) -> bool: ...

    @abstractmethod
    async def clear(self, prefix: str | None = None) -> int:
        """Delete all keys matching prefix (or all keys if prefix is None).
        Returns number of keys deleted.
        """
        ...


# ── Memory implementation ─────────────────────────────────────────────────────

class _Entry:
    __slots__ = ("value", "expires_at")

    def __init__(self, value: Any, expires_at: float | None) -> None:
        self.value = value
        self.expires_at = expires_at

    def is_expired(self) -> bool:
        return self.expires_at is not None and time.monotonic() > self.expires_at


class MemoryCacheBackend(CacheBackend):
    """Thread-safe in-process cache backed by a plain dict.

    Suitable for single-process dev/test.  Not shared across workers.
    """

    def __init__(self) -> None:
        self._store: dict[str, _Entry] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Any | None:
        async with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            if entry.is_expired():
                del self._store[key]
                return None
            return entry.value

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        expires_at = time.monotonic() + ttl if ttl is not None else None
        async with self._lock:
            self._store[key] = _Entry(value, expires_at)

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._store.pop(key, None)

    async def exists(self, key: str) -> bool:
        return await self.get(key) is not None

    async def clear(self, prefix: str | None = None) -> int:
        async with self._lock:
            if prefix is None:
                count = len(self._store)
                self._store.clear()
                return count
            keys = [k for k in self._store if k.startswith(prefix)]
            for k in keys:
                del self._store[k]
            return len(keys)

    def __len__(self) -> int:
        return len(self._store)


# ── Redis stub (Phase 1 — wired, not activated by default) ───────────────────

class RedisCacheBackend(CacheBackend):
    """Redis-backed cache.  Requires `redis[asyncio]` package.

    Activated when settings.cache_backend == "redis".
    In Phase 1 this class exists for interface completeness;
    real usage begins when Phase 3 activates it.
    """

    def __init__(self, url: str) -> None:
        self._url = url
        self._client: Any = None

    async def _ensure_client(self) -> Any:
        if self._client is None:
            try:
                import redis.asyncio as aioredis  # type: ignore[import]
                self._client = await aioredis.from_url(self._url, decode_responses=False)
            except ImportError as exc:
                raise RuntimeError(
                    "redis[asyncio] is not installed. "
                    "Run: pip install 'redis[asyncio]' or set CACHE_BACKEND=memory"
                ) from exc
        return self._client

    async def get(self, key: str) -> Any | None:
        import pickle
        client = await self._ensure_client()
        raw = await client.get(key)
        return pickle.loads(raw) if raw is not None else None  # noqa: S301

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        import pickle
        client = await self._ensure_client()
        raw = pickle.dumps(value)
        if ttl is not None:
            await client.setex(key, ttl, raw)
        else:
            await client.set(key, raw)

    async def delete(self, key: str) -> None:
        client = await self._ensure_client()
        await client.delete(key)

    async def exists(self, key: str) -> bool:
        client = await self._ensure_client()
        return bool(await client.exists(key))

    async def clear(self, prefix: str | None = None) -> int:
        client = await self._ensure_client()
        if prefix is None:
            await client.flushdb()
            return -1  # count unknown without DBSIZE
        keys = await client.keys(f"{prefix}*")
        if keys:
            await client.delete(*keys)
        return len(keys)


# ── Singleton factory ─────────────────────────────────────────────────────────

_cache: CacheBackend | None = None


def get_cache() -> CacheBackend:
    """Return the process-wide cache backend singleton.

    Backend is selected by settings.cache_backend:
      "memory" (default) → MemoryCacheBackend
      "redis"            → RedisCacheBackend (requires redis[asyncio])
    """
    global _cache
    if _cache is None:
        _cache = _create_cache()
    return _cache


def _create_cache() -> CacheBackend:
    from app.core.config import settings
    backend = getattr(settings, "cache_backend", "memory")
    if backend == "redis":
        log.info("Cache: Redis backend at %s", settings.redis_url)
        return RedisCacheBackend(settings.redis_url)
    log.info("Cache: in-memory backend")
    return MemoryCacheBackend()


def reset_cache() -> None:
    """Reset the singleton (for tests)."""
    global _cache
    _cache = None
