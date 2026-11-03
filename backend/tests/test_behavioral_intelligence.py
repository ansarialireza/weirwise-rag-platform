"""Comprehensive automated integration and reliability tests for Weirwise Behavioral Intelligence (WBI) Phase 1."""

import asyncio
import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from backend.app.db.session import async_session_factory
from backend.app.models.auth import User
from backend.app.models.behavioral import (
    BehavioralEvent,
    BehavioralInsight,
    UserBehavioralProfile,
    UserBehavioralSession,
)
from backend.app.schemas.behavioral import (
    BehavioralBatchIngestionRequest,
    BehavioralEventItem,
    DeviceContextSchema,
    GeographicContextSchema,
)
from backend.app.services.behavioral_stream import (
    DLQ_STREAM_KEY,
    STREAM_KEY,
    behavioral_stream_producer,
)
from backend.app.services.behavioral_worker import BehavioralStreamConsumer
from backend.app.services.geoip import geoip_service
from backend.app.services.retention import retention_service
from httpx import ASGITransport, AsyncClient
from redis.asyncio import from_url
from sqlalchemy import select


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_geoip_service_resolution():
    """Verify privacy-preserving geolocation resolution and private IP safety."""
    # 1. Cloudflare header extraction
    res_cf = geoip_service.resolve_geo_context(
        client_ip="194.25.0.1", cf_country="de", client_tz="Europe/Berlin"
    )
    assert res_cf["country_code"] == "DE"
    assert res_cf["country_name"] == "Germany"
    assert res_cf["timezone"] == "Europe/Berlin"
    assert res_cf["geo_lookup_source"] == "cf_headers"

    # 2. Localhost / Private IP safety
    res_local = geoip_service.resolve_geo_context(client_ip="127.0.0.1")
    assert res_local["country_code"] is None
    assert "Local" in res_local["country_name"]
    assert res_local["geo_lookup_source"] == "internal_gateway"

    # 3. Private RFC-1918 IP safety
    res_rfc = geoip_service.resolve_geo_context(client_ip="192.168.1.100")
    assert res_rfc["country_code"] is None
    assert res_rfc["geo_lookup_source"] == "internal_gateway"


@pytest.mark.anyio
async def test_schema_validation_and_sensitive_data_rejection():
    """Verify that event items reject invalid syntax and sensitive properties."""
    # Valid event
    ev = BehavioralEventItem(
        event_id=uuid.uuid4(),
        category="workflow",
        event_name="workflow.funnel.started",
        route="/workspaces/demo/assistants",
        timestamp=datetime.now(UTC),
        properties={"step": 1, "wizard_type": "rag"},
    )
    assert ev.event_name == "workflow.funnel.started"

    # Invalid event_name syntax (must be dot-notated alphanumeric)
    with pytest.raises(ValueError):
        BehavioralEventItem(
            event_id=uuid.uuid4(),
            category="action",
            event_name="bad name with spaces!",
            route="/test",
            timestamp=datetime.now(UTC),
        )

    # Rejection of sensitive keywords in properties
    with pytest.raises(ValueError, match="prohibited sensitive data"):
        BehavioralEventItem(
            event_id=uuid.uuid4(),
            category="action",
            event_name="auth.login.clicked",
            route="/login",
            timestamp=datetime.now(UTC),
            properties={"password": "raw_password_123"},
        )


