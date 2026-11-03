"""Final Reliability Gate Integration and Hardening Test Suite for WBI Phase 1.

Verifies:
- Critical Verification A: Redis Stream Trimming Safety & Backpressure
- Critical Verification B: Crash Recovery between DB commit and XACK (idempotency, PEL reclamation)
- Critical Verification C: Trusted Proxy and Cloudflare Header Security
"""

import json
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from backend.app.core.config import settings
from backend.app.db.session import async_session_factory
from backend.app.main import app
from backend.app.models.behavioral import (
    BehavioralEvent,
    UserBehavioralSession,
)
from backend.app.services.behavioral_stream import (
    BACKPRESSURE_THRESHOLD,
    STREAM_KEY,
    behavioral_stream_producer,
)
from backend.app.services.behavioral_worker import (
    BehavioralStreamConsumer,
)
from backend.app.services.geoip import (
    CLOUDFLARE_IPV4_CIDRS,
    INTERNAL_PROXY_CIDRS,
    geoip_service,
    is_trusted_proxy_or_cloudflare,
)
from httpx import ASGITransport, AsyncClient
from redis.asyncio import from_url
from sqlalchemy import select


@pytest.fixture
def anyio_backend():
    return "asyncio"


# =========================================================================
# CRITICAL VERIFICATION A: Redis Stream Trimming Safety & Backpressure
# =========================================================================


@pytest.mark.anyio
async def test_stream_trimming_scenario_a_normal_processing():
    """Scenario A: Verify all messages are processed, acknowledged, and safe boundary trims acknowledged messages."""
    redis = from_url(settings.REDIS_URL, decode_responses=True)
    test_stream = f"test:trim:scen_a:{uuid.uuid4().hex[:6]}"
    group = "test_grp"

    try:
        # 1. Create stream with 5 messages
        ids = []
        for i in range(5):
            mid = await redis.xadd(test_stream, {"data": json.dumps({"test": i})})
            ids.append(mid)

        await redis.xgroup_create(test_stream, group, id="0", mkstream=True)

        # 2. Worker reads all 5 messages and ACKs all 5
        read_entries = await redis.xreadgroup(group, "w1", {test_stream: ">"}, count=10)
        assert len(read_entries[0][1]) == 5

        for mid, _ in read_entries[0][1]:
            await redis.xack(test_stream, group, mid)

        # 3. Calculate safe trim boundary
        boundary = await BehavioralStreamConsumer.calculate_safe_trim_boundary(redis, test_stream)
        assert boundary == ids[-1]

        # 4. Safe trim up to boundary (approximate=False for exact test assertion)
        trimmed = await redis.xtrim(test_stream, minid=boundary, approximate=False)
        assert trimmed == 4  # ids 0..3 trimmed, ids[-1] remains as current min

        remaining = await redis.xrange(test_stream, "-", "+")
        assert len(remaining) == 1
        assert remaining[0][0] == ids[-1]

    finally:
        await redis.delete(test_stream)
        await redis.aclose()


@pytest.mark.anyio
async def test_stream_trimming_scenario_b_pending_message_in_middle():
    """Scenario B: Message acknowledged out-of-order, pending message in middle.
    Boundary must stop at oldest unacknowledged message; pending message is NOT deleted.
    """
    redis = from_url(settings.REDIS_URL, decode_responses=True)
    test_stream = f"test:trim:scen_b:{uuid.uuid4().hex[:6]}"
    group = "test_grp"

    try:
        ids = []
        for i in range(4):
            mid = await redis.xadd(test_stream, {"data": json.dumps({"step": i})})
            ids.append(mid)

        await redis.xgroup_create(test_stream, group, id="0", mkstream=True)
        # Read all 4
        await redis.xreadgroup(group, "w1", {test_stream: ">"}, count=10)

        # ACK id[0], id[2], id[3], but leave id[1] PENDING
        await redis.xack(test_stream, group, ids[0])
        await redis.xack(test_stream, group, ids[2])
        await redis.xack(test_stream, group, ids[3])

        # Verify PEL has id[1]
        pending = await redis.xpending(test_stream, group)
        assert pending["pending"] == 1
        assert pending["min"] == ids[1]

        # Safe trim boundary calculation MUST yield id[1], NOT id[3]!
        boundary = await BehavioralStreamConsumer.calculate_safe_trim_boundary(redis, test_stream)
        assert boundary == ids[1]

        # Execute safe trim
        trimmed = await redis.xtrim(test_stream, minid=boundary, approximate=False)
        assert trimmed == 1  # only id[0] was strictly older than id[1]

        # Verify stream contents: id[1], id[2], id[3] remain intact!
        remaining = await redis.xrange(test_stream, "-", "+")
        remaining_ids = [m[0] for m in remaining]
        assert ids[1] in remaining_ids
        assert ids[0] not in remaining_ids

    finally:
        await redis.delete(test_stream)
        await redis.aclose()


