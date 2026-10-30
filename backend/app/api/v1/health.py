"""Health check and readiness endpoints for Weirwise Platform."""

from backend.app.adapters.core_client import CoreApiClient
from backend.app.core.config import settings
from backend.app.db.session import get_db_session
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["Health"])


class HealthStatus(BaseModel):
    status: str
    version: str
    environment: str


class ReadinessStatus(BaseModel):
    status: str
    version: str
    database: str
    redis: str = "connected"
    core_gateway: str


@router.get("/health/live", response_model=HealthStatus, status_code=status.HTTP_200_OK)
async def liveness_check() -> HealthStatus:
    """Unauthenticated liveness probe to verify process availability."""
    return HealthStatus(
        status="alive",
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
    )


@router.get("/health/ready", response_model=ReadinessStatus, status_code=status.HTTP_200_OK)
async def readiness_check(
    db: AsyncSession = Depends(get_db_session),
) -> ReadinessStatus:
    """Readiness probe verifying live database, redis, and real core engine gateway."""
    # 1. Database check
    db_status = "connected"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {e!s}"

    # 2. Redis check
    redis_status = "not_configured"
    if settings.REDIS_URL:
        try:
            from redis.asyncio import from_url

            redis_client = from_url(settings.REDIS_URL, socket_timeout=2)
            await redis_client.ping()
            await redis_client.aclose()
            redis_status = "connected"
        except Exception as e:
            redis_status = f"unhealthy: {e!s}"

    # 3. Core Engine check
    core_client = CoreApiClient()
    core_probe = await core_client.check_health()
    is_core_ready = core_probe.get("status") in ("ready", "ok")
    if "error" in core_probe:
        core_status = f"unavailable ({core_probe['error']})"
    elif is_core_ready:
        core_status = "ready"
    else:
        core_status = f"unavailable ({core_probe.get('status', 'unreachable')})"

    is_redis_ok = redis_status in ("connected", "not_configured")
    overall_status = "ready" if (db_status == "connected" and is_redis_ok and is_core_ready) else "degraded"

    return ReadinessStatus(
        status=overall_status,
        version=settings.VERSION,
        database=db_status,
        redis=redis_status,
        core_gateway=core_status,
    )
