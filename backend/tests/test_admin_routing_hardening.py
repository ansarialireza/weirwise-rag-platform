"""Automated coverage for §12 provider/token management and recovery policies.

Each test maps to one of the required scenarios: multi-token registration,
pre-save validation, manual/automatic modes, healthy selection, policy
distribution, rate-limit detection, auth failures, cooldowns, recovery,
failover, account-wide shared quotas, concurrency limits, retry storms,
provider outages, RBAC, secret safety, and usage/cost accuracy.
"""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from backend.app.core.security import create_jwt_token, hash_password
from backend.app.db.session import async_session_factory
from backend.app.main import app
from backend.app.models.admin import (
    AdminControlSettings,
    CredentialHealthStatus,
    ProviderAccount,
    ProviderCredential,
    ProviderRoutingStrategy,
    RoutingEvent,
    TokenCostLedger,
)
from backend.app.models.auth import User
from backend.app.services import llm
from backend.app.services.routing_engine import IntelligentRoutingEngine
from backend.app.services.routing_state import routing_state
from backend.app.services.token_manager import TokenManager
from backend.app.services.vault import encrypt_credential_secret
from httpx import ASGITransport, AsyncClient

_CONTROL_FIELDS = (
    "management_mode",
    "emergency_stop",
    "automatic_failover",
    "auto_disable_unhealthy",
    "auto_recover_credentials",
    "rate_limit_cooldown_seconds",
    "circuit_breaker_failure_threshold",
    "circuit_breaker_cooldown_seconds",
)


@pytest.fixture(autouse=True)
async def isolate_routing_control():
    """Keep in-process windows and global control settings isolated per test."""
    routing_state.reset()
    async with async_session_factory() as session:
        control = await session.get(AdminControlSettings, 1)
        if control is None:
            control = AdminControlSettings(id=1)
            session.add(control)
            await session.commit()
            previous = {field: getattr(control, field) for field in _CONTROL_FIELDS}
        else:
            previous = {field: getattr(control, field) for field in _CONTROL_FIELDS}
    yield
    routing_state.reset()
    async with async_session_factory() as session:
        control = await session.get(AdminControlSettings, 1)
        for field, value in previous.items():
            setattr(control, field, value)
        await session.commit()


async def _set_control(session, *, mode: str = "automatic", **overrides) -> AdminControlSettings:
    control = await session.get(AdminControlSettings, 1)
    control.management_mode = mode
    control.emergency_stop = False
    control.automatic_failover = True
    control.auto_disable_unhealthy = True
    control.auto_recover_credentials = True
    control.rate_limit_cooldown_seconds = 60
    control.circuit_breaker_failure_threshold = 3
    control.circuit_breaker_cooldown_seconds = 300
    for field, value in overrides.items():
        setattr(control, field, value)
    await session.commit()
    return control


async def _make_provider(session, strategy: str = "priority", **kwargs) -> ProviderAccount:
    provider = ProviderAccount(
        provider_name=f"test-{uuid.uuid4().hex[:12]}",
        display_name="Test Provider",
        default_routing_strategy=strategy,
        global_monthly_budget_usd=10_000,
        **kwargs,
    )
    session.add(provider)
    await session.flush()
    return provider


async def _make_credential(session, provider: ProviderAccount, *, priority: int = 1, **kwargs) -> ProviderCredential:
    secret = f"sk-test-{uuid.uuid4().hex}"
    encrypted, secret_hash, prefix = encrypt_credential_secret(secret)
    credential = ProviderCredential(
        provider_id=provider.id,
        label=f"Token {priority}",
        key_prefix=prefix,
        encrypted_secret=encrypted,
        secret_hash=secret_hash,
        priority=priority,
        **kwargs,
    )
    session.add(credential)
    await session.flush()
    return credential


async def _admin_headers() -> dict[str, str]:
    async with async_session_factory() as session:
        admin = User(
            email=f"admin-{uuid.uuid4().hex[:8]}@weirwise.local",
            full_name="Routing Admin",
            hashed_password=hash_password("Password123!"),
            is_active=True,
            is_superuser=True,
        )
        session.add(admin)
        await session.commit()
        admin_id = admin.id
    return {"Authorization": f"Bearer {create_jwt_token({'sub': str(admin_id)}, timedelta(minutes=30))}"}


