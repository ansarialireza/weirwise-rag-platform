"""Integration tests for SaaS plans, usage tracking, and entitlement enforcement."""

import uuid

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_get_subscription_plans():
    res = client.get("/api/v1/plans")
    assert res.status_code == 200
    plans = res.json()
    assert len(plans) >= 2
    tiers = [p["tier"] for p in plans]
    assert any("free" in t for t in tiers)


def test_workspace_billing_status_and_upgrade():
    # 1. Register User & Login
    uid = uuid.uuid4().hex[:8]
    email = f"billing_user_{uid}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Billing User"},
    )
    assert reg.status_code == 201

    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create Workspace
    ws_res = client.post(
        "/api/v1/workspaces",
        headers=headers,
        json={"name": "SaaS Billing Org"},
    )
    assert ws_res.status_code == 201
    workspace_id = ws_res.json()["id"]

    # 3. Retrieve Workspace Billing Details
    billing_res = client.get(
        f"/api/v1/workspaces/{workspace_id}/billing",
        headers=headers,
    )
    assert billing_res.status_code == 200
    billing_data = billing_res.json()
    assert billing_data["workspace_id"] == workspace_id
    assert "free" in billing_data["plan_tier"]
    assert billing_data["chat_turns_used"] == 0

    # 4. Change Plan to Pro
    upgrade_res = client.post(
        f"/api/v1/workspaces/{workspace_id}/billing/change-plan",
        headers=headers,
        json={"target_tier": "pro"},
    )
    assert upgrade_res.status_code == 200
    assert "pro" in upgrade_res.json()["plan_tier"].lower()


def test_assistant_creation_entitlement_enforcement():
    uid = uuid.uuid4().hex[:8]
    email = f"entitlement_user_{uid}@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Entitlement User"},
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Workspace on Free tier (limit: 2 assistants)
    ws_res = client.post(
        "/api/v1/workspaces",
        headers=headers,
        json={"name": "Entitlement Org"},
    )
    ws_id = ws_res.json()["id"]

    proj_res = client.post(
        f"/api/v1/workspaces/{ws_id}/projects",
        headers=headers,
        json={"name": "Main Project"},
    )
    proj_id = proj_res.json()["id"]

    # 1st Assistant
    a1 = client.post(
        f"/api/v1/projects/{proj_id}/assistants",
        headers=headers,
        json={"name": "Assistant One"},
    )
    assert a1.status_code == 201

    # 2nd Assistant
    a2 = client.post(
        f"/api/v1/projects/{proj_id}/assistants",
        headers=headers,
        json={"name": "Assistant Two"},
    )
    assert a2.status_code == 201

    # 3rd Assistant should exceed Free Tier quota
    a3 = client.post(
        f"/api/v1/projects/{proj_id}/assistants",
        headers=headers,
        json={"name": "Assistant Three"},
    )
    assert a3.status_code == 403
    err_detail = str(a3.json()["detail"])
    assert "Assistant creation limit reached" in err_detail or "quota_exceeded" in err_detail


def test_quota_graceful_blocking_chat_and_storage():
    """Verify that exceeding chat turns or storage quotas returns a clean HTTP 403
    with structured payload and never triggers a 500 Internal Server Error.
    """
    import asyncio
    import io

    from backend.app.db.session import async_session_factory

    uid = uuid.uuid4().hex[:8]
    email = f"quota_test_{uid}@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Quota Tester"},
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    ws_res = client.post(
        "/api/v1/workspaces",
        headers=headers,
        json={"name": "Quota Org"},
    )
    ws_id = ws_res.json()["id"]

    proj_res = client.post(
        f"/api/v1/workspaces/{ws_id}/projects",
        headers=headers,
        json={"name": "Quota Project"},
    )
    proj_id = proj_res.json()["id"]

    asst_res = client.post(
        f"/api/v1/projects/{proj_id}/assistants",
        headers=headers,
        json={"name": "Quota Assistant", "model": "Fast"},
    )
    asst_id = asst_res.json()["id"]

    # Manually push the entitlement counter past the 100 message quota
    async def inject_usage():
        from backend.app.services.metering import metering_service

        async with async_session_factory() as session:
            entitlement = await metering_service.get_or_create_entitlements(session, uuid.UUID(ws_id))
            entitlement.current_period_chat_turns = 150
            await session.commit()

    asyncio.run(inject_usage())

    # Execute studio chat - must return clean 403 and never 500
    chat_res = client.post(
        f"/api/v1/assistants/{asst_id}/chat",
        headers=headers,
        json={"message": "Hello world"},
    )
    assert chat_res.status_code == 403
    data = chat_res.json()
    assert "detail" in data
    assert data["detail"]["error"] == "quota_exceeded"
    assert data["detail"]["resource"] == "chat_turns"
    assert "Upgrade required" in data["detail"]["message"]

    # Test storage quota check
    source_res = client.post(
        f"/api/v1/projects/{proj_id}/sources",
        headers=headers,
        json={"name": "File Store", "source_type": "file_upload"},
    )
    source_id = source_res.json()["id"]

    # Attempt to upload 60 MB file on 50 MB Free tier
    large_payload = b"X" * (60 * 1024 * 1024)
    files = [("files", ("large_test.txt", io.BytesIO(large_payload), "text/plain"))]
    upload_res = client.post(
        f"/api/v1/sources/{source_id}/documents/upload",
        headers=headers,
        files=files,
    )
    assert upload_res.status_code in (403, 413)
    assert upload_res.status_code != 500