@pytest.mark.anyio
async def test_ingestion_api_and_worker_pipeline():
    """Verify end-to-end flow: Ingest via API -> Redis Stream -> Consumer Worker -> PostgreSQL."""
    from backend.app.main import create_application

    app = create_application()
    test_session_id = f"test_sess_{uuid.uuid4().hex[:12]}"
    test_event_id = uuid.uuid4()

    payload = {
        "session_id": test_session_id,
        "device_context": {
            "device_category": "desktop",
            "operating_system": "Linux",
            "browser": "Chrome",
            "screen_width": 1920,
            "screen_height": 1080,
            "access_environment": "web_app",
        },
        "geographic_context": {
            "country_code": "DE",
            "country_name": "Germany",
            "timezone": "Europe/Berlin",
        },
        "events": [
            {
                "event_id": str(test_event_id),
                "category": "workflow",
                "event_name": "assistant.builder.started",
                "component_id": "btn-create-assistant",
                "route": "/workspaces/123/assistants/new",
                "duration_ms": 450,
                "timestamp": datetime.now(UTC).isoformat(),
                "properties": {"template": "support_agent"},
                "schema_version": "1.0",
            }
        ],
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/telemetry/events:batch", json=payload)
        assert resp.status_code == 202
        body = resp.json()
        assert body["status"] == "accepted"
        assert body["events_queued"] == 1
        assert body["session_id"] == test_session_id

    # Run the worker for 1 iteration to process the stream
    consumer = BehavioralStreamConsumer(consumer_name="test_worker_1")
    await consumer.run(max_iterations=1)

    # Verify record in PostgreSQL database
    async with async_session_factory() as db:
        # Check session
        stmt_sess = select(UserBehavioralSession).where(
            UserBehavioralSession.session_id == test_session_id
        )
        res_sess = (await db.execute(stmt_sess)).scalar_one_or_none()
        assert res_sess is not None
        assert res_sess.device_category == "desktop"
        assert res_sess.country_code == "DE"
        assert res_sess.operating_system == "Linux"
        assert res_sess.browser == "Chrome"

        # Check event
        stmt_ev = select(BehavioralEvent).where(BehavioralEvent.id == test_event_id)
        res_ev = (await db.execute(stmt_ev)).scalar_one_or_none()
        assert res_ev is not None
        assert res_ev.event_name == "assistant.builder.started"
        assert res_ev.component_id == "btn-create-assistant"
        assert res_ev.properties.get("template") == "support_agent"


@pytest.mark.anyio
async def test_idempotent_event_persistence():
    """Verify that re-inserting the same event ID evaluates safely as a no-op."""
    consumer = BehavioralStreamConsumer(consumer_name="idempotent_worker")
    dup_session_id = f"dup_sess_{uuid.uuid4().hex[:12]}"
    dup_event_id = uuid.uuid4()

    envelope = {
        "session_id": dup_session_id,
        "user_id": None,
        "workspace_id": None,
        "device_context": {"device_category": "laptop"},
        "geo_context": {"country_code": "US"},
        "event": {
            "event_id": str(dup_event_id),
            "category": "action",
            "event_name": "button.citation.clicked",
            "route": "/playground",
            "timestamp": datetime.now(UTC).isoformat(),
            "properties": {"citation_idx": 1},
        },
    }

    async with async_session_factory() as db:
        # First persistence
        await consumer._persist_event_envelope(db, envelope)
        await db.commit()

        # Second identical persistence (simulating worker crash and redelivery)
        await consumer._persist_event_envelope(db, envelope)
        await db.commit()

        # Verify only 1 event row exists
        stmt = select(BehavioralEvent).where(BehavioralEvent.id == dup_event_id)
        events = (await db.execute(stmt)).scalars().all()
        assert len(events) == 1


@pytest.mark.anyio
async def test_retention_pruning_service():
    """Verify bounded pruning of raw events past retention cutoff."""
    old_time = datetime.now(UTC) - timedelta(days=50)
    sess_id = f"retention_sess_{uuid.uuid4().hex[:8]}"

    async with async_session_factory() as db:
        # Create an expired session and event
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
            category="navigation",
            event_name="navigation.page.viewed",
            route="/old-path",
            created_at=old_time,
        )
        db.add(ev)
        await db.commit()

        # Run retention pruning with default 45-day cutoff
        prune_res = await retention_service.prune_behavioral_telemetry(db, raw_events_days=45)
        assert prune_res["behavioral_events_pruned"] >= 1

        # Check event was purged
        stmt = select(BehavioralEvent).where(BehavioralEvent.session_id == sess_id)
        purged_ev = (await db.execute(stmt)).scalar_one_or_none()
        assert purged_ev is None
