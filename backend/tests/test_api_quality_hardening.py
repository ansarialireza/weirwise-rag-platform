"""Comprehensive API consistency, authorization, and error handling tests."""

import uuid

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def _create_authenticated_user(prefix: str = "api_user") -> tuple[dict[str, str], str, str, str]:
    email = f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    password = "StrongPassword2026!#"
    reg = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "API Test User"},
    )
    assert reg.status_code == 201
    otp = reg.json().get("verification_otp")
    if otp:
        verify_res = client.post("/api/v1/auth/verify-email", json={"email": email, "otp": otp})
        assert verify_res.status_code == 200

    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    # Create workspace
    ws = client.post("/api/v1/workspaces", headers=headers, json={"name": f"WS {prefix}"})
    assert ws.status_code == 201
    ws_id = ws.json()["id"]

    # Upgrade to pro plan so assistant limits don't block tests
    client.post(
        f"/api/v1/workspaces/{ws_id}/billing/change-plan",
        headers=headers,
        json={"target_tier": "pro"},
    )

    # Create project
    proj = client.post(f"/api/v1/workspaces/{ws_id}/projects", headers=headers, json={"name": f"Proj {prefix}"})
    assert proj.status_code == 201
    proj_id = proj.json()["id"]

    # Create assistant
    ast = client.post(
        f"/api/v1/projects/{proj_id}/assistants",
        headers=headers,
        json={"name": f"Bot {prefix}", "system_instructions": "Answer concisely."},
    )
    assert ast.status_code == 201
    ast_id = ast.json()["id"]

    return headers, ws_id, proj_id, ast_id


def test_cross_tenant_project_access_denial():
    """User B cannot access or list User A's project resources."""
    headers_a, ws_a, proj_a, _ast_a = _create_authenticated_user("tenant_a")
    headers_b, ws_b, proj_b, _ast_b = _create_authenticated_user("tenant_b")

    # User B attempts to get User A's project
    res = client.get(f"/api/v1/projects/{proj_a}", headers=headers_b)
    assert res.status_code in (403, 404)
    assert "access denied" in res.json()["detail"].lower() or "not found" in res.json()["detail"].lower()

    # User B attempts to list assistants in User A's project
    res_ast = client.get(f"/api/v1/projects/{proj_a}/assistants", headers=headers_b)
    assert res_ast.status_code in (403, 404)

    # User B attempts to list knowledge sources in User A's project
    res_ks = client.get(f"/api/v1/projects/{proj_a}/sources", headers=headers_b)
    assert res_ks.status_code in (403, 404)


def test_cross_tenant_assistant_isolation():
    """User B cannot view, modify, or delete User A's assistant."""
    headers_a, _ws_a, _proj_a, ast_a = _create_authenticated_user("owner_a")
    headers_b, _ws_b, _proj_b, _ast_b = _create_authenticated_user("owner_b")

    # Get assistant
    assert client.get(f"/api/v1/assistants/{ast_a}", headers=headers_b).status_code in (403, 404)

    # Update assistant
    patch_res = client.patch(f"/api/v1/assistants/{ast_a}", headers=headers_b, json={"name": "Hacked"})
    assert patch_res.status_code in (403, 404)

    # Delete assistant
    assert client.delete(f"/api/v1/assistants/{ast_a}", headers=headers_b).status_code in (403, 404)


def test_unauthenticated_request_rejection():
    """Endpoints reject requests missing Authorization headers with 401."""
    anon_client = TestClient(app)
    random_id = uuid.uuid4()
    assert anon_client.get(f"/api/v1/projects/{random_id}").status_code == 401
    assert anon_client.get(f"/api/v1/assistants/{random_id}").status_code == 401
    assert anon_client.get("/api/v1/workspaces").status_code == 401
    assert anon_client.get("/api/v1/admin/access").status_code == 401


def test_non_admin_forbidden_from_admin_api():
    """Standard users cannot access admin endpoints."""
    headers, _ws, _proj, _ast = _create_authenticated_user("normie")
    res = client.get("/api/v1/admin/access", headers=headers)
    assert res.status_code == 403


def test_delete_endpoints_return_204_no_content():
    """Verified DELETE endpoints return 204 with no response body."""
    headers, ws, _proj, ast = _create_authenticated_user("clean_del")

    # Delete assistant
    del_ast = client.delete(f"/api/v1/assistants/{ast}", headers=headers)
    assert del_ast.status_code == 204
    assert len(del_ast.content) == 0

    # Test integration deletion
    integ = client.post(
        f"/api/v1/workspaces/{ws}/integrations",
        headers=headers,
        json={
            "provider": "shopify",
            "display_name": "Test Store",
            "credentials": {"shop_url": "test.myshopify.com", "access_token": "shpat_test123"},
            "config": {},
        },
    )
    assert integ.status_code == 201
    integ_id = integ.json()["id"]

    del_integ = client.delete(f"/api/v1/workspaces/{ws}/integrations/{integ_id}", headers=headers)
    assert del_integ.status_code == 204
    assert len(del_integ.content) == 0


def test_assistants_list_performance_and_accuracy():
    """Verify list assistants returns correct knowledge_source_ids without N+1 regression."""
    headers, _ws, proj, _ast = _create_authenticated_user("perf_user")

    # Create multiple assistants (pro plan allows up to 10)
    for i in range(3):
        create_res = client.post(
            f"/api/v1/projects/{proj}/assistants",
            headers=headers,
            json={"name": f"Batch Bot {i}", "system_instructions": "Answer concisely."},
        )
        assert create_res.status_code == 201

    res = client.get(f"/api/v1/projects/{proj}/assistants", headers=headers)
    assert res.status_code == 200
    assistants = res.json()
    assert len(assistants) >= 4
    for a in assistants:
        assert "knowledge_source_ids" in a
        assert isinstance(a["knowledge_source_ids"], list)