@pytest.mark.anyio
async def test_stream_trimming_scenario_c_worker_crash_with_pending_message():
    """Scenario C: Worker read messages, processed 1, then crashed before processing message 2.
    Safe boundary must preserve message 2 for another worker to recover via PEL.
    """
    redis = from_url(settings.REDIS_URL, decode_responses=True)
    test_stream = f"test:trim:scen_c:{uuid.uuid4().hex[:6]}"
    group = "test_grp"

    try:
        id1 = await redis.xadd(test_stream, {"data": "msg1"})
        id2 = await redis.xadd(test_stream, {"data": "msg2"})

        await redis.xgroup_create(test_stream, group, id="0", mkstream=True)

        # Worker 1 reads both messages
        await redis.xreadgroup(group, "crashed_worker", {test_stream: ">"}, count=2)

        # Worker 1 ACKs id1 then crashes before ACK-ing id2
        await redis.xack(test_stream, group, id1)

        # Boundary must be id2 (the pending message in crashed_worker's PEL)
        boundary = await BehavioralStreamConsumer.calculate_safe_trim_boundary(redis, test_stream)
        assert boundary == id2

        # Safe trim must NOT remove id2
        await redis.xtrim(test_stream, minid=boundary, approximate=False)
        remaining = await redis.xrange(test_stream, "-", "+")
        remaining_ids = [m[0] for m in remaining]
        assert id2 in remaining_ids

        # Worker 2 claims id2 via XAUTOCLAIM
        claim_res = await redis.xautoclaim(test_stream, group, "worker_2", min_idle_time=0, start_id="0-0")
        assert len(claim_res[1]) == 1
        assert claim_res[1][0][0] == id2

    finally:
        await redis.delete(test_stream)
        await redis.aclose()


@pytest.mark.anyio
async def test_stream_trimming_scenario_d_db_failure_retains_message():
    """Scenario D: When DB transaction fails, message is not acknowledged and remains in stream."""
    redis = from_url(settings.REDIS_URL, decode_responses=True)
    test_stream = f"test:trim:scen_d:{uuid.uuid4().hex[:6]}"
    group = "test_grp"

    try:
        id1 = await redis.xadd(test_stream, {"data": "fail_msg"})
        await redis.xgroup_create(test_stream, group, id="0", mkstream=True)

        # Read message
        await redis.xreadgroup(group, "worker_d", {test_stream: ">"}, count=1)

        # DB error happens: do NOT call xack
        # Verify boundary does not advance past id1
        boundary = await BehavioralStreamConsumer.calculate_safe_trim_boundary(redis, test_stream)
        assert boundary == id1

        await redis.xtrim(test_stream, minid=boundary, approximate=False)
        remaining = await redis.xrange(test_stream, "-", "+")
        assert len(remaining) == 1
        assert remaining[0][0] == id1

    finally:
        await redis.delete(test_stream)
        await redis.aclose()


