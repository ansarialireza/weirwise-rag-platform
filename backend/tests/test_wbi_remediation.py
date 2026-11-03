"""Regression & security test suite for WBI Phase 2 remediations.

Verifies:
1. WBI-AUDIT-01: Immutable session ownership (User B takeover rejected to DLQ; User A owner preserved).
2. WBI-AUDIT-01 (Case E): Anonymous events submitted against authenticated session inherit owner.
3. WBI-AUDIT-03: Head-of-line batch isolation (poison pill routes to DLQ without failing valid sibling events).
4. Idempotent session upserting with anonymous-to-authenticated lifecycle.
"""

import json
import uuid
from datetime import UTC, datetime
import pytest
from sqlalchemy import select, delete

from backend.app.db.session import async_session_factory
from backend.app.models.auth import User
from backend.app.models.behavioral import BehavioralEvent, UserBehavioralSession
from backend.app.services.behavioral_stream import (
    DLQ_STREAM_KEY,
    behavioral_stream_producer,
)
from backend.app.services.behavioral_worker import BehavioralStreamConsumer


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_remediation_session_ownership_and_batch_isolation():
    redis = behavioral_stream_producer.get_redis_client()
    consumer = BehavioralStreamConsumer("test_remediation_worker")

    user_a_id = uuid.uuid4()
    user_b_id = uuid.uuid4()

    # Create two isolated test users in database
    async with async_session_factory() as db:
        now = datetime.now(UTC)
        user_a = User(
            id=user_a_id,
            email=f"remed_a_{uuid.uuid4().hex[:6]}@example.com",
            hashed_password="hashed_pw_dummy",
            full_name="User A",
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        user_b = User(
            id=user_b_id,
            email=f"remed_b_{uuid.uuid4().hex[:6]}@example.com",
            hashed_password="hashed_pw_dummy",
            full_name="User B",
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        db.add_all([user_a, user_b])
        await db.commit()

    session_id = f"remed_test_{uuid.uuid4().hex[:12]}"
    ev1_id = uuid.uuid4()
    ev2_id = uuid.uuid4()
    ev3_hijack_id = uuid.uuid4()
    ev4_valid_sibling_id = uuid.uuid4()
    ev5_case_e_id = uuid.uuid4()

    try:
        # Step 1: Anonymous session created with 1 event
        envelope_anon = {
            "session_id": session_id,
            "user_id": None,
            "workspace_id": None,
            "device_context": {"device_category": "desktop"},
            "geo_context": {},
            "event": {
                "event_id": str(ev1_id),
                "category": "navigation",
                "event_name": "landing.viewed",
                "route": "/",
                "timestamp": datetime.now(UTC).isoformat(),
                "properties": {"step": "anonymous"},
            },
        }
        msg1_id = "1790000000001-0"
        await consumer._process_messages(redis, [(msg1_id, {"data": json.dumps(envelope_anon)})])

        async with async_session_factory() as db:
            s1 = (await db.execute(select(UserBehavioralSession).where(UserBehavioralSession.session_id == session_id))).scalar_one()
            assert s1.user_id is None
            assert s1.event_count == 1

        # Step 2: User A logs in and associates the session
        envelope_login = {
            "session_id": session_id,
            "user_id": str(user_a_id),
            "workspace_id": None,
            "device_context": {"device_category": "desktop"},
            "geo_context": {},
            "event": {
                "event_id": str(ev2_id),
                "category": "action",
                "event_name": "auth.login.success",
                "route": "/login",
                "timestamp": datetime.now(UTC).isoformat(),
                "properties": {"step": "authenticated"},
            },
        }
        msg2_id = "1790000000002-0"
        await consumer._process_messages(redis, [(msg2_id, {"data": json.dumps(envelope_login)})])

        async with async_session_factory() as db:
            s2 = (await db.execute(select(UserBehavioralSession).where(UserBehavioralSession.session_id == session_id))).scalar_one()
            assert s2.user_id == user_a_id
            assert s2.event_count == 2

        # Step 3: WBI-AUDIT-01 & WBI-AUDIT-03
        # User B attempts to hijack session_id in a batch that ALSO contains a valid event
        envelope_hijack = {
            "session_id": session_id,
            "user_id": str(user_b_id),  # Attacker User B
            "workspace_id": None,
            "device_context": {"device_category": "desktop"},
            "geo_context": {},
            "event": {
                "event_id": str(ev3_hijack_id),
                "category": "action",
                "event_name": "malicious.hijack.attempt",
                "route": "/stolen",
                "timestamp": datetime.now(UTC).isoformat(),
                "properties": {"attacker": True},
            },
        }
        # Sibling valid event from User A in same batch
        envelope_sibling = {
            "session_id": session_id,
            "user_id": str(user_a_id),
            "workspace_id": None,
            "device_context": {"device_category": "desktop"},
            "geo_context": {},
            "event": {
                "event_id": str(ev4_valid_sibling_id),
                "category": "workflow",
                "event_name": "user_a.valid_action",
                "route": "/dashboard",
                "timestamp": datetime.now(UTC).isoformat(),
                "properties": {"sibling": True},
            },
        }

        msg3_id = "1790000000003-0"
        msg4_id = "1790000000004-0"
        batch = [
            (msg3_id, {"data": json.dumps(envelope_hijack)}),
            (msg4_id, {"data": json.dumps(envelope_sibling)}),
        ]
        await consumer._process_messages(redis, batch)

        # Verify DB state:
        # Session owner MUST STILL BE User A (WBI-AUDIT-01)
        # Event count should now be 3 (ev1, ev2, ev4); hijack ev3 MUST NOT be persisted
        async with async_session_factory() as db:
            s3 = (await db.execute(select(UserBehavioralSession).where(UserBehavioralSession.session_id == session_id))).scalar_one()
            assert s3.user_id == user_a_id
            assert s3.event_count == 3

            ev3_check = (await db.execute(select(BehavioralEvent).where(BehavioralEvent.id == ev3_hijack_id))).scalar_one_or_none()
            assert ev3_check is None, "Hijack event must not be saved to DB"

            ev4_check = (await db.execute(select(BehavioralEvent).where(BehavioralEvent.id == ev4_valid_sibling_id))).scalar_one_or_none()
            assert ev4_check is not None, "Valid sibling event must be saved (savepoint isolation)"

        # Step 4: Verify DLQ received the hijack poison message
        dlq_entries = await redis.xrevrange(DLQ_STREAM_KEY, count=5)
        found_dlq = False
        for _, d in dlq_entries:
            if "Session ownership violation" in d.get("error", ""):
                found_dlq = True
                break
        assert found_dlq, "Hijack violation must be routed to DLQ"

        # Step 5: Case E - Anonymous event submitted against authenticated session
        # Should succeed and safely inherit user_a_id
        envelope_case_e = {
            "session_id": session_id,
            "user_id": None,
            "workspace_id": None,
            "device_context": {"device_category": "desktop"},
            "geo_context": {},
            "event": {
                "event_id": str(ev5_case_e_id),
                "category": "navigation",
                "event_name": "anonymous.followup.viewed",
                "route": "/docs",
                "timestamp": datetime.now(UTC).isoformat(),
                "properties": {"case": "E"},
            },
        }
        msg5_id = "1790000000005-0"
        await consumer._process_messages(redis, [(msg5_id, {"data": json.dumps(envelope_case_e)})])

        async with async_session_factory() as db:
            s4 = (await db.execute(select(UserBehavioralSession).where(UserBehavioralSession.session_id == session_id))).scalar_one()
            assert s4.user_id == user_a_id
            assert s4.event_count == 4

            ev5_row = (await db.execute(select(BehavioralEvent).where(BehavioralEvent.id == ev5_case_e_id))).scalar_one()
            assert ev5_row.user_id == user_a_id, "Case E event must inherit authenticated session owner"

    finally:
        # Clean up all synthetic test data
        async with async_session_factory() as db:
            await db.execute(delete(BehavioralEvent).where(BehavioralEvent.session_id == session_id))
            await db.execute(delete(UserBehavioralSession).where(UserBehavioralSession.session_id == session_id))
            await db.execute(delete(User).where(User.id.in_([user_a_id, user_b_id])))
            await db.commit()
