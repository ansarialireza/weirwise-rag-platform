"""Comprehensive tests for Super Admin Control Center, Vault Encryption, and Intelligent Routing."""

import uuid
from datetime import timedelta

import pytest
from backend.app.core.security import create_jwt_token, hash_password
from backend.app.db.session import async_session_factory
from backend.app.main import app
from backend.app.models.admin import (
    ProviderAccount,
    ProviderCredential,
    ProviderRoutingStrategy,
)
from backend.app.models.auth import User
from backend.app.services.routing_engine import IntelligentRoutingEngine
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
        p = ProviderAccount(
            provider_name=f"openai-{uuid.uuid4().hex[:6]}",
            display_name="OpenAI Test",
            default_routing_strategy=ProviderRoutingStrategy.PRIORITY.value,
            global_monthly_budget_usd=1000.0,
        )
        session.add(p)
        await session.flush()

        enc1, h1, pref1 = encrypt_credential_secret("sk-key-low-priority-12345")
        enc2, h2, pref2 = encrypt_credential_secret("sk-key-high-priority-67890")

        c1 = ProviderCredential(
            provider_id=p.id,
            label="Backup Key",
            key_prefix=pref1,
            encrypted_secret=enc1,
            secret_hash=h1,
            priority=1,
        )
        c2 = ProviderCredential(
            provider_id=p.id,
            label="Primary Key",
            key_prefix=pref2,
            encrypted_secret=enc2,
            secret_hash=h2,
            priority=10,  # Higher priority
        )
        session.add_all([c1, c2])
        await session.commit()

        # 1. Routing engine must select higher priority credential (c2)
        resolution = await IntelligentRoutingEngine.select_credential(session, p.provider_name)
        assert resolution is not None
        assert resolution.credential.id == c2.id
        assert resolution.raw_secret == "sk-key-high-priority-67890"

        # 2. Simulate 429 Rate Limit on c2
        await IntelligentRoutingEngine.record_failure(
            session, str(c2.id), error_type="RateLimitError", reason="429 Too Many Requests", is_rate_limit=True
        )

        # 3. Next resolution must failover cleanly to healthy backup (c1)
        failover_res = await IntelligentRoutingEngine.select_credential(session, p.provider_name)
        assert failover_res is not None
        assert failover_res.credential.id == c1.id
        assert failover_res.raw_secret == "sk-key-low-priority-12345"


@pytest.mark.asyncio
async def test_admin_api_rbac_and_endpoints():
    """Test Super Admin RBAC access boundaries, system metrics, and credential vault endpoints."""
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

        # Super Admin accesses system metrics
        allowed_res = await client.get("/api/v1/admin/metrics", headers={"Authorization": f"Bearer {token_admin}"})
        assert allowed_res.status_code == 200
        metrics = allowed_res.json()
        assert "total_users" in metrics
        assert metrics["system_health"] == "healthy"

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

        # Test FinOps economics summary
        fin_res = await client.get("/api/v1/admin/finops/summary", headers={"Authorization": f"Bearer {token_admin}"})
        assert fin_res.status_code == 200
        fin_data = fin_res.json()
        assert "total_revenue_usd" in fin_data
        assert "gross_margin_pct" in fin_data