# 1 + 2: Multi-token registration and validation before activation.
@pytest.mark.asyncio
async def test_multi_token_registration_validates_before_activating(monkeypatch):
    async def fake_validate(provider_name: str, token: str) -> dict:
        if token.startswith("good"):
            return {"valid": True, "remaining_balance": "42"}
        return {"valid": False, "error": "Invalid or expired API token.", "status_code": 401}

    monkeypatch.setattr(TokenManager, "validate_provider_token", staticmethod(fake_validate))

    async with async_session_factory() as session:
        provider_name = f"pool-{uuid.uuid4().hex[:8]}"
        results = await TokenManager.validate_and_save_provider_tokens(
            provider_name,
            "good-one\n good-two ,bad-three",
            uuid.uuid4(),
            "admin@weirwise.local",
            session,
        )

        assert [item["status"] for item in results] == ["active", "active", "error"]
        assert all("good-one" not in str(item) and "bad-three" not in str(item) for item in results)

        provider = (
            await session.execute(
                ProviderAccount.__table__.select().where(ProviderAccount.provider_name == provider_name)
            )
        ).first()
        assert provider is not None

        from sqlalchemy import func, select

        total = await session.scalar(
            select(func.count(ProviderCredential.id)).where(ProviderCredential.provider_id == provider.id)
        )
        active = await session.scalar(
            select(func.count(ProviderCredential.id)).where(
                ProviderCredential.provider_id == provider.id,
                ProviderCredential.is_active.is_(True),
            )
        )
        assert total == 3
        assert active == 2


# 3: Manual mode pins the configured token and never silently rotates.
@pytest.mark.asyncio
async def test_manual_mode_does_not_rotate_to_backup():
    async with async_session_factory() as session:
        await _set_control(session, mode="manual")
        provider = await _make_provider(session)
        primary = await _make_credential(session, provider, priority=1)
        await _make_credential(session, provider, priority=2)
        await session.commit()

        await IntelligentRoutingEngine.record_failure(
            session,
            str(primary.id),
            error_type="rate_limit",
            reason="429 too many requests",
            is_rate_limit=True,
            retry_after_seconds=120,
        )
        # Manual mode intentionally skips automatic health mutation, so model
        # an admin-marked unavailable primary directly.
        await session.refresh(primary)
        primary.health_status = CredentialHealthStatus.RATE_LIMITED.value
        primary.cooling_down_until = datetime.now(UTC) + timedelta(minutes=5)
        await session.commit()

        assert await IntelligentRoutingEngine.select_credential(session, provider.provider_name) is None

        events = (
            await session.execute(
                RoutingEvent.__table__.select().where(RoutingEvent.provider_name == provider.provider_name)
            )
        ).all()
        assert any("primary_unavailable_manual_mode" in (event.decision_reason or "") for event in events)


# 3 (API surface): Mode switching persists through the admin control endpoint.
@pytest.mark.asyncio
async def test_admin_mode_switching_persists():
    headers = await _admin_headers()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        automated = await client.patch(
            "/api/v1/admin/operations/settings",
            headers=headers,
            json={"management_mode": "automatic"},
        )
        assert automated.status_code == 200
        assert automated.json()["management_mode"] == "automatic"

        manual = await client.patch(
            "/api/v1/admin/operations/settings",
            headers=headers,
            json={"management_mode": "manual"},
        )
        assert manual.status_code == 200
        assert manual.json()["management_mode"] == "manual"


# 4: Selection only picks healthy tokens.
@pytest.mark.asyncio
async def test_selection_skips_unhealthy_tokens():
    async with async_session_factory() as session:
        await _set_control(session)
        provider = await _make_provider(session)
        unhealthy = await _make_credential(session, provider, priority=1)
        healthy = await _make_credential(session, provider, priority=2)
        unhealthy.health_status = CredentialHealthStatus.FAILED.value
        unhealthy.is_active = False
        await session.commit()

        resolution = await IntelligentRoutingEngine.select_credential(session, provider.provider_name)
        assert resolution is not None
        assert resolution.credential.id == healthy.id


