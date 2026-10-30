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
from backend.app.models.auth import Membership, User, Workspace
from backend.app.models.project import Project
from backend.app.services.vault import encrypt_credential_secret
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

pytestmark = pytest.mark.asyncio


async def test_live_chat_invokes_credential_routing_and_finops_ledger():
    """Verify that calling POST /api/v1/assistants/{id}/chat invokes IntelligentRoutingEngine
    and writes to TokenCostLedger."""
    async with async_session_factory() as session:
        # 1. Setup User, Workspace, Project, Assistant
        u = User(
            email=f"e2e-chat-{uuid.uuid4().hex[:6]}@weirwise.local",
            full_name="E2E Chat Tester",
            hashed_password=hash_password("Password123!"),
            is_active=True,
            is_superuser=False,
        )
        session.add(u)
        await session.flush()

        ws = Workspace(name="E2E Chat Workspace", slug=f"e2e-ws-{uuid.uuid4().hex[:6]}")
        session.add(ws)
        await session.flush()

        mem = Membership(workspace_id=ws.id, user_id=u.id, role="owner")
        session.add(mem)

        proj = Project(workspace_id=ws.id, name="E2E Project", slug=f"proj-{uuid.uuid4().hex[:6]}")
        session.add(proj)
        await session.flush()

        asst = Assistant(
            project_id=proj.id,
            name="FinOps Routing Assistant",
            model="gpt-4o-mini",
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
        ws_id = ws.id
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

    # Verify that TokenCostLedger recorded the usage for this workspace & credential
    async with async_session_factory() as session:
        ledger_stmt = select(TokenCostLedger).where(
            TokenCostLedger.workspace_id == ws_id,
            TokenCostLedger.credential_id == cred_id,
        )
        ledger_entries = (await session.execute(ledger_stmt)).scalars().all()
        assert len(ledger_entries) == 1
        entry = ledger_entries[0]
        assert entry.provider_name == "openai"
        assert entry.model_name == "gpt-4o-mini"
        assert entry.total_tokens > 0
        assert entry.cost_usd > 0
        assert entry.is_success is True

        # Verify credential metrics were updated in pool
        c = await session.get(ProviderCredential, cred_id)
        assert c.total_requests_served >= 1
        assert c.total_tokens_served > 0
        assert c.current_month_spend_usd > 0
