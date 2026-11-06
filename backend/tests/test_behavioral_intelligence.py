"""Comprehensive automated verification and reliability test suite for WBI Phase 1."""

import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from backend.app.core.config import settings
from backend.app.db.session import async_session_factory
from backend.app.models.auth import User
from backend.app.models.behavioral import (
    BehavioralEvent,
    UserBehavioralProfile,
    UserBehavioralSession,
)
from backend.app.services.behavioral_stream import (
    CONSUMER_GROUP,
    DLQ_STREAM_KEY,
    STREAM_KEY,
    behavioral_stream_producer,
)
from backend.app.services.behavioral_worker import BehavioralStreamConsumer
from backend.app.services.geoip import geoip_service
from backend.app.services.retention import retention_service
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

requires_redis = pytest.mark.skipif(
    not settings.REDIS_URL,
    reason="Requires a configured Redis instance for WBI stream integration",
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


# --- 1. GEOLOCATION & PROXY SECURITY TESTS ---


@pytest.mark.anyio
async def test_trusted_proxy_validation_accepts_authentic_cloudflare():
    """Verify that verified Cloudflare edge IPs with CF-RAY are trusted."""
    # Authentic Cloudflare IP (from 173.245.48.0/20 block) + CF-RAY present
    res = geoip_service.resolve_geo_context(
        client_ip="173.245.48.10",
        cf_country="DE",
        cf_ray="874a9831ae50d247-FRA",
        client_tz="Europe/Berlin",
    )
    assert res["country_code"] == "DE"
    assert res["country_name"] == "Germany"
    assert res["geo_lookup_source"] == "cf_headers_verified"


@pytest.mark.anyio
async def test_trusted_proxy_validation_rejects_spoofed_headers():
    """Verify that untrusted direct client IPs attempting to forge CF-IPCountry are rejected."""
    # Arbitrary public IP (not in Cloudflare or local proxy CIDRs) sending CF-IPCountry
    res = geoip_service.resolve_geo_context(
        client_ip="85.214.132.117",
        cf_country="JP",
        cf_ray=None,  # Missing authentic ray
        client_tz="Asia/Tokyo",
    )
    # Must NOT trust spoofed JP country
    assert res["country_code"] is None
    assert res["country_name"] == "Unknown"
    assert res["geo_lookup_source"] == "unresolved_untrusted"


@pytest.mark.anyio
async def test_private_gateway_and_localhost_resolution():
    """Verify that internal docker / localhost IPs resolve safely without storing raw IPs."""
    res_local = geoip_service.resolve_geo_context(client_ip="127.0.0.1")
    assert res_local["country_code"] is None
    assert "Local Network" in res_local["country_name"]
    assert res_local["geo_lookup_source"] == "internal_gateway"

    res_docker = geoip_service.resolve_geo_context(client_ip="172.18.0.4")
    assert res_docker["country_code"] is None
    assert res_docker["geo_lookup_source"] == "internal_gateway"


# --- 2. AUTHENTICATION & OWNERSHIP TESTS ---


@requires_redis
@pytest.mark.anyio
async def test_authenticated_ownership_cannot_be_overridden_by_client():
    """Verify that server-side auth token dictates user_id regardless of payload."""
    from backend.app.core.security import create_jwt_token
    from backend.app.main import create_application

    app = create_application()
    test_user_id = uuid.uuid4()

    # Create real user in DB so get_optional_current_user resolves active user
    async with async_session_factory() as db:
        user = User(
            id=test_user_id,
            email=f"auth_owner_{uuid.uuid4().hex[:6]}@test.com",
            hashed_password="hashed_pw_test",
            full_name="Auth Owner Test",
            is_active=True,
        )
        db.add(user)
        await db.commit()

    token = create_jwt_token(data={"sub": str(test_user_id)}, expires_delta=timedelta(hours=1))

    sess_id = f"auth_test_{uuid.uuid4().hex[:8]}"
    ev_id = uuid.uuid4()
    payload = {
        "session_id": sess_id,
        "events": [
            {
                "event_id": str(ev_id),
                "category": "navigation",
                "event_name": "workspace.dashboard.viewed",
                "route": "/workspaces",
                "timestamp": datetime.now(UTC).isoformat(),
            }
        ],
    }

    # Post with Bearer token
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/telemetry/events:batch",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 202

    # Verify stream envelope contains the verified test_user_id
    r = behavioral_stream_producer.get_redis_client()
    messages = await r.xrevrange(STREAM_KEY, count=1)
    assert len(messages) > 0
    envelope = json.loads(messages[0][1]["data"])
    assert envelope["user_id"] == str(test_user_id)
    assert envelope["session_id"] == sess_id

    # Clean up user
    async with async_session_factory() as db:
        from sqlalchemy import delete

        await db.execute(delete(User).where(User.id == test_user_id))
        await db.commit()


@requires_redis
@pytest.mark.anyio
async def test_anonymous_session_handling():
    """Verify that unauthenticated telemetry (e.g. embed widget) assigns user_id=None."""
    from backend.app.main import create_application

    app = create_application()
    anon_sess_id = f"anon_sess_{uuid.uuid4().hex[:8]}"
    payload = {
        "session_id": anon_sess_id,
        "device_context": {"access_environment": "embedded_widget"},
        "events": [
            {
                "event_id": str(uuid.uuid4()),
                "category": "workflow",
                "event_name": "widget.chat.started",
                "route": "/embed/asst_123",
                "timestamp": datetime.now(UTC).isoformat(),
            }
        ],
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/telemetry/events:batch", json=payload)
        assert resp.status_code == 202

    r = behavioral_stream_producer.get_redis_client()
    messages = await r.xrevrange(STREAM_KEY, count=1)
    envelope = json.loads(messages[0][1]["data"])
    assert envelope["user_id"] is None
    assert envelope["session_id"] == anon_sess_id
    assert envelope["device_context"]["access_environment"] == "embedded_widget"


# --- 3. PAYLOAD BOUNDS & VALIDATION REJECTIONS ---


@pytest.mark.anyio
async def test_oversized_batch_rejection():
    """Verify that batches exceeding 100 events are rejected with HTTP 422."""
    from backend.app.main import create_application

    app = create_application()
    events = [
        {
            "event_id": str(uuid.uuid4()),
            "category": "action",
            "event_name": "test.bulk.event",
            "route": "/test",
            "timestamp": datetime.now(UTC).isoformat(),
        }
        for _ in range(101)  # Limit is 100
    ]
    payload = {"session_id": "oversized_batch_test", "events": events}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/telemetry/events:batch", json=payload)
        assert resp.status_code == 422


@pytest.mark.anyio
async def test_prohibited_sensitive_keys_rejection():
    """Verify rejection of payloads containing sensitive keywords."""
    from backend.app.main import create_application

    app = create_application()
    payload = {
        "session_id": "sensitive_test_sess",
        "events": [
            {
                "event_id": str(uuid.uuid4()),
                "category": "action",
                "event_name": "form.submit.attempted",
                "route": "/login",
                "timestamp": datetime.now(UTC).isoformat(),
                "properties": {"auth_token": "secret_bearer_token"},
            }
        ],
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/telemetry/events:batch", json=payload)
        assert resp.status_code == 422
        assert "sensitive data" in resp.text


# --- 4. REDIS RELIABILITY, WORKER & DLQ TESTS ---


@pytest.mark.anyio
async def test_idempotent_event_persistence():
    """Verify that re-processing identical event IDs creates zero duplicates."""
    consumer = BehavioralStreamConsumer(consumer_name="idempotent_test_worker")
    dup_session_id = f"dup_sess_{uuid.uuid4().hex[:8]}"
    dup_event_id = uuid.uuid4()

    envelope = {
        "session_id": dup_session_id,
        "user_id": None,
        "workspace_id": None,
        "device_context": {"device_category": "desktop"},
        "geo_context": {"country_code": "US", "country_name": "United States"},
        "event": {
            "event_id": str(dup_event_id),
            "category": "action",
            "event_name": "test.idempotent.click",
            "route": "/test-idempotent",
            "timestamp": datetime.now(UTC).isoformat(),
            "properties": {"step": 1},
        },
    }

    async with async_session_factory() as db:
        # First write
        await consumer._persist_event_envelope(db, envelope)
        await db.commit()

        # Second write (simulating redelivery)
        await consumer._persist_event_envelope(db, envelope)
        await db.commit()

        # Assert only 1 row exists
        stmt = select(BehavioralEvent).where(BehavioralEvent.id == dup_event_id)
        records = (await db.execute(stmt)).scalars().all()
        assert len(records) == 1

        # Clean up
        from sqlalchemy import delete

        await db.execute(delete(BehavioralEvent).where(BehavioralEvent.id == dup_event_id))
        await db.execute(delete(UserBehavioralSession).where(UserBehavioralSession.session_id == dup_session_id))
        await db.commit()


@requires_redis
@pytest.mark.anyio
async def test_dead_letter_queue_routing():
    """Verify that malformed poison payloads route to DLQ without crashing the worker."""
    from backend.app.core.config import settings
    from redis.asyncio import from_url

    r = from_url(settings.REDIS_URL, decode_responses=True)
    consumer = BehavioralStreamConsumer(consumer_name="dlq_test_worker")

    # Ensure stream and consumer group exist
    try:
        await r.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
    except Exception:
        pass

    # Inject a poisoned message (unparseable payload)
    msg_id = await r.xadd(STREAM_KEY, {"data": "MALFORMED_NON_JSON_CORRUPTION_@@#$%"})

    # Process via worker with is_retry=True to trigger DLQ routing
    await consumer._process_messages(r, [(msg_id, {"data": "MALFORMED_NON_JSON_CORRUPTION_@@#$%"})], is_retry=True)

    # Verify DLQ received the poisoned message
    dlq_entries = await r.xrevrange(DLQ_STREAM_KEY, count=1)
    assert len(dlq_entries) > 0
    dlq_data = dlq_entries[0][1]
    assert dlq_data["original_id"] == msg_id
    assert "MALFORMED" in dlq_data["payload"]

    # Verify original message was acknowledged and removed from consumer group PEL
    pel_info = await r.xpending_range(STREAM_KEY, CONSUMER_GROUP, min=msg_id, max=msg_id, count=1)
    assert len(pel_info) == 0

    # Clean up DLQ entry
    await r.xdel(DLQ_STREAM_KEY, dlq_entries[0][0])
    await r.xdel(STREAM_KEY, msg_id)
    await r.aclose()


# --- 5. DATA LIFECYCLE & USER ERASURE TESTS ---


@pytest.mark.anyio
async def test_user_deletion_cascading_erasure():
    """Verify that deleting a User completely and immediately removes all linked WBI data."""
    test_user_id = uuid.uuid4()
    sess_id = f"delete_sess_{uuid.uuid4().hex[:8]}"
    ev_id = uuid.uuid4()

    async with async_session_factory() as db:
        # Create a test user
        test_user = User(
            id=test_user_id,
            email=f"wbi_delete_test_{uuid.uuid4().hex[:6]}@weirwise.com",
            hashed_password="hashed_pw_test",
            full_name="WBI Test User",
            is_active=True,
        )
        db.add(test_user)
        await db.flush()

        sess = UserBehavioralSession(
            id=uuid.uuid4(),
            session_id=sess_id,
            user_id=test_user.id,
            first_seen_at=datetime.now(UTC),
            last_seen_at=datetime.now(UTC),
            created_at=datetime.now(UTC),
        )
        db.add(sess)
        await db.flush()

        ev = BehavioralEvent(
            id=ev_id,
            session_id=sess_id,
            user_id=test_user.id,
            category="navigation",
            event_name="user.profile.viewed",
            route="/profile",
            created_at=datetime.now(UTC),
        )
        db.add(ev)

        profile = UserBehavioralProfile(
            user_id=test_user.id,
            total_sessions=1,
            last_profile_sync_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(profile)
        await db.commit()

    # Now in a fresh session, execute delete
    async with async_session_factory() as db:
        from sqlalchemy import delete

        await db.execute(delete(User).where(User.id == test_user_id))
        await db.commit()

        # Assert all linked records are completely cascaded in DB
        ev_check = (await db.execute(select(BehavioralEvent).where(BehavioralEvent.id == ev_id))).scalar_one_or_none()
        sess_check = (
            await db.execute(select(UserBehavioralSession).where(UserBehavioralSession.session_id == sess_id))
        ).scalar_one_or_none()
        profile_check = (
            await db.execute(select(UserBehavioralProfile).where(UserBehavioralProfile.user_id == test_user_id))
        ).scalar_one_or_none()

        assert ev_check is None
        assert sess_check is None
        assert profile_check is None


@pytest.mark.anyio
async def test_retention_service_pruning():
    """Verify bounded retention pruning sweeps expired records."""
    old_time = datetime.now(UTC) - timedelta(days=50)
    sess_id = f"retention_test_{uuid.uuid4().hex[:8]}"

    async with async_session_factory() as db:
        sess = UserBehavioralSession(
            id=uuid.uuid4(),
            session_id=sess_id,
            first_seen_at=old_time,
            last_seen_at=old_time,
            created_at=old_time,
        )
        db.add(sess)
        await db.flush()

        ev = BehavioralEvent(
            id=uuid.uuid4(),
            session_id=sess_id,
            category="action",
            event_name="old.action.test",
            route="/old",
            created_at=old_time,
        )
        db.add(ev)
        await db.commit()

        # Run retention prune with 45-day threshold
        res = await retention_service.prune_behavioral_telemetry(db, raw_events_days=45)
        assert res["behavioral_events_pruned"] >= 1

        # Check record is purged
        stmt = select(BehavioralEvent).where(BehavioralEvent.session_id == sess_id)
        assert (await db.execute(stmt)).scalar_one_or_none() is None

        # Clean session
        from sqlalchemy import delete

        await db.execute(delete(UserBehavioralSession).where(UserBehavioralSession.session_id == sess_id))
        await db.commit()