# 5: Policy distribution (round robin) spreads work across the pool.
@pytest.mark.asyncio
async def test_round_robin_policy_distributes_requests():
    async with async_session_factory() as session:
        await _set_control(session)
        provider = await _make_provider(session, strategy=ProviderRoutingStrategy.ROUND_ROBIN.value)
        credentials = [await _make_credential(session, provider, priority=index) for index in (1, 2, 3)]
        await session.commit()

        selected = []
        for _ in range(3):
            resolution = await IntelligentRoutingEngine.select_credential(session, provider.provider_name)
            assert resolution is not None
            selected.append(resolution.credential.id)

        assert set(selected) == {credential.id for credential in credentials}


# 6: A 429 is classified, marked rate limited, and cooled down for at least Retry-After.
@pytest.mark.asyncio
async def test_rate_limit_detection_sets_cooldown():
    async with async_session_factory() as session:
        await _set_control(session)
        provider = await _make_provider(session)
        credential = await _make_credential(session, provider)
        await session.commit()

        before = datetime.now(UTC)
        await IntelligentRoutingEngine.record_failure(
            session,
            str(credential.id),
            error_type="RateLimitError",
            reason="429 Too Many Requests",
            is_rate_limit=True,
            retry_after_seconds=120,
        )
        await session.refresh(credential)

        assert credential.health_status == CredentialHealthStatus.RATE_LIMITED.value
        assert credential.cooling_down_until is not None
        cooldown = credential.cooling_down_until
        if cooldown.tzinfo is None:
            cooldown = cooldown.replace(tzinfo=UTC)
        assert cooldown >= before + timedelta(seconds=119)
        assert credential.is_active is True


# 7: Invalid or expired tokens are failed and removed from rotation.
@pytest.mark.asyncio
async def test_auth_failure_disables_expired_token():
    async with async_session_factory() as session:
        await _set_control(session)
        provider = await _make_provider(session)
        credential = await _make_credential(session, provider)
        await session.commit()

        await IntelligentRoutingEngine.record_failure(
            session,
            str(credential.id),
            error_type="AuthenticationError",
            reason="401 Invalid API key",
            error_category="auth",
        )
        await session.refresh(credential)

        assert credential.health_status == CredentialHealthStatus.FAILED.value
        assert credential.is_active is False
        assert await IntelligentRoutingEngine.select_credential(session, provider.provider_name) is None


# 8: Tokens on cooldown are skipped while they are cooling down.
@pytest.mark.asyncio
async def test_cooldown_skips_token_until_expiry():
    async with async_session_factory() as session:
        await _set_control(session, auto_recover_credentials=False)
        provider = await _make_provider(session)
        first = await _make_credential(session, provider, priority=1)
        second = await _make_credential(session, provider, priority=2)
        first.health_status = CredentialHealthStatus.RATE_LIMITED.value
        first.cooling_down_until = datetime.now(UTC) + timedelta(minutes=5)
        await session.commit()

        resolution = await IntelligentRoutingEngine.select_credential(session, provider.provider_name)
        assert resolution is not None
        assert resolution.credential.id == second.id

        first.cooling_down_until = datetime.now(UTC) - timedelta(seconds=1)
        await session.commit()
        resolution_after = await IntelligentRoutingEngine.select_credential(session, provider.provider_name)
        # Recovery is disabled, so the still-rate-limited token must not be used.
        assert resolution_after is not None
        assert resolution_after.credential.id == second.id


# 9: Automatic recovery returns an expired cooldown to service.
@pytest.mark.asyncio
async def test_auto_recovery_restores_token_after_cooldown():
    async with async_session_factory() as session:
        await _set_control(session)
        provider = await _make_provider(session)
        credential = await _make_credential(session, provider)
        credential.health_status = CredentialHealthStatus.RATE_LIMITED.value
        credential.cooling_down_until = datetime.now(UTC) - timedelta(seconds=1)
        credential.consecutive_failures = 2
        await session.commit()

        resolution = await IntelligentRoutingEngine.select_credential(session, provider.provider_name)
        assert resolution is not None
        assert resolution.credential.id == credential.id
        await session.refresh(credential)
        assert credential.health_status == CredentialHealthStatus.HEALTHY.value
        assert credential.cooling_down_until is None


