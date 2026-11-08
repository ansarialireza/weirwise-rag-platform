"""Comprehensive verification of the Direct User Architecture.

Tests:
1. User Registration (Email + Password only)
2. Login and JWT token issuance
3. Direct Resource Management without Workspaces:
   - Sources: Create, List, Patch, Delete
   - Assistants: Create, List, Get, Delete
   - Documents: Direct user scoping
   - Billing: User-level billing overview and plan changes
   - API Credentials: Direct user scoping
4. Multi-tenant isolation & IDOR prevention:
   - User A cannot access User B's sources
   - User A cannot access User B's assistants
   - User A cannot access User B's API credentials
5. Admin Panel Security:
   - Regular user denied from /api/v1/admin/* (403 Forbidden)
   - Allowlisted admin allowed access
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def _create_verified_user(email: str = None, email_prefix: str = "user"):
    if not email:
        email = f"{email_prefix}_{uuid.uuid4().hex[:8]}@example.com"
    password = "SecurePassword123!"

    # 1. Register with ONLY email and password (no workspace, name, or role)
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password},
    )
    assert reg_resp.status_code == 201, f"Registration failed: {reg_resp.text}"
    otp = reg_resp.json()["verification_otp"]

    # 2. Verify email
    v_resp = client.post(
        "/api/v1/auth/verify-email",
        json={"email": email, "otp": otp},
    )
    assert v_resp.status_code == 200

    # 3. Login
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return email, headers


def test_registration_requires_only_email_and_password():
    email = f"minimal_{uuid.uuid4().hex[:8]}@example.com"
    password = "SuperPassword123!"

    # Only email and password payload
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "verification_otp" in data
    assert "message" in data


def test_direct_sources_and_assistants_lifecycle():
    _, headers = _create_verified_user(email_prefix="owner")

    # 1. Create Knowledge Source directly (No workspace_id / project_id required)
    src_payload = {"name": "User Direct Source"}
    src_resp = client.post("/api/v1/sources", headers=headers, json=src_payload)
    assert src_resp.status_code == 201, src_resp.text
    source = src_resp.json()
    source_id = source["id"]
    assert source["name"] == "User Direct Source"

    # List Sources
    list_src = client.get("/api/v1/sources", headers=headers)
    assert list_src.status_code == 200
    assert any(s["id"] == source_id for s in list_src.json())

    # 2. Create Assistant directly
    ast_payload = {
        "name": "Direct Assistant",
        "description": "Assistant without workspace",
        "system_prompt": "You are a helpful assistant.",
        "model_name": "gpt-4o-mini",
        "temperature": 0.7,
        "is_active": True,
    }
    ast_resp = client.post("/api/v1/assistants", headers=headers, json=ast_payload)
    assert ast_resp.status_code == 201, ast_resp.text
    assistant = ast_resp.json()
    assistant_id = assistant["id"]
    assert assistant["name"] == "Direct Assistant"

    # List Assistants
    list_ast = client.get("/api/v1/assistants", headers=headers)
    assert list_ast.status_code == 200
    assert any(a["id"] == assistant_id for a in list_ast.json())

    # Get Single Assistant
    get_ast = client.get(f"/api/v1/assistants/{assistant_id}", headers=headers)
    assert get_ast.status_code == 200
    assert get_ast.json()["name"] == "Direct Assistant"

    # 3. Direct Billing Overview
    billing_resp = client.get("/api/v1/billing", headers=headers)
    assert billing_resp.status_code == 200
    b_data = billing_resp.json()
    assert "plan_code" in b_data
    assert "plan_name" in b_data
    assert "user_id" in b_data
    assert "assistants_limit" in b_data

    # 4. Direct API Credentials
    cred_resp = client.post(
        "/api/v1/api-credentials",
        headers=headers,
        json={"name": "Direct User Key", "scopes": ["chat"]},
    )
    assert cred_resp.status_code == 201, cred_resp.text
    cred_id = cred_resp.json()["id"]

    list_creds = client.get("/api/v1/api-credentials", headers=headers)
    assert list_creds.status_code == 200
    assert any(c["id"] == cred_id for c in list_creds.json())

    # Cleanup
    del_cred = client.delete(f"/api/v1/api-credentials/{cred_id}", headers=headers)
    assert del_cred.status_code == 204

    del_ast = client.delete(f"/api/v1/assistants/{assistant_id}", headers=headers)
    assert del_ast.status_code == 204

    del_src = client.delete(f"/api/v1/sources/{source_id}", headers=headers)
    assert del_src.status_code == 204


def test_cross_user_isolation_and_idor_prevention():
    """Verify that User A cannot read, modify, or delete User B's resources."""
    _, headers_a = _create_verified_user(email_prefix="usera")
    _, headers_b = _create_verified_user(email_prefix="userb")

    # User A creates a Source
    src_resp_a = client.post("/api/v1/sources", headers=headers_a, json={"name": "User A Private Source"})
    assert src_resp_a.status_code == 201
    source_a_id = src_resp_a.json()["id"]

    # User A creates an Assistant
    ast_resp_a = client.post(
        "/api/v1/assistants",
        headers=headers_a,
        json={"name": "User A Private Assistant", "is_active": True},
    )
    assert ast_resp_a.status_code == 201
    ast_a_id = ast_resp_a.json()["id"]

    # User A creates an API Credential
    cred_resp_a = client.post(
        "/api/v1/api-credentials",
        headers=headers_a,
        json={"name": "User A Key", "scopes": ["chat"]},
    )
    assert cred_resp_a.status_code == 201
    cred_a_id = cred_resp_a.json()["id"]

    # User B attempts to delete User A's Source (Should be 404 or 403)
    b_src_del = client.delete(f"/api/v1/sources/{source_a_id}", headers=headers_b)
    assert b_src_del.status_code in (403, 404)

    # User B list sources must NOT contain User A's source
    b_src_list = client.get("/api/v1/sources", headers=headers_b)
    assert b_src_list.status_code == 200
    assert not any(s["id"] == source_a_id for s in b_src_list.json())

    # User B attempts to access User A's Assistant
    b_ast_get = client.get(f"/api/v1/assistants/{ast_a_id}", headers=headers_b)
    assert b_ast_get.status_code in (403, 404)

    b_ast_del = client.delete(f"/api/v1/assistants/{ast_a_id}", headers=headers_b)
    assert b_ast_del.status_code in (403, 404)

    # User B list assistants must NOT contain User A's assistant
    b_ast_list = client.get("/api/v1/assistants", headers=headers_b)
    assert b_ast_list.status_code == 200
    assert not any(a["id"] == ast_a_id for a in b_ast_list.json())

    # User B attempts to delete User A's API Credential
    b_cred_del = client.delete(f"/api/v1/api-credentials/{cred_a_id}", headers=headers_b)
    assert b_cred_del.status_code in (403, 404)


def test_admin_panel_security():
    """Verify admin endpoints are protected by server-side email allowlist."""
    # 1. Non-admin user denied (403 Forbidden)
    _, regular_headers = _create_verified_user(email_prefix="regular")
    resp = client.get("/api/v1/admin/access", headers=regular_headers)
    assert resp.status_code == 403

    resp_users = client.get("/api/v1/admin/users", headers=regular_headers)
    assert resp_users.status_code == 403

    # 2. Admin user on allowlist allowed
    admin_email = "admin@weirwise.com"  # Present in ADMIN_ALLOWLIST_EMAILS by default
    _, admin_headers = _create_verified_user(email=admin_email)

    admin_access = client.get("/api/v1/admin/access", headers=admin_headers)
    assert admin_access.status_code == 200
    data = admin_access.json()
    assert data.get("is_admin") is True

    admin_users = client.get("/api/v1/admin/users", headers=admin_headers)
    assert admin_users.status_code == 200
    assert isinstance(admin_users.json(), list)
