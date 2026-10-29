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
    """Readiness probe verifying live database session and core gateway probe."""
    db_status = "connected"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {e!s}"

    core_client = CoreApiClient()
    core_probe = await core_client.check_health()
    is_ready = core_probe.get("status") in ("alive", "ok", "ready")
    core_status = "ready" if is_ready else f"unavailable ({core_probe.get('status')})"

    overall_status = "ready" if db_status == "connected" else "degraded"

    return ReadinessStatus(
        status=overall_status,
        version=settings.VERSION,
        database=db_status,
        core_gateway=core_status,
    )
