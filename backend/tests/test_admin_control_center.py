"""Comprehensive tests for Super Admin Control Center, Vault Encryption, and Intelligent Routing."""

import uuid
from datetime import timedelta

import pytest
from backend.app.core.security import create_jwt_token, hash_password
from backend.app.db.session import async_session_factory
from backend.app.main import app
from backend.app.models.admin import (
    AdminControlSettings,
    ProviderAccount,
    ProviderCredential,
    ProviderRoutingStrategy,
)
from backend.app.models.auth import User
from backend.app.services.routing_engine import IntelligentRoutingEngine
from backend.app.services.token_manager import TokenManager
from backend.app.services.vault import decrypt_credential_secret, encrypt_credential_secret
from httpx import ASGITransport, AsyncClient


def test_vault_encryption_decryption():
    """Verify AES-CBC/HMAC-SHA256 encryption, zero plaintext exposure, and prefix masking."""
    raw_secret = "sk-proj-super-secret-api-key-998877"
    encrypted, secret_hash, prefix = encrypt_credential_secret(raw_secret)

    assert encrypted != raw_secret
    assert "super-secret" not in encrypted
    assert prefix == "sk-proj...8877"
    assert len(secret_hash) == 64

    # Verify lossless decryption
    decrypted = decrypt_credential_secret(encrypted)
    assert decrypted == raw_secret