# 10: Failover moves to the next healthy token after a failure.
@pytest.mark.asyncio
async def test_failover_to_secondary_token():
    async with async_session_factory() as session:
        await _set_control(session)
        provider = await _make_provider(session)
        primary = await _make_credential(session, provider, priority=1)
        backup = await _make_credential(session, provider, priority=2)
        await session.commit()

        await IntelligentRoutingEngine.record_failure(
            session,
            str(primary.id),
            error_type="rate_limit",
            reason="429",
            is_rate_limit=True,
        )
        resolution = await IntelligentRoutingEngine.select_credential(
            session,
            provider.provider_name,
            exclude_ids={str(primary.id)},
            attempt_number=2,
            is_failover=True,
        )
        assert resolution is not None
        assert resolution.credential.id == backup.id
        assert resolution.is_failover is True


# 11: Account-wide quota caps apply across every token (rotation cannot bypass them).
@pytest.mark.asyncio
async def test_account_rpm_shared_across_tokens_blocks_rotation():
    async with async_session_factory() as session:
        await _set_control(session)
        provider = await _make_provider(session, account_rate_limit_rpm=2)
        await _make_credential(session, provider, priority=1)
        await _make_credential(session, provider, priority=2)
        await session.commit()

        first = await IntelligentRoutingEngine.select_credential(session, provider.provider_name, reserve_slot=True)
        assert first is not None
        routing_state.release(first.limiter_keys)
        second = await IntelligentRoutingEngine.select_credential(session, provider.provider_name, reserve_slot=True)
        assert second is not None
        routing_state.release(second.limiter_keys)

        blocked = await IntelligentRoutingEngine.select_credential(session, provider.provider_name, reserve_slot=True)
        assert blocked is None
        events = (
            await session.execute(
                RoutingEvent.__table__.select().where(
                    RoutingEvent.provider_name == provider.provider_name,
                    RoutingEvent.outcome == "no_credential",
                )
            )
        ).all()
        assert any("provider_account_rpm_limit" in (event.decision_reason or "") for event in events)


# 11 (TPM): Shared account token budget cannot be exceeded by switching tokens.
@pytest.mark.asyncio
async def test_account_tpm_shared_across_tokens():
    async with async_session_factory() as session:
        await _set_control(session)
        provider = await _make_provider(session, account_rate_limit_tpm=100)
        await _make_credential(session, provider, priority=1)
        await _make_credential(session, provider, priority=2)
        await session.commit()

        first = await IntelligentRoutingEngine.select_credential(
            session, provider.provider_name, estimated_tokens=80, reserve_slot=True
        )
        assert first is not None
        routing_state.release(first.limiter_keys)

        blocked = await IntelligentRoutingEngine.select_credential(
            session, provider.provider_name, estimated_tokens=80, reserve_slot=True
        )
        assert blocked is None


# 12: Concurrency slots are enforced per token and per account.
@pytest.mark.asyncio
async def test_concurrency_limit_blocks_parallel_requests():
    async with async_session_factory() as session:
        await _set_control(session)
        provider = await _make_provider(session, account_max_concurrency=1)
        credential = await _make_credential(session, provider, max_concurrency=1)
        await session.commit()

        first = await IntelligentRoutingEngine.select_credential(session, provider.provider_name, reserve_slot=True)
        assert first is not None

        blocked = await IntelligentRoutingEngine.select_credential(session, provider.provider_name, reserve_slot=True)
        assert blocked is None

        routing_state.release(first.limiter_keys)
        after_release = await IntelligentRoutingEngine.select_credential(
            session, provider.provider_name, reserve_slot=True
        )
        assert after_release is not None
        assert after_release.credential.id == credential.id
        routing_state.release(after_release.limiter_keys)


# 13: Retry policy is bounded/jittered and non-retryable failures are not retried.
@pytest.mark.asyncio
async def test_retry_policy_is_bounded_and_classified():
    assert llm._NON_RETRYABLE_CATEGORIES == {"auth", "quota", "invalid_request"}

    for attempt in range(1, 6):
        for _ in range(20):
            delay = llm._retry_delay_seconds(attempt, "provider", None)
            assert 0 < delay <= 2.5
        rate_delay = llm._retry_delay_seconds(attempt, "rate_limit", retry_after=30)
        assert 0 < rate_delay <= 5.5

    assert llm._error_category(llm.ProviderCallError("429 rate limit", is_rate_limit=True)) == "rate_limit"
    assert llm._error_category(llm.ProviderCallError("401 unauthorized", status_code=401)) == "auth"
    assert llm._error_category(llm.ProviderCallError("insufficient_quota", status_code=400)) == "quota"
    assert llm._error_category(llm.ProviderCallError("bad request", status_code=400)) == "invalid_request"
    assert llm._error_category(llm.ProviderCallError("timed out", status_code=504)) == "timeout"
    assert llm._error_category(llm.ProviderCallError("upstream 503 unavailable", status_code=503)) == "connection"


