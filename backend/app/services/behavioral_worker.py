"""Asynchronous background worker for consuming and persisting WBI Redis Streams."""

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional

from backend.app.core.config import settings
from backend.app.db.session import async_session_factory
from backend.app.models.auth import User, Workspace
from backend.app.models.behavioral import (
    BehavioralEvent,
    UserBehavioralSession,
)
from backend.app.services.behavioral_stream import (
    CONSUMER_GROUP,
    DLQ_STREAM_KEY,
    STREAM_KEY,
)
from sqlalchemy import case, literal, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
AUTO_CLAIM_MIN_IDLE_TIME_MS = 60_000  # 60s
BATCH_SIZE = 100
BLOCK_TIMEOUT_MS = 2000
TRIM_INTERVAL_ITERATIONS = 50  # Safe trim sweep frequency


def parse_stream_id(sid: str) -> tuple[int, int]:
    """Parses a Redis stream ID 'ms-seq' into a numeric tuple for accurate comparison."""
    parts = sid.split("-")
    return (int(parts[0]), int(parts[1]))


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
                    for item in entries:
                        if isinstance(item, (list, tuple)) and len(item) == 2:
                            _, messages = item
                            if messages:
                                await self._process_messages(redis, messages)

                # 3. Periodic safe stream trimming
                if iterations % TRIM_INTERVAL_ITERATIONS == 0:
                    await self.safe_trim(redis)

                iterations += 1
                if max_iterations and iterations >= max_iterations:
                    break

                await asyncio.sleep(0.01)

        finally:
            await redis.aclose()
            logger.info(f"Stopped WBI Stream Consumer: {self.consumer_name}")

    def stop(self):
        self._running = False

    @staticmethod
    async def calculate_safe_trim_boundary(redis, stream_key: str = STREAM_KEY) -> Optional[str]:
        """Calculates the safe trimming boundary across all consumer groups.

        To guarantee zero event loss:
        - Inspects every consumer group registered on the stream.
        - For each group:
          - If the group has pending entries (PEL > 0), boundary is bounded by oldest pending message (min).
          - If the group has no pending entries (PEL == 0), the safe boundary is the group's last-delivered-id.
          - If any group has never delivered any messages (last-delivered-id is '0-0' or None),
            trimming cannot proceed (returns None).
        - Returns the minimum boundary across all consumer groups, or None if trimming is unsafe.
        """
        try:
            groups = await redis.xinfo_groups(stream_key)
        except Exception as e:
            logger.debug(f"Could not fetch stream groups for trimming: {e!s}")
            return None

        if not groups:
            return None

        boundaries: List[str] = []
        for g in groups:
            group_name = g.get("name")
            if not group_name:
                continue

            try:
                pending_info = await redis.xpending(stream_key, group_name)
            except Exception as e:
                logger.warning(f"Could not fetch xpending for group {group_name}: {e!s}")
                return None

            if pending_info and pending_info.get("pending", 0) > 0 and pending_info.get("min"):
                boundaries.append(pending_info["min"])
            else:
                last_delivered = g.get("last-delivered-id")
                if last_delivered and last_delivered != "0-0":
                    boundaries.append(last_delivered)
                else:
                    # Unconsumed messages exist in this group from the beginning
                    return None

        if not boundaries:
            return None

        return min(boundaries, key=parse_stream_id)

    @classmethod
    async def safe_trim(cls, redis, stream_key: str = STREAM_KEY) -> int:
        """Trims acknowledged messages from Redis Stream strictly up to the safe boundary."""
        boundary = await cls.calculate_safe_trim_boundary(redis, stream_key)
        if not boundary:
            return 0

        try:
            trimmed = await redis.xtrim(stream_key, minid=boundary, approximate=True)
            if trimmed > 0:
                logger.info(f"Safely trimmed {trimmed} acknowledged messages up to MINID {boundary} in {stream_key}.")
            return trimmed
        except Exception as e:
            logger.warning(f"Error during safe stream trimming: {e!s}")
            return 0

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
        """Processes message batch, executes idempotent DB transactions per message savepoint, and ACKs."""
        successful_message_ids = []
        dlq_messages = []

        async with async_session_factory() as db:
            async with db.begin():
                for msg_id, data in messages:
                    raw_payload = data.get("data")
                    if not raw_payload:
                        successful_message_ids.append(msg_id)
                        continue

                    try:
                        async with db.begin_nested():
                            envelope = json.loads(raw_payload)
                            await self._persist_event_envelope(db, envelope)
                        successful_message_ids.append(msg_id)
                    except Exception as e:
                        logger.error(f"Failed to process message {msg_id}: {e!s}")
                        # Route failed message to DLQ if retrying or terminal violation
                        dlq_messages.append((msg_id, raw_payload, str(e)))

        # Acknowledge successfully persisted messages
        if successful_message_ids:
            try:
                await redis.xack(STREAM_KEY, CONSUMER_GROUP, *successful_message_ids)
            except Exception as e:
                logger.error(f"Failed to XACK messages: {e!s}")

        # Route failures to Dead-Letter Queue and ACK from incoming stream
        for msg_id, payload_str, err_msg in dlq_messages:
            try:
                await redis.xadd(
                    DLQ_STREAM_KEY,
                    {"original_id": msg_id, "payload": payload_str, "error": err_msg},
                )
                await redis.xack(STREAM_KEY, CONSUMER_GROUP, msg_id)
                logger.warning(f"Routed poison message {msg_id} to DLQ {DLQ_STREAM_KEY}: {err_msg}")
            except Exception as e:
                logger.error(f"Failed to route message {msg_id} to DLQ: {e!s}")

    async def _persist_event_envelope(self, db, envelope: Dict[str, Any]):
        """Persists session context and event using idempotent upsert/insert with strict ownership validation."""
        session_id = envelope["session_id"]
        user_id = uuid.UUID(envelope["user_id"]) if envelope.get("user_id") else None
        workspace_id = uuid.UUID(envelope["workspace_id"]) if envelope.get("workspace_id") else None
        device_ctx = envelope.get("device_context") or {}
        geo_ctx = envelope.get("geo_context") or {}
        ev = envelope["event"]

        # 0. Strict Ownership Invariant Check:
        # Check if session already exists and is owned by a different user
        existing_sess = (
            await db.execute(select(UserBehavioralSession).where(UserBehavioralSession.session_id == session_id))
        ).scalar_one_or_none()

        if existing_sess is not None:
            # Case D: If session is already bound to User A, User B must never write to it
            if existing_sess.user_id is not None and user_id is not None and existing_sess.user_id != user_id:
                raise ValueError(
                    f"Session ownership violation: session '{session_id}' is owned by user "
                    f"'{existing_sess.user_id}', cannot be reassigned or appended to by user '{user_id}'."
                )
            # Case E: An anonymous event submitted against an already authenticated session
            # Inherits the authenticated user_id so ownership is not broken or obscured
            if existing_sess.user_id is not None and user_id is None:
                user_id = existing_sess.user_id

        # Validate foreign keys exist in PostgreSQL to prevent IntegrityError / DLQ poisoning
        if user_id is not None:
            user_exists = (
                await db.execute(select(User.id).where(User.id == user_id))
            ).scalar_one_or_none()
            if user_exists is None:
                logger.warning(
                    f"WBI worker: user_id '{user_id}' in session '{session_id}' does not exist in database; demoting to anonymous session."
                )
                user_id = None

        if workspace_id is not None:
            ws_exists = (
                await db.execute(select(Workspace.id).where(Workspace.id == workspace_id))
            ).scalar_one_or_none()
            if ws_exists is None:
                logger.warning(
                    f"WBI worker: workspace_id '{workspace_id}' in session '{session_id}' does not exist in database; setting to null."
                )
                workspace_id = None

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
                    # Immutable ownership: Only bind user_id if session is currently anonymous
                    "user_id": case(
                        (
                            UserBehavioralSession.user_id.is_(None),
                            literal(user_id, type_=UserBehavioralSession.user_id.type),
                        ),
                        else_=UserBehavioralSession.user_id,
                    ),
                    "workspace_id": case(
                        (
                            UserBehavioralSession.workspace_id.is_(None),
                            literal(workspace_id, type_=UserBehavioralSession.workspace_id.type),
                        ),
                        else_=UserBehavioralSession.workspace_id,
                    ),
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
