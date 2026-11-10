"""E2E Verification of AI Request Routing, Credential Selection, and FinOps Ledger attribution."""

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
    TokenCostLedger,
)
from backend.app.models.assistant import Assistant, AssistantStatus
from backend.app.models.auth import User
from backend.app.services.vault import encrypt_credential_secret
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

pytestmark = pytest.mark.asyncio


async def test_chat_does_not_record_provider_usage_without_provider_execution():
    """Verify retrieval-only chat does not fabricate provider usage or cost ledger entries."""
    async with async_session_factory() as session:
        # 1. Setup User and Assistant directly
        u = User(
            email=f"e2e-chat-{uuid.uuid4().hex[:6]}@weirwise.local",
            full_name="E2E Chat Tester",
            hashed_password=hash_password("Password123!"),
            is_active=True,
            is_superuser=False,
        )
        session.add(u)
        await session.flush()

        asst = Assistant(
            user_id=u.id,
            name="FinOps Routing Assistant",
            model="Auto",
            status=AssistantStatus.PUBLISHED.value,
            top_k=2,
            score_threshold=0.5,
        )
        session.add(asst)

        # 2. Setup AI Provider and Credential Pool (query or create)
        p_res = await session.execute(select(ProviderAccount).where(ProviderAccount.provider_name == "openai"))
        p = p_res.scalar_one_or_none()
        if not p:
            p = ProviderAccount(
                provider_name="openai",
                display_name="OpenAI Global Pool",
                default_routing_strategy=ProviderRoutingStrategy.PRIORITY.value,
                global_monthly_budget_usd=5000.0,
            )
            session.add(p)
            await session.flush()

        enc, secret_hash, prefix = encrypt_credential_secret("sk-proj-e2e-real-key-889900")
        cred = ProviderCredential(
            provider_id=p.id,
            label="E2E Pool Key",
            key_prefix=prefix,
            encrypted_secret=enc,
            secret_hash=secret_hash,
            priority=10,
            monthly_budget_usd=1000.0,
        )
        session.add(cred)
        await session.commit()

        user_id = u.id
        assistant_id = asst.id
        cred_id = cred.id

    token = create_jwt_token({"sub": str(user_id)}, timedelta(minutes=30))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Execute chat request through platform API
        res = await client.post(
            f"/api/v1/assistants/{assistant_id}/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": "What is our corporate policy regarding travel expense reimbursements?"},
        )
        assert res.status_code == 200
        data = res.json()
        assert "conversation_id" in data
        assert "content" in data

    # Configured credentials remain untouched until the chat path executes a real provider request.
    async with async_session_factory() as session:
        ledger_stmt = select(TokenCostLedger).where(
            TokenCostLedger.credential_id == cred_id,
        )
        ledger_entries = (await session.execute(ledger_stmt)).scalars().all()
        assert ledger_entries == []

        c = await session.get(ProviderCredential, cred_id)
        assert c.total_requests_served == 0
        assert c.total_tokens_served == 0
        assert c.current_month_spend_usd == 0
