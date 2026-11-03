"""Asynchronous background worker for consuming and persisting WBI Redis Streams."""

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional

from backend.app.core.config import settings
from backend.app.db.session import async_session_factory
from backend.app.models.behavioral import (
    BehavioralEvent,
    UserBehavioralSession,
)
from backend.app.services.behavioral_stream import (
    CONSUMER_GROUP,
    DLQ_STREAM_KEY,
    STREAM_KEY,
)
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
AUTO_CLAIM_MIN_IDLE_TIME_MS = 60_000  # 60s
BATCH_SIZE = 100
BLOCK_TIMEOUT_MS = 2000


class BehavioralStreamConsumer:
    """Worker engine processing Redis Stream batches into PostgreSQL with full idempotency."""

    def __init__(self, consumer_name: Optional[str] = None):
        self.consumer_name = consumer_name or f"worker_{uuid.uuid4().hex[:8]}"
        self._running = False

    async def run(self, max_iterations: Optional[int] = None):
        """Main consumer loop."""
        from redis.asyncio import from_url

        if not settings.REDIS_URL:
            logger.error("Cannot run BehavioralStreamConsumer: REDIS_URL not configured.")
            return

        redis = from_url(settings.REDIS_URL, decode_responses=True)
        self._running = True
        iterations = 0

        logger.info(f"Starting WBI Stream Consumer: {self.consumer_name} on {STREAM_KEY}")

        # Ensure consumer group exists
        try:
            await redis.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
        except Exception:
            pass  # Already exists

        try:
            while self._running:
                # 1. Process pending orphans (PEL recovery)
                await self._recover_orphans(redis)

                # 2. Read new messages
                try:
                    entries = await redis.xreadgroup(
                        groupname=CONSUMER_GROUP,
                        consumername=self.consumer_name,
                        streams={STREAM_KEY: ">"},
                        count=BATCH_SIZE,
                        block=BLOCK_TIMEOUT_MS,
                    )
                except Exception as e:
                    logger.warning(f"Error reading from stream: {e!s}")
                    await asyncio.sleep(1.0)
                    continue

                if entries:
                    for stream_name, messages in entries:
                        if messages:
                            await self._process_messages(redis, messages)

                iterations += 1
                if max_iterations and iterations >= max_iterations:
                    break

                await asyncio.sleep(0.01)

        finally:
            await redis.aclose()
            logger.info(f"Stopped WBI Stream Consumer: {self.consumer_name}")

    def stop(self):
        self._running = False

    async def _recover_orphans(self, redis):
        """Auto-claims messages unacknowledged for > 60 seconds."""
        try:
            res = await redis.xautoclaim(
                STREAM_KEY,
                CONSUMER_GROUP,
                self.consumer_name,
                min_idle_time=AUTO_CLAIM_MIN_IDLE_TIME_MS,
                start_id="0-0",
                count=50,
            )
            # res structure: (next_start_id, messages, [deleted_ids])
            if res and len(res) >= 2 and res[1]:
                claimed_messages = res[1]
                logger.info(f"Auto-claimed {len(claimed_messages)} orphaned messages in stream.")
                await self._process_messages(redis, claimed_messages, is_retry=True)
        except Exception as e:
            logger.warning(f"Error executing xautoclaim: {e!s}")

    async def _process_messages(self, redis, messages: List[Any], is_retry: bool = False):
        """Processes message batch, executes idempotent DB transactions, and ACKs."""
        successful_message_ids = []
        dlq_messages = []

        async with async_session_factory() as db:
            for msg_id, data in messages:
                raw_payload = data.get("data")
                if not raw_payload:
                    successful_message_ids.append(msg_id)
                    continue

                try:
                    envelope = json.loads(raw_payload)
                    await self._persist_event_envelope(db, envelope)
                    successful_message_ids.append(msg_id)
                except Exception as e:
                    logger.error(f"Failed to process message {msg_id}: {e!s}")
                    # Check retry count from PEL if retrying
                    if is_retry:
                        dlq_messages.append((msg_id, raw_payload, str(e)))
                    else:
                        # Will be retried by xautoclaim
                        pass

            # Commit all database writes atomically
            try:
                await db.commit()
            except Exception as e:
                logger.error(f"Database commit failed for batch: {e!s}")
                await db.rollback()
                return

        # Acknowledge successfully persisted messages
        if successful_message_ids:
            try:
                await redis.xack(STREAM_KEY, CONSUMER_GROUP, *successful_message_ids)
            except Exception as e:
                logger.error(f"Failed to XACK messages: {e!s}")

        # Route persistent failures to Dead-Letter Queue
        for msg_id, payload_str, err_msg in dlq_messages:
            try:
                await redis.xadd(
                    DLQ_STREAM_KEY,
                    {"original_id": msg_id, "payload": payload_str, "error": err_msg},
                )
                await redis.xack(STREAM_KEY, CONSUMER_GROUP, msg_id)
                logger.warning(f"Routed poison message {msg_id} to DLQ {DLQ_STREAM_KEY}.")
            except Exception as e:
                logger.error(f"Failed to route message {msg_id} to DLQ: {e!s}")

    async def _persist_event_envelope(self, db, envelope: Dict[str, Any]):
        """Persists session context and event using idempotent upsert/insert."""
        session_id = envelope["session_id"]
        user_id = uuid.UUID(envelope["user_id"]) if envelope.get("user_id") else None
        workspace_id = uuid.UUID(envelope["workspace_id"]) if envelope.get("workspace_id") else None
        device_ctx = envelope.get("device_context") or {}
        geo_ctx = envelope.get("geo_context") or {}
        ev = envelope["event"]

        # 1. Upsert UserBehavioralSession
        now = datetime.now(UTC)
        event_time = datetime.fromisoformat(ev["timestamp"]) if isinstance(ev["timestamp"], str) else ev["timestamp"]

        session_stmt = (
            pg_insert(UserBehavioralSession)
            .values(
                id=uuid.uuid4(),
                session_id=session_id,
                user_id=user_id,
                workspace_id=workspace_id,
                country_code=geo_ctx.get("country_code"),
                country_name=geo_ctx.get("country_name"),
                region=geo_ctx.get("region"),
                city=geo_ctx.get("city"),
                timezone=geo_ctx.get("timezone"),
                geo_lookup_source=geo_ctx.get("geo_lookup_source"),
                device_category=device_ctx.get("device_category", "unknown"),
                operating_system=device_ctx.get("operating_system"),
                os_version=device_ctx.get("os_version"),
                browser=device_ctx.get("browser"),
                browser_version=device_ctx.get("browser_version"),
                screen_width=device_ctx.get("screen_width"),
                screen_height=device_ctx.get("screen_height"),
                viewport_width=device_ctx.get("viewport_width"),
                viewport_height=device_ctx.get("viewport_height"),
                device_pixel_ratio=device_ctx.get("device_pixel_ratio"),
                user_agent_normalized=device_ctx.get("user_agent_normalized"),
                access_environment=device_ctx.get("access_environment", "web_app"),
                first_seen_at=event_time,
                last_seen_at=event_time,
                total_duration_seconds=0,
                page_view_count=1 if ev.get("category") == "navigation" else 0,
                event_count=1,
                entry_route=ev.get("route"),
                exit_route=ev.get("route"),
                completed_workflows=[],
                abandoned_workflows=[],
                friction_count=1 if ev.get("category") == "friction" else 0,
                is_bounce=False,
                created_at=now,
            )
            .on_conflict_do_update(
                index_elements=["session_id"],
                set_={
                    "last_seen_at": event_time,
                    "event_count": UserBehavioralSession.event_count + 1,
                    "exit_route": ev.get("route"),
                    "user_id": user_id if user_id else UserBehavioralSession.user_id,
                    "workspace_id": workspace_id if workspace_id else UserBehavioralSession.workspace_id,
                },
            )
        )
        await db.execute(session_stmt)

        # 2. Idempotent Insert into BehavioralEvent (ON CONFLICT DO NOTHING)
        event_id = uuid.UUID(ev["event_id"]) if isinstance(ev["event_id"], str) else ev["event_id"]
        event_stmt = (
            pg_insert(BehavioralEvent)
            .values(
                id=event_id,
                session_id=session_id,
                user_id=user_id,
                workspace_id=workspace_id,
                category=ev["category"],
                event_name=ev["event_name"],
                component_id=ev.get("component_id"),
                route=ev["route"],
                referrer_route=ev.get("referrer_route"),
                duration_ms=ev.get("duration_ms"),
                properties=ev.get("properties", {}),
                schema_version=ev.get("schema_version", "1.0"),
                created_at=event_time,
            )
            .on_conflict_do_nothing(index_elements=["id"])
        )
        await db.execute(event_stmt)