# 14: A full outage returns no credential and records the decision.
@pytest.mark.asyncio
async def test_provider_outage_records_no_credential():
    async with async_session_factory() as session:
        await _set_control(session)
        provider = await _make_provider(session)
        credential = await _make_credential(session, provider)
        credential.is_active = False
        credential.health_status = CredentialHealthStatus.FAILED.value
        await session.commit()

        assert await IntelligentRoutingEngine.select_credential(session, provider.provider_name) is None
        events = (
            await session.execute(
                RoutingEvent.__table__.select().where(RoutingEvent.provider_name == provider.provider_name)
            )
        ).all()
        assert any(event.outcome == "no_credential" for event in events)


# 15: RBAC protects the new observability and health surfaces.
@pytest.mark.asyncio
async def test_rbac_on_overview_and_health_check():
    async with async_session_factory() as session:
        regular = User(
            email=f"user-{uuid.uuid4().hex[:8]}@example.com",
            full_name="Regular",
            hashed_password=hash_password("Password123!"),
            is_active=True,
            is_superuser=False,
        )
        session.add(regular)
        await session.commit()
        regular_token = create_jwt_token({"sub": str(regular.id)}, timedelta(minutes=30))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers = {"Authorization": f"Bearer {regular_token}"}
        overview = await client.get("/api/v1/admin/routing/overview", headers=headers)
        assert overview.status_code == 403
        health = await client.post(f"/api/v1/admin/providers/{uuid.uuid4()}/health-check", headers=headers)
        assert health.status_code == 403


# 16: Provider/credential APIs and observability never expose plaintext secrets.
@pytest.mark.asyncio
async def test_observability_never_leaks_secrets(monkeypatch):
    async def accept(provider_name: str, token: str) -> dict:
        return {"valid": True}

    monkeypatch.setattr(TokenManager, "validate_provider_token", staticmethod(accept))
    headers = await _admin_headers()
    plaintext = "sk-live-plaintext-should-never-leak-123"
    provider_name = f"secret-{uuid.uuid4().hex[:8]}"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        provider_res = await client.post(
            "/api/v1/admin/providers",
            headers=headers,
            json={"provider_name": provider_name, "display_name": "Secret Provider"},
        )
        assert provider_res.status_code == 201
        provider_id = provider_res.json()["id"]

        credential_res = await client.post(
            f"/api/v1/admin/providers/{provider_id}/credentials",
            headers=headers,
            json={"label": "Secret Token", "secret": plaintext, "rate_limit_tpm": 5000, "max_concurrency": 2},
        )
        assert credential_res.status_code == 201
        assert plaintext not in credential_res.text
        assert credential_res.json()["max_concurrency"] == 2

        overview = await client.get("/api/v1/admin/routing/overview", headers=headers)
        assert overview.status_code == 200
        assert plaintext not in overview.text

        health = await client.post(f"/api/v1/admin/providers/{provider_id}/health-check", headers=headers)
        assert health.status_code == 200
        assert plaintext not in health.text


