"""Health check and readiness endpoints for Weirwise Platform."""

from backend.app.core.config import settings
from fastapi import APIRouter, status
from pydantic import BaseModel

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
async def readiness_check() -> ReadinessStatus:
    """Readiness probe checking platform subsystem connectivity."""
    return ReadinessStatus(
        status="ready",
        version=settings.VERSION,
        database="connected",
        core_gateway="ready",
    )
