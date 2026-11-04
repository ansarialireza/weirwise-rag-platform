"""Sliding-window rate limiting for authentication endpoints.

Redis is used when ``REDIS_URL`` is configured so limits are shared across
workers and hosts. If Redis is unavailable, an in-process fallback keeps the
endpoint protected for single-worker deployments and local tests.
"""

from __future__ import annotations

import asyncio
import hashlib
import threading
import time
from dataclasses import dataclass

from backend.app.core.config import settings
from backend.app.core.logging import logger
from fastapi import HTTPException, Request, status

try:
    from redis.asyncio import Redis
except Exception:  # pragma: no cover - redis is a declared dependency
    Redis = None  # type: ignore[assignment]


_CHECK_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = 0
  if oldest[2] then
    retry = math.ceil((tonumber(oldest[2]) + window - now) / 1000)
  end
  return {0, count, retry}
end
return {1, count, 0}
"""

_RECORD_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local member = ARGV[3]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return redis.call('ZCARD', key)
"""

_CHECK_AND_RECORD_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = 0
  if oldest[2] then
    retry = math.ceil((tonumber(oldest[2]) + window - now) / 1000)
  end
  return {0, count, retry}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, count + 1, 0}
"""


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after: int = 0
    remaining: int = 0


class AuthRateLimiter:
    # One client per event loop: TestClient runs handlers in a dedicated loop
    # while unit tests may use another, and a shared client cannot cross loops.
    _redis_by_loop: dict[int, "Redis"] = {}
    _redis_retry_at: float = 0.0
    _memory: dict[str, list[float]] = {}
    _lock = threading.Lock()

    @staticmethod
    def _key(scope: str, identifier: str) -> str:
        digest = hashlib.sha256(identifier.strip().lower().encode("utf-8")).hexdigest()[:32]
        return f"wwp:authrl:{scope}:{digest}"

    @classmethod
    async def _client(cls) -> "Redis | None":
        if not settings.REDIS_URL or Redis is None:
            return None
        loop_id = id(asyncio.get_running_loop())
        existing = cls._redis_by_loop.get(loop_id)
        if existing is not None:
            return existing
        if time.monotonic() < cls._redis_retry_at:
            return None
        try:
            client = Redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
            await client.ping()
            cls._redis_by_loop[loop_id] = client
            return client
        except Exception as exc:
            cls._redis_retry_at = time.monotonic() + 30
            logger.warning(f"Auth rate limiter using in-process fallback; Redis unavailable: {type(exc).__name__}")
            return None

    @classmethod
    async def check(
        cls,
        scope: str,
        identifier: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        if not settings.AUTH_RATE_LIMIT_ENABLED or limit <= 0:
            return RateLimitDecision(allowed=True, remaining=limit)

        client = await cls._client()
        now_ms = int(time.time() * 1000)
        window_ms = int(window_seconds * 1000)

        if client is not None:
            try:
                allowed, count, retry = await client.eval(
                    _CHECK_SCRIPT,
                    1,
                    cls._key(scope, identifier),
                    now_ms,
                    window_ms,
                    limit,
                )
                return RateLimitDecision(
                    allowed=bool(int(allowed)),
                    retry_after=int(retry or 0),
                    remaining=max(0, limit - int(count)),
                )
            except Exception as exc:
                logger.warning(f"Auth rate limiter Redis check failed, using fallback: {type(exc).__name__}")
                cls._redis_by_loop.pop(id(asyncio.get_running_loop()), None)

        with cls._lock:
            entries = cls._memory.setdefault(cls._key(scope, identifier), [])
            cutoff = time.monotonic() - window_seconds
            entries[:] = [stamp for stamp in entries if stamp >= cutoff]
            if len(entries) >= limit:
                retry = max(1, int(window_seconds - (time.monotonic() - entries[0])))
                return RateLimitDecision(allowed=False, retry_after=retry, remaining=0)
            return RateLimitDecision(allowed=True, remaining=max(0, limit - len(entries)))

    @classmethod
    async def record(
        cls,
        scope: str,
        identifier: str,
        window_seconds: int,
    ) -> None:
        if not settings.AUTH_RATE_LIMIT_ENABLED:
            return

        client = await cls._client()
        now_ms = int(time.time() * 1000)
        window_ms = int(window_seconds * 1000)

        if client is not None:
            try:
                await client.eval(
                    _RECORD_SCRIPT,
                    1,
                    cls._key(scope, identifier),
                    now_ms,
                    window_ms,
                    f"{now_ms}:{time.perf_counter_ns()}",
                )
                return
            except Exception as exc:
                logger.warning(f"Auth rate limiter Redis record failed, using fallback: {type(exc).__name__}")
                cls._redis_by_loop.pop(id(asyncio.get_running_loop()), None)

        with cls._lock:
            entries = cls._memory.setdefault(cls._key(scope, identifier), [])
            cutoff = time.monotonic() - window_seconds
            entries[:] = [stamp for stamp in entries if stamp >= cutoff]
            entries.append(time.monotonic())

    @classmethod
    async def check_and_record(
        cls,
        scope: str,
        identifier: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        """Atomically enforce a limit and count the attempt.

        Prevents concurrent requests from all passing a check before any of
        them records the attempt.
        """
        if not settings.AUTH_RATE_LIMIT_ENABLED or limit <= 0:
            return RateLimitDecision(allowed=True, remaining=limit)

        client = await cls._client()
        now_ms = int(time.time() * 1000)
        window_ms = int(window_seconds * 1000)
        member = f"{now_ms}:{time.perf_counter_ns()}"

        if client is not None:
            try:
                allowed, count, retry = await client.eval(
                    _CHECK_AND_RECORD_SCRIPT,
                    1,
                    cls._key(scope, identifier),
                    now_ms,
                    window_ms,
                    limit,
                    member,
                )
                return RateLimitDecision(
                    allowed=bool(int(allowed)),
                    retry_after=int(retry or 0),
                    remaining=max(0, limit - int(count)),
                )
            except Exception as exc:
                logger.warning(
                    f"Auth rate limiter Redis check_and_record failed, using fallback: {type(exc).__name__}"
                )
                cls._redis_by_loop.pop(id(asyncio.get_running_loop()), None)

        with cls._lock:
            entries = cls._memory.setdefault(cls._key(scope, identifier), [])
            cutoff = time.monotonic() - window_seconds
            entries[:] = [stamp for stamp in entries if stamp >= cutoff]
            if len(entries) >= limit:
                retry = max(1, int(window_seconds - (time.monotonic() - entries[0])))
                return RateLimitDecision(allowed=False, retry_after=retry, remaining=0)
            entries.append(time.monotonic())
            return RateLimitDecision(allowed=True, remaining=max(0, limit - len(entries)))

    @classmethod
    async def reset(cls, scope: str, identifier: str) -> None:
        client = await cls._client()
        if client is not None:
            try:
                await client.delete(cls._key(scope, identifier))
            except Exception:
                cls._redis_by_loop.pop(id(asyncio.get_running_loop()), None)
        with cls._lock:
            cls._memory.pop(cls._key(scope, identifier), None)

    @classmethod
    async def reset_all(cls) -> None:
        """Clear counters in this process and in Redis. Used by tests."""
        with cls._lock:
            cls._memory.clear()

        client = cls._redis_by_loop.pop(id(asyncio.get_running_loop()), None)
        if client is None and settings.REDIS_URL and Redis is not None:
            try:
                client = Redis.from_url(
                    settings.REDIS_URL,
                    decode_responses=True,
                    socket_connect_timeout=1,
                    socket_timeout=1,
                )
            except Exception:
                return
        if client is None:
            return
        try:
            keys = [key async for key in client.scan_iter(match="wwp:authrl:*")]
            if keys:
                await client.delete(*keys)
        except Exception:
            pass
        finally:
            try:
                await client.aclose()
            except Exception:
                pass


def client_ip(request: Request) -> str:
    """Resolve the client address without silently trusting spoofable headers."""
    if settings.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def enforce_limit(decision: RateLimitDecision, message: str = "Too many attempts. Please try again later.") -> None:
    if not decision.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=message,
            headers={"Retry-After": str(max(1, decision.retry_after))},
        )