# 17: Usage and cost are recorded once, including reserved-token accounting.
@pytest.mark.asyncio
async def test_usage_and_cost_accounting_is_accurate():
    async with async_session_factory() as session:
        await _set_control(session)
        provider = await _make_provider(session)
        credential = await _make_credential(session, provider, rate_limit_tpm=10_000)
        await session.commit()

        resolution = await IntelligentRoutingEngine.select_credential(
            session, provider.provider_name, estimated_tokens=90, reserve_slot=True
        )
        assert resolution is not None
        routing_state.release(resolution.limiter_keys)

        await IntelligentRoutingEngine.record_success(
            session,
            credential_id=str(credential.id),
            user_id=str(uuid.uuid4()),
            provider_name=provider.provider_name,
            model_name="gpt-4o-mini",
            input_tokens=80,
            output_tokens=20,
            cost_usd=0.00042,
            latency_ms=123,
            routing_id=resolution.routing_id,
            reserved_input_tokens=90,
        )

        await session.refresh(credential)
        await session.refresh(provider)

        assert float(credential.current_month_spend_usd) == pytest.approx(0.00042)
        assert float(provider.current_month_spend_usd) == pytest.approx(0.00042)
        assert credential.total_tokens_served == 100

        snapshot = routing_state.snapshot(f"cred:{credential.id}")
        # 90 estimated tokens reserved during selection, then the 20 generated tokens.
        assert snapshot["tpm_used"] == 110

        ledger = (
            await session.execute(
                TokenCostLedger.__table__.select().where(TokenCostLedger.credential_id == credential.id)
            )
        ).all()
        assert len(ledger) == 1
        assert ledger[0].total_tokens == 100
        assert float(ledger[0].cost_usd) == pytest.approx(0.00042)

        events = (
            await session.execute(
                RoutingEvent.__table__.select().where(RoutingEvent.routing_id == resolution.routing_id)
            )
        ).all()
        assert events and events[0].outcome == "success"


# 19: TokenManager execute_with_failover seamlessly rotates upon 429/401 and updates telemetry
@pytest.mark.asyncio
async def test_token_manager_execute_with_failover_and_telemetry(monkeypatch):
    """Verify that TokenManager.execute_with_failover:
    - Retries with secondary credential when primary gets 429 (rate-limited)
    - Records cooldown_until, last_failure_at, last_used_at on the failed credential
    - Marks primary as rate_limited and keeps secondary active
    - Successfully returns secondary credential's response
    """

    async def fake_validate(provider_name: str, token: str) -> dict:
        return {"valid": True, "remaining_balance": "100"}

    monkeypatch.setattr(TokenManager, "validate_provider_token", staticmethod(fake_validate))

    provider_name = f"failover-{uuid.uuid4().hex[:8]}"

    async with async_session_factory() as session:
        # Register 2 valid tokens
        results = await TokenManager.validate_and_save_provider_tokens(
            provider_name,
            "token-alpha-123\ntoken-beta-456",
            uuid.uuid4(),
            "admin@weirwise.local",
            session,
        )
        assert len(results) == 2
        assert results[0]["status"] == "active"
        assert results[1]["status"] == "active"

        # Simulate request_func: fails on token-alpha with HTTP 429, succeeds on token-beta
        calls = []

        async def fake_request(token: str):
            calls.append(token)
            if "alpha" in token:
                req = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
                resp = httpx.Response(429, request=req)
                raise httpx.HTTPStatusError("Rate limited", request=req, response=resp)
            return {"result": "success_from_beta"}

        outcome = await TokenManager.execute_with_failover(provider_name, fake_request, session)
        assert outcome == {"result": "success_from_beta"}
        assert len(calls) == 2

        # Verify credential telemetry and status in database
        provider = (
            await session.execute(
                ProviderAccount.__table__.select().where(ProviderAccount.provider_name == provider_name)
            )
        ).first()

        creds = (
            await session.execute(
                ProviderCredential.__table__.select()
                .where(ProviderCredential.provider_id == provider.id)
                .order_by(ProviderCredential.priority.asc())
            )
        ).all()

        cred1, cred2 = creds[0], creds[1]

        # Primary failed with 429 -> RATE_LIMITED, cooldown set, failure timestamp recorded
        assert cred1.health_status == CredentialHealthStatus.RATE_LIMITED.value
        assert cred1.consecutive_failures == 1
        assert cred1.cooling_down_until is not None
        assert cred1.last_failure_at is not None
        assert cred1.last_used_at is not None
        assert cred1.is_active is True  # Rate-limited does not permanently deactivate

        # Secondary succeeded -> HEALTHY, success timestamp recorded
        assert cred2.health_status == CredentialHealthStatus.HEALTHY.value
        assert cred2.consecutive_failures == 0
        assert cred2.last_success_at is not None
        assert cred2.last_used_at is not None
        assert cred2.is_active is True