@pytest.mark.anyio
async def test_stream_trimming_scenario_e_multi_consumer_out_of_order():
    """Scenario E: Two consumers in same group processing in parallel at different speeds.
    Boundary must be min(oldest_pending_c1, oldest_pending_c2).
    """
    redis = from_url(settings.REDIS_URL, decode_responses=True)
    test_stream = f"test:trim:scen_e:{uuid.uuid4().hex[:6]}"
    group = "test_grp"

    try:
        id1 = await redis.xadd(test_stream, {"seq": 1})
        id2 = await redis.xadd(test_stream, {"seq": 2})
        id3 = await redis.xadd(test_stream, {"seq": 3})
        id4 = await redis.xadd(test_stream, {"seq": 4})

        await redis.xgroup_create(test_stream, group, id="0", mkstream=True)

        # Worker 1 reads id1, id2
        await redis.xreadgroup(group, "worker_fast", {test_stream: ">"}, count=2)
        # Worker 2 reads id3, id4
        await redis.xreadgroup(group, "worker_slow", {test_stream: ">"}, count=2)

        # Worker 1 ACKs id1 and id2
        await redis.xack(test_stream, group, id1, id2)

        # Worker 2 has not finished id3 yet
        boundary = await BehavioralStreamConsumer.calculate_safe_trim_boundary(redis, test_stream)
        # Safe boundary MUST be id3 because Worker 2 has id3 in PEL!
        assert boundary == id3

        # Safe trim executed: id1 and id2 safely trimmed, id3 and id4 untouched
        await redis.xtrim(test_stream, minid=boundary, approximate=False)
        remaining = await redis.xrange(test_stream, "-", "+")
        remaining_ids = [m[0] for m in remaining]
        assert remaining_ids == [id3, id4]

    finally:
        await redis.delete(test_stream)
        await redis.aclose()


