"""FastAPI router for Weirwise Behavioral Intelligence (WBI) event ingestion."""

import logging
from datetime import UTC, datetime
from typing import Optional

from backend.app.api.dependencies import get_optional_current_user
from backend.app.models.auth import User
from backend.app.schemas.behavioral import (
    BehavioralBatchIngestionRequest,
    IngestionResponse,
)
from backend.app.services.behavioral_stream import (
    IngestionBackpressureException,
    RedisUnavailableException,
    behavioral_stream_producer,
)
from backend.app.services.geoip import geoip_service
from fastapi import APIRouter, Depends, HTTPException, Request, status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telemetry", tags=["Behavioral Intelligence"])


@router.post(
    "/events:batch",
    response_model=IngestionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Batch Ingest Behavioral Telemetry Events",
    description="Asynchronously streams atomic interaction events into the reliable Redis Streams pipeline.",
)
async def ingest_behavioral_batch(
    payload: BehavioralBatchIngestionRequest,
    request: Request,
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Asynchronous batch ingestion endpoint:
    - Enforces ownership: User ID derived strictly from authenticated session token, never client-assigned.
    - Resolves geographic context (country/timezone) without storing raw client IP.
    - Emits batch envelope to Redis Stream 'wbi:events:incoming' with backpressure protection.
    - Responds immediately with HTTP 202 Accepted.
    """
    # 1. Enforce verified ownership
    user_id = str(current_user.id) if current_user else None

    # 2. Extract and resolve privacy-preserving geographic context
    client_ip = request.client.host if request.client else None
    cf_country = request.headers.get("CF-IPCountry")
    client_tz = payload.geographic_context.timezone if payload.geographic_context else None

    geo_context = geoip_service.resolve_geo_context(
        client_ip=client_ip,
        cf_country=cf_country,
        client_tz=client_tz,
    )
    # Merge client hints if country was validated in schema
    if payload.geographic_context and payload.geographic_context.country_code:
        if not geo_context.get("country_code"):
            geo_context["country_code"] = payload.geographic_context.country_code
            geo_context["country_name"] = payload.geographic_context.country_name

    # 3. Normalize device context
    device_context = payload.device_context.model_dump() if payload.device_context else {}

    # 4. Serialize event items for stream payload
    event_dicts = [ev.model_dump(mode="json") for ev in payload.events]

    # 5. Push to Redis Stream
    try:
        redis_client = await behavioral_stream_producer.get_redis_client()
        queued_count = await behavioral_stream_producer.enqueue_batch(
            redis_client=redis_client,
            session_id=payload.session_id,
            user_id=user_id,
            workspace_id=str(payload.workspace_id) if payload.workspace_id else None,
            device_context=device_context,
            geo_context=geo_context,
            events=event_dicts,
        )
        await redis_client.aclose()
    except IngestionBackpressureException as e:
        logger.warning(f"Backpressure error on ingestion: {e!s}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Telemetry ingestion queue is experiencing high load; please retry shortly.",
        )
    except RedisUnavailableException as e:
        logger.error(f"Redis pipeline unavailable during telemetry ingestion: {e!s}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telemetry ingestion buffer temporarily unavailable.",
        )
    except Exception as e:
        logger.exception(f"Unexpected error enqueuing behavioral batch: {e!s}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal telemetry ingestion error.",
        )

    return IngestionResponse(
        status="accepted",
        session_id=payload.session_id,
        events_queued=queued_count,
        ingested_at=datetime.now(UTC),
    )
