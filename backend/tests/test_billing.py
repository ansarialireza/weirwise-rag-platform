"""Integration tests for SaaS plans, usage tracking, and entitlement enforcement."""

import uuid

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_get_subscription_plans():
    res = client.get("/api/v1/plans")
    assert res.status_code == 200
    plans = res.json()
    assert len(plans) >= 3
    tiers = [p["tier"] for p in plans]
    assert "free" in tiers
    assert "starter" in tiers
    assert "enterprise" in tiers


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
    assert billing_data["plan_tier"] == "free"
    assert billing_data["chat_turns_used"] == 0

    # 4. Change Plan to Starter
    upgrade_res = client.post(
        f"/api/v1/workspaces/{workspace_id}/billing/change-plan",
        headers=headers,
        json={"target_tier": "starter"},
    )
    assert upgrade_res.status_code == 200
    assert upgrade_res.json()["plan_tier"] == "starter"


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
    assert "Assistant creation limit reached" in a3.json()["detail"]