@pytest.mark.asyncio
async def test_intelligent_routing_and_cooldown():
    """Test policy-based selection, priority routing, and automatic rate-limit cooldown."""
    async with async_session_factory() as session:
        control = await session.get(AdminControlSettings, 1)
        previous_control = None
        if control is None:
            control = AdminControlSettings(id=1)
            session.add(control)
        else:
            previous_control = {
                "management_mode": control.management_mode,
                "emergency_stop": control.emergency_stop,
                "automatic_failover": control.automatic_failover,
                "auto_disable_unhealthy": control.auto_disable_unhealthy,
                "auto_recover_credentials": control.auto_recover_credentials,
                "rate_limit_cooldown_seconds": control.rate_limit_cooldown_seconds,
                "circuit_breaker_failure_threshold": control.circuit_breaker_failure_threshold,
                "circuit_breaker_cooldown_seconds": control.circuit_breaker_cooldown_seconds,
            }
        control.management_mode = "automatic"
        control.emergency_stop = False
        control.automatic_failover = True
        control.auto_disable_unhealthy = True
        control.rate_limit_cooldown_seconds = 60
        await session.flush()

        p = ProviderAccount(
            provider_name=f"openai-{uuid.uuid4().hex[:6]}",
            display_name="OpenAI Test",
            default_routing_strategy=ProviderRoutingStrategy.PRIORITY.value,
            global_monthly_budget_usd=1000.0,
        )
        session.add(p)
        await session.flush()

        enc1, h1, pref1 = encrypt_credential_secret("sk-key-primary-12345")
        enc2, h2, pref2 = encrypt_credential_secret("sk-key-backup-67890")

        # Lower priority number means higher routing priority.
        c1 = ProviderCredential(
            provider_id=p.id,
            label="Primary Key",
            key_prefix=pref1,
            encrypted_secret=enc1,
            secret_hash=h1,
            priority=1,
        )
        c2 = ProviderCredential(
            provider_id=p.id,
            label="Backup Key",
            key_prefix=pref2,
            encrypted_secret=enc2,
            secret_hash=h2,
            priority=10,
        )
        session.add_all([c1, c2])
        await session.commit()

        # 1. Routing engine must select the lower-numbered (primary) credential
        resolution = await IntelligentRoutingEngine.select_credential(session, p.provider_name)
        assert resolution is not None
        assert resolution.credential.id == c1.id
        assert resolution.raw_secret == "sk-key-primary-12345"

        p.supported_models = ["allowed-model"]
        await session.commit()
        assert await IntelligentRoutingEngine.select_credential(session, p.provider_name, "blocked-model") is None
        allowed_resolution = await IntelligentRoutingEngine.select_credential(session, p.provider_name, "allowed-model")
        assert allowed_resolution is not None
        assert allowed_resolution.credential.id == c1.id
        p.supported_models = []
        await session.commit()

        # 2. Simulate 429 Rate Limit on the primary key
        await IntelligentRoutingEngine.record_failure(
            session, str(c1.id), error_type="RateLimitError", reason="429 Too Many Requests", is_rate_limit=True
        )

        control.automatic_failover = False
        await session.commit()
        assert await IntelligentRoutingEngine.select_credential(session, p.provider_name) is None

        control.automatic_failover = True
        await session.commit()

        # 3. Next resolution must failover cleanly to the healthy backup key
        failover_res = await IntelligentRoutingEngine.select_credential(session, p.provider_name)
        assert failover_res is not None
        assert failover_res.credential.id == c2.id
        assert failover_res.raw_secret == "sk-key-backup-67890"

        if previous_control is None:
            await session.delete(control)
        else:
            for field, value in previous_control.items():
                setattr(control, field, value)
        await session.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("provider", "url", "auth_header", "auth_prefix"),
    [
        ("openai", "https://api.openai.com/v1/models", "Authorization", "Bearer "),
        ("anthropic", "https://api.anthropic.com/v1/models", "x-api-key", ""),
        (
            "gemini",
            "https://generativelanguage.googleapis.com/v1beta/models",
            "x-goog-api-key",
            "",
        ),
        ("deepgram", "https://api.deepgram.com/v1/projects", "Authorization", "Token "),
        ("jina", "https://api.jina.ai/v1/models", "Authorization", "Bearer "),
        ("openrouter", "https://openrouter.ai/api/v1/auth/key", "Authorization", "Bearer "),
        ("resend", "https://api.resend.com/api-keys", "Authorization", "Bearer "),
    ],
)
async def test_provider_token_validation_uses_provider_auth_and_never_returns_secrets(
    monkeypatch,
    provider,
    url,
    auth_header,
    auth_prefix,
):
    observed: dict[str, object] = {}
    secret = "sensitive-provider-token-123"

    class FakeClient:
        def __init__(self, **kwargs):
            observed["client_options"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url, headers):
            observed["url"] = url
            observed["headers"] = headers
            observed["method"] = "GET"
            import httpx

            return httpx.Response(200, json={"data": []})

        async def post(self, url, headers, json):
            observed["url"] = url
            observed["headers"] = headers
            observed["method"] = "POST"
            observed["json"] = json
            import httpx

            return httpx.Response(200, json={"data": []})

    import backend.app.services.token_manager as token_manager

    monkeypatch.setattr(token_manager.httpx, "AsyncClient", FakeClient)
    result = await TokenManager.validate_provider_token(provider, secret)

    assert result["valid"] is True
    assert observed["url"] == ("https://api.jina.ai/v1/embeddings" if provider == "jina" else url)
    assert observed["method"] == ("POST" if provider == "jina" else "GET")
    if provider == "jina":
        assert observed["json"] == {"model": "jina-embeddings-v3", "input": ["credential validation"]}
    assert observed["headers"][auth_header] == f"{auth_prefix}{secret}"
    assert observed["client_options"]["follow_redirects"] is False
    assert secret not in str(result)


@pytest.mark.asyncio
async def test_provider_token_validation_rejects_unsupported_provider():
    result = await TokenManager.validate_provider_token("arbitrary-provider", "long-enough-token")

    assert result["valid"] is False
    assert result["error"] == "Provider validation is not supported."


