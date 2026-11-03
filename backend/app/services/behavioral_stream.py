"""Redis Streams producer and buffer manager for Behavioral Intelligence."""

import json
import logging
from typing import Any, Dict, Optional

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

STREAM_KEY = "wbi:events:incoming"
DLQ_STREAM_KEY = "wbi:events:dlq"
CONSUMER_GROUP = "wbi_workers"
MAX_STREAM_LENGTH = 100_000
BACKPRESSURE_THRESHOLD = 80_000


class RedisUnavailableException(Exception):
    """Raised when Redis is unreachable or degraded."""
    pass


class IngestionBackpressureException(Exception):
    """Raised when stream backlog exceeds safety limits."""
    pass


class BehavioralStreamProducer:
    """Manages high-throughput ingestion of telemetry batches into Redis Streams."""

    @staticmethod
    async def get_redis_client():
        """Factory for async Redis connection."""
        if not settings.REDIS_URL:
            raise RedisUnavailableException("REDIS_URL is not configured.")
        try:
            from redis.asyncio import from_url
            return from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=3.0)
        except Exception as e:
            raise RedisUnavailableException(f"Failed to connect to Redis: {e!s}")

    @classmethod
    async def ensure_consumer_group(cls, redis_client) -> None:
        """Idempotently creates consumer group if it does not already exist."""
        try:
            await redis_client.xgroup_create(
                STREAM_KEY,
                CONSUMER_GROUP,
                id="0",
                mkstream=True,
            )
            logger.info(f"Created Redis consumer group '{CONSUMER_GROUP}' on '{STREAM_KEY}'.")
        except Exception as e:
            if "BUSYGROUP" in str(e):
                pass  # Group already exists
            else:
                logger.warning(f"Error initializing consumer group: {e!s}")

    @classmethod
    async def enqueue_batch(
        cls,
        redis_client,
        session_id: str,
        user_id: Optional[str],
        workspace_id: Optional[str],
        device_context: Dict[str, Any],
        geo_context: Dict[str, Any],
        events: list[Dict[str, Any]],
    ) -> int:
        """Appends events to Redis Stream with backpressure and length bounds."""
        # Check stream backlog for backpressure control
        try:
            stream_len = await redis_client.xlen(STREAM_KEY)
            if stream_len > BACKPRESSURE_THRESHOLD:
                logger.warning(f"Backpressure activated: stream length {stream_len} exceeds threshold {BACKPRESSURE_THRESHOLD}.")
                raise IngestionBackpressureException("Ingestion backlog high; please retry shortly.")
        except IngestionBackpressureException:
            raise
        except Exception as e:
            logger.warning(f"Failed to check stream length: {e!s}")

        # Construct batch envelope
        payload_records = []
        for ev in events:
            envelope = {
                "session_id": session_id,
                "user_id": user_id,
                "workspace_id": workspace_id,
                "device_context": device_context,
                "geo_context": geo_context,
                "event": ev,
            }
            payload_records.append(json.dumps(envelope))

        # Pipeline push to Redis Stream with approximate trimming (MAXLEN ~ 100k)
        async with redis_client.pipeline(transaction=True) as pipe:
            for rec in payload_records:
                pipe.xadd(
                    STREAM_KEY,
                    {"data": rec},
                    maxlen=MAX_STREAM_LENGTH,
                    approximate=True,
                )
            await pipe.execute()

        return len(payload_records)


behavioral_stream_producer = BehavioralStreamProducer()