@pytest.mark.anyio
async def test_backpressure_threshold_returns_http_429():
    """Scenario F: When stream length exceeds BACKPRESSURE_THRESHOLD, API returns HTTP 429."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Mock xlen to simulate a backed up stream
        mock_redis = AsyncMock()
        mock_redis.xlen.return_value = BACKPRESSURE_THRESHOLD + 100

        with patch.object(behavioral_stream_producer, "get_redis_client", return_value=mock_redis):
            payload = {
                "session_id": f"bp_test_{uuid.uuid4().hex[:8]}",
                "events": [
                    {
                        "event_id": str(uuid.uuid4()),
                        "category": "action",
                        "event_name": "button.clicked",
                        "route": "/test",
                        "timestamp": datetime.now(UTC).isoformat(),
                    }
                ],
            }
            res = await ac.post("/api/v1/telemetry/events:batch", json=payload)
            assert res.status_code == 429
            data = res.json()
            assert "Telemetry ingestion queue is experiencing high load" in data["detail"]


# =========================================================================
# CRITICAL VERIFICATION B: Crash Recovery between DB commit and XACK
# =========================================================================


@pytest.mark.anyio
async def test_crash_recovery_between_db_commit_and_xack():
    """Critical Verification B:
    Simulates worker writing and committing to PostgreSQL, then abruptly dying BEFORE xack.
    Proves:
    1. Message remains in Redis PEL.
    2. Second worker reclaims message via xautoclaim.
    3. Re-execution uses ON CONFLICT (id) DO NOTHING without duplicating rows.
    4. Exactly 1 row in PostgreSQL.
    5. Second worker completes XACK; message leaves PEL.
    """
    redis = from_url(settings.REDIS_URL, decode_responses=True)
    test_stream = f"test:crash:b:{uuid.uuid4().hex[:6]}"
    group = "test_workers"

    event_id = uuid.uuid4()
    session_id = f"crash_sess_{uuid.uuid4().hex[:8]}"
    envelope = {
        "session_id": session_id,
        "user_id": None,
        "workspace_id": None,
        "device_context": {"access_environment": "web_app"},
        "geo_context": {"country_code": "US", "country_name": "United States"},
        "event": {
            "event_id": str(event_id),
            "category": "action",
            "event_name": "crash.simulation.test",
            "route": "/admin/reliability",
            "timestamp": datetime.now(UTC).isoformat(),
            "properties": {"retry_test": True},
        },
    }

    try:
        # Step 1: Add message to Redis Stream
        msg_id = await redis.xadd(test_stream, {"data": json.dumps(envelope)})
        await redis.xgroup_create(test_stream, group, id="0", mkstream=True)

        # Step 2: Worker 1 reads message from stream
        worker_1_entries = await redis.xreadgroup(group, "worker_crash_1", {test_stream: ">"}, count=1)
        assert len(worker_1_entries[0][1]) == 1
        assert worker_1_entries[0][1][0][0] == msg_id

        # Step 3: Worker 1 persists to DB and commits
        consumer_1 = BehavioralStreamConsumer(consumer_name="worker_crash_1")
        async with async_session_factory() as db:
            await consumer_1._persist_event_envelope(db, envelope)
            await db.commit()

        # Step 4: SIMULATE CRASH -> worker_1 terminates WITHOUT executing XACK!
        # Verify message is currently in PEL
        pel_info = await redis.xpending(test_stream, group)
        assert pel_info["pending"] == 1
        assert pel_info["min"] == msg_id

        # Step 5: Worker 2 starts up and reclaims orphaned message via XAUTOCLAIM
        consumer_2 = BehavioralStreamConsumer(consumer_name="worker_recover_2")
        claim_res = await redis.xautoclaim(
            test_stream,
            group,
            consumer_2.consumer_name,
            min_idle_time=0,  # 0ms for instantaneous recovery test
            start_id="0-0",
        )
        assert len(claim_res[1]) == 1
        claimed_msg_id = claim_res[1][0][0]
        assert claimed_msg_id == msg_id

        # Step 6: Worker 2 processes the claimed message
        # _persist_event_envelope executes ON CONFLICT (id) DO NOTHING
        async with async_session_factory() as db:
            await consumer_2._persist_event_envelope(db, json.loads(claim_res[1][0][1]["data"]))
            await db.commit()

        # Step 7: Worker 2 successfully acknowledges the message
        await redis.xack(test_stream, group, claimed_msg_id)

        # Step 8: Verify message has left PEL
        pel_after = await redis.xpending(test_stream, group)
        assert pel_after["pending"] == 0

        # Step 9: Verify PostgreSQL state: EXACTLY ONE row in behavioral_events!
        async with async_session_factory() as db:
            res = await db.execute(select(BehavioralEvent).where(BehavioralEvent.id == event_id))
            rows = res.scalars().all()
            assert len(rows) == 1
            assert rows[0].id == event_id
            assert rows[0].session_id == session_id
            assert rows[0].event_name == "crash.simulation.test"

            # Verify session was updated idempotently
            sess_res = await db.execute(
                select(UserBehavioralSession).where(UserBehavioralSession.session_id == session_id)
            )
            sess_rows = sess_res.scalars().all()
            assert len(sess_rows) == 1
            # Initial insert + conflict update
            assert sess_rows[0].event_count >= 1

    finally:
        # Cleanup test DB row
        async with async_session_factory() as db:
            from sqlalchemy import delete

            await db.execute(delete(BehavioralEvent).where(BehavioralEvent.id == event_id))
            await db.execute(delete(UserBehavioralSession).where(UserBehavioralSession.session_id == session_id))
            await db.commit()

        await redis.delete(test_stream)
        await redis.aclose()


# =========================================================================
# CRITICAL VERIFICATION C: Trusted Proxy & Cloudflare Header Security
# =========================================================================


def test_cf_cidrs_and_internal_proxy_cidrs_definition():
    """Verify Cloudflare and internal CIDR blocks are properly configured and non-empty."""
    assert len(CLOUDFLARE_IPV4_CIDRS) >= 15
    assert len(INTERNAL_PROXY_CIDRS) >= 4


def test_trusted_proxy_validation_unit_logic():
    """Unit validation for is_trusted_proxy_or_cloudflare."""
    # Authentic Cloudflare edge IPs
    assert is_trusted_proxy_or_cloudflare("173.245.48.1") is True
    assert is_trusted_proxy_or_cloudflare("104.16.1.1") is True
    assert is_trusted_proxy_or_cloudflare("172.64.0.1") is True

    # Internal reverse proxy / docker subnets
    assert is_trusted_proxy_or_cloudflare("127.0.0.1") is True
    assert is_trusted_proxy_or_cloudflare("172.18.0.1") is True  # In 172.16.0.0/12
    assert is_trusted_proxy_or_cloudflare("10.0.0.5") is True
    assert is_trusted_proxy_or_cloudflare("192.168.1.10") is True

    # Direct untrusted public internet IPs
    assert is_trusted_proxy_or_cloudflare("8.8.8.8") is False
    assert is_trusted_proxy_or_cloudflare("1.1.1.1") is False  # 1.1.1.1 is resolver, not edge ingress CIDR
    assert is_trusted_proxy_or_cloudflare("185.199.108.153") is False
    assert is_trusted_proxy_or_cloudflare(None) is False
    assert is_trusted_proxy_or_cloudflare("invalid-ip") is False


def test_geoip_service_rejection_of_forged_cf_headers():
    """Verify GeoIPService directly discards forged CF-IPCountry from public untrusted IPs."""
    # Case 1: Attacker sends CF-IPCountry AND CF-RAY from public IP
    res = geoip_service.resolve_geo_context(
        client_ip="85.214.132.117",  # Public non-CF IP (Strato AG Germany)
        cf_country="GB",
        cf_ray="fake-ray-12345",
        client_tz="Europe/London",
    )
    assert res["country_code"] is None
    assert res["country_name"] == "Unknown"
    assert res["geo_lookup_source"] == "unresolved_untrusted"

    # Case 2: Attacker sends CF-IPCountry WITHOUT CF-RAY from CF IP
    res_no_ray = geoip_service.resolve_geo_context(
        client_ip="173.245.48.1",  # CF IP, but no ray
        cf_country="GB",
        cf_ray=None,
    )
    assert res_no_ray["country_code"] is None
    assert res_no_ray["geo_lookup_source"] != "cf_headers_verified"

    # Case 3: Legitimate Cloudflare request
    res_legit = geoip_service.resolve_geo_context(
        client_ip="173.245.48.1",
        cf_country="GB",
        cf_ray="874b091f3a21-LHR",
        client_tz="Europe/London",
    )
    assert res_legit["country_code"] == "GB"
    assert res_legit["country_name"] == "United Kingdom"
    assert res_legit["geo_lookup_source"] == "cf_headers_verified"


@pytest.mark.anyio
async def test_api_endpoint_rejects_spoofed_cloudflare_headers():
    """Integration test: API endpoint receives spoofed CF headers from an untrusted client IP."""
    async with AsyncClient(
        transport=ASGITransport(app=app, client=("85.214.132.117", 54321)),
        base_url="http://test",
    ) as ac:
        payload = {
            "session_id": f"spoof_sess_{uuid.uuid4().hex[:8]}",
            "events": [
                {
                    "event_id": str(uuid.uuid4()),
                    "category": "action",
                    "event_name": "button.clicked",
                    "route": "/dashboard",
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            ],
        }
        headers = {
            "CF-IPCountry": "JP",
            "CF-RAY": "spoofed-ray-token",
        }
        res = await ac.post("/api/v1/telemetry/events:batch", json=payload, headers=headers)
        assert res.status_code == 202

        # Check what was queued in Redis for this session
        redis = from_url(settings.REDIS_URL, decode_responses=True)
        try:
            # Read latest stream message
            msgs = await redis.xrevrange(STREAM_KEY, count=1)
            assert len(msgs) > 0
            envelope = json.loads(msgs[0][1]["data"])
            # Verify country code was NOT accepted as JP!
            assert envelope["geo_context"]["country_code"] is None
            assert envelope["geo_context"]["geo_lookup_source"] == "unresolved_untrusted"
        finally:
            await redis.aclose()