@pytest.mark.asyncio
async def test_admin_api_rbac_and_endpoints(monkeypatch):
    """Test Super Admin RBAC access boundaries, system metrics, and credential vault endpoints."""

    async def accept_credential_validation(provider_name: str, token: str) -> dict[str, bool]:
        return {"valid": True}

    monkeypatch.setattr(TokenManager, "validate_provider_token", accept_credential_validation)

    async with async_session_factory() as session:
        # 1. Create standard non-admin user
        regular_user = User(
            email=f"user-{uuid.uuid4().hex[:6]}@example.com",
            full_name="Regular User",
            hashed_password=hash_password("Password123!"),
            is_active=True,
            is_superuser=False,
        )
        # 2. Create Superuser Admin
        super_admin = User(
            email=f"admin-{uuid.uuid4().hex[:6]}@weirwise.local",
            full_name="Super Administrator",
            hashed_password=hash_password("Password123!"),
            is_active=True,
            is_superuser=True,
        )
        session.add_all([regular_user, super_admin])
        await session.commit()
        reg_id = regular_user.id
        admin_id = super_admin.id

    token_regular = create_jwt_token({"sub": str(reg_id)}, timedelta(minutes=30))
    token_admin = create_jwt_token({"sub": str(admin_id)}, timedelta(minutes=30))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Non-admin user must receive 403 Forbidden
        denied_res = await client.get("/api/v1/admin/metrics", headers={"Authorization": f"Bearer {token_regular}"})
        assert denied_res.status_code == 403

        denied_access_res = await client.get(
            "/api/v1/admin/access",
            headers={"Authorization": f"Bearer {token_regular}"},
        )
        assert denied_access_res.status_code == 403

        # Super Admin accesses system metrics
        allowed_res = await client.get("/api/v1/admin/metrics", headers={"Authorization": f"Bearer {token_admin}"})
        assert allowed_res.status_code == 200
        metrics = allowed_res.json()
        assert "total_users" in metrics
        assert metrics["system_health"] != "healthy"

        access_res = await client.get("/api/v1/admin/access", headers={"Authorization": f"Bearer {token_admin}"})
        assert access_res.status_code == 200
        assert access_res.json() == {"is_admin": True, "role": "super_admin"}

        settings_res = await client.get(
            "/api/v1/admin/operations/settings",
            headers={"Authorization": f"Bearer {token_admin}"},
        )
        assert settings_res.status_code == 200
        original_cooldown = settings_res.json()["rate_limit_cooldown_seconds"]
        null_settings_res = await client.patch(
            "/api/v1/admin/operations/settings",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={"management_mode": None},
        )
        assert null_settings_res.status_code == 422
        update_settings_res = await client.patch(
            "/api/v1/admin/operations/settings",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={"rate_limit_cooldown_seconds": 120},
        )
        assert update_settings_res.status_code == 200
        persisted_settings_res = await client.get(
            "/api/v1/admin/operations/settings",
            headers={"Authorization": f"Bearer {token_admin}"},
        )
        assert persisted_settings_res.json()["rate_limit_cooldown_seconds"] == 120
        await client.patch(
            "/api/v1/admin/operations/settings",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={"rate_limit_cooldown_seconds": original_cooldown},
        )

        self_deactivation_res = await client.patch(
            f"/api/v1/admin/users/{admin_id}/status",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={"is_active": False},
        )
        assert self_deactivation_res.status_code == 409

        # Register provider and store encrypted credential via Admin API
        p_res = await client.post(
            "/api/v1/admin/providers",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={
                "provider_name": f"anthropic-{uuid.uuid4().hex[:6]}",
                "display_name": "Anthropic Claude",
                "default_routing_strategy": "round_robin",
                "global_monthly_budget_usd": 2000.0,
            },
        )
        assert p_res.status_code == 201
        p_data = p_res.json()
        provider_id = p_data["id"]

        # Provider configuration updates persist and reject invalid or unauthorized changes.
        provider_update_res = await client.patch(
            f"/api/v1/admin/providers/{provider_id}",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={
                "display_name": "Anthropic Production",
                "is_enabled": False,
                "default_routing_strategy": "lowest_cost",
                "global_monthly_budget_usd": 2500.0,
                "supported_models": ["claude-sonnet"],
            },
        )
        assert provider_update_res.status_code == 200, provider_update_res.text
        assert provider_update_res.json()["is_enabled"] is False
        provider_list_res = await client.get(
            "/api/v1/admin/providers", headers={"Authorization": f"Bearer {token_admin}"}
        )
        saved_provider = next(item for item in provider_list_res.json() if item["id"] == provider_id)
        assert saved_provider["display_name"] == "Anthropic Production"
        assert saved_provider["global_monthly_budget_usd"] == 2500.0
        assert saved_provider["supported_models"] == ["claude-sonnet"]
        invalid_provider_update_res = await client.patch(
            f"/api/v1/admin/providers/{provider_id}",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={"global_monthly_budget_usd": -1},
        )
        assert invalid_provider_update_res.status_code == 422
        null_provider_update_res = await client.patch(
            f"/api/v1/admin/providers/{provider_id}",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={"display_name": None},
        )
        assert null_provider_update_res.status_code == 422
        denied_provider_update_res = await client.patch(
            f"/api/v1/admin/providers/{provider_id}",
            headers={"Authorization": f"Bearer {token_regular}"},
            json={"is_enabled": True},
        )
        assert denied_provider_update_res.status_code == 403

        # Add credential to provider vault
        c_res = await client.post(
            f"/api/v1/admin/providers/{provider_id}/credentials",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={
                "label": "Claude Prod Key 1",
                "secret": "sk-ant-api-prod-super-secret-key-123",
                "priority": 5,
            },
        )
        assert c_res.status_code == 201
        c_data = c_res.json()
        # Verify secret is never in response
        assert "super-secret" not in str(c_data)
        assert c_data["key_prefix"].startswith("sk-ant-")
        credential_id = c_data["id"]

        disable_credential_res = await client.patch(
            f"/api/v1/admin/credentials/{credential_id}/status",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={"is_active": False},
        )
        assert disable_credential_res.status_code == 200
        assert disable_credential_res.json()["is_active"] is False
        enable_credential_res = await client.patch(
            f"/api/v1/admin/credentials/{credential_id}/status",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={"is_active": True},
        )
        assert enable_credential_res.status_code == 200
        assert enable_credential_res.json()["is_active"] is True
        assert "super-secret" not in enable_credential_res.text

        # Test FinOps economics summary
        fin_res = await client.get("/api/v1/admin/finops/summary", headers={"Authorization": f"Bearer {token_admin}"})
        assert fin_res.status_code == 200
        fin_data = fin_res.json()
        assert "total_revenue_usd" in fin_data
        assert "gross_margin_pct" in fin_data

        # Test Admin Tiers CRUD
        tiers_res = await client.get("/api/v1/admin/tiers", headers={"Authorization": f"Bearer {token_admin}"})
        assert tiers_res.status_code == 200
        tiers = tiers_res.json()
        assert len(tiers) >= 2

        new_tier_name = f"Enterprise Plus {uuid.uuid4().hex[:4]}"
        tier_create_res = await client.post(
            "/api/v1/admin/tiers",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={
                "name": new_tier_name,
                "monthly_price": 299.0,
                "max_assistants": 100,
                "max_monthly_messages": 50000,
                "max_storage_mb": 10000,
            },
        )
        assert tier_create_res.status_code == 201
        created_tier_id = tier_create_res.json()["id"]

        tier_patch_res = await client.patch(
            f"/api/v1/admin/tiers/{created_tier_id}",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={"monthly_price": 249.0},
        )
        assert tier_patch_res.status_code == 200
        assert tier_patch_res.json()["monthly_price"] == 249.0

        # Test Admin Routing Strategies CRUD
        routes_res = await client.get("/api/v1/admin/routing", headers={"Authorization": f"Bearer {token_admin}"})
        assert routes_res.status_code == 200
        routes = routes_res.json()
        assert len(routes) >= 3

        new_strat_res = await client.post(
            "/api/v1/admin/routing",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={
                "ui_name": f"Fast Ultra {uuid.uuid4().hex[:4]}",
                "ui_description": "Ultra low-latency streaming",
                "target_llm_model": "gpt-4o-mini",
                "is_active": True,
            },
        )
        assert new_strat_res.status_code == 201
        new_strat_id = new_strat_res.json()["id"]

        del_strat_res = await client.delete(
            f"/api/v1/admin/routing/{new_strat_id}",
            headers={"Authorization": f"Bearer {token_admin}"},
        )
        assert del_strat_res.status_code == 204
