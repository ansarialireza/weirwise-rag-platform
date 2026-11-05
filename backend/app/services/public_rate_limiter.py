"""Abuse protection for the anonymous public runtime (widgets and share links).

Limits apply per client IP and per deployment so one visitor or one embedded
site cannot exhaust capacity for everyone else. Thresholds are generous enough
that ordinary widget traffic never notices. Redis shares counters across
workers when configured; the in-process fallback protects single-worker
deployments and local tests.
"""

from __future__ import annotations

from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.services.auth_rate_limiter import SlidingWindowRateLimiter
from fastapi import HTTPException, status


class PublicRateLimiter(SlidingWindowRateLimiter):
    PREFIX = "wwp:pubrl"

    @classmethod
    def _enabled(cls) -> bool:
        return settings.PUBLIC_RATE_LIMIT_ENABLED


async def enforce_public_limit(
    scope: str,
    identifier: str,
    limit: int,
    window_seconds: int,
    message: str,
) -> None:
    """Count one attempt and reject with 429 + Retry-After when over budget.

    The identifier itself is never logged: widget identifiers include client
    IPs, and only the scope is useful for operations.
    """
    decision = await PublicRateLimiter.check_and_record(scope, identifier, limit, window_seconds)
    if decision.allowed:
        return
    logger.warning(f"Public runtime rate limit reached scope={scope} retry_after={decision.retry_after}s")
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=message,
        headers={"Retry-After": str(max(1, decision.retry_after))},
    )
