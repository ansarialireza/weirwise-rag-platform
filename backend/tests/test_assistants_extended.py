"""Unit and regression tests for Assistant retrieval, partial updates, and validation."""

import uuid

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_assistant_crud_patch_and_security():
    """Verify that an assistant can be created, retrieved by ID, and partially updated (patched)."""
    # 1. Register & Authenticate User
    email = f"qa_lead_{uuid.uuid4().hex[:8]}@enterprise.org"
    password = "MasterKey2026!#"
    reg = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "QA Architect"},
    )
    assert reg.status_code == 201

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create Workspace & Project
    ws_res = client.post("/api/v1/workspaces", headers=headers, json={"name": "QA Workspace"})
    assert ws_res.status_code == 201
    ws_id = ws_res.json()["id"]

    proj_res = client.post(f"/api/v1/workspaces/{ws_id}/projects", headers=headers, json={"name": "QA Project"})
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["id"]

    # 3. Create Assistant
    payload = {
        "name": "QA Specialist Assistant",
        "system_instructions": "Provide thorough test evaluations.",
        "model": "gpt-4o-mini",
        "temperature": 0.2,
        "top_k": 4,
        "score_threshold": 0.7,
    }
    res = client.post(f"/api/v1/projects/{proj_id}/assistants", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    data = res.json()
    assistant_id = data["id"]
    assert data["name"] == "QA Specialist Assistant"
    assert data["status"] == "draft"

    # 4. Get Single Assistant by ID
    get_res = client.get(f"/api/v1/assistants/{assistant_id}", headers=headers)
    assert get_res.status_code == 200, get_res.text
    get_data = get_res.json()
    assert get_data["id"] == assistant_id
    assert get_data["name"] == "QA Specialist Assistant"

    # 5. Patch Assistant (Partial Update)
    patch_payload = {
        "name": "Senior QA Specialist",
        "temperature": 0.35,
        "system_instructions": "Deep precision evaluations only.",
    }
    patch_res = client.patch(f"/api/v1/assistants/{assistant_id}", json=patch_payload, headers=headers)
    assert patch_res.status_code == 200, patch_res.text
    patch_data = patch_res.json()
    assert patch_data["name"] == "Senior QA Specialist"
    assert patch_data["temperature"] == 0.35
    assert patch_data["system_instructions"] == "Deep precision evaluations only."
    # Unchanged fields remain intact
    assert patch_data["model"] == "gpt-4o-mini"
    assert patch_data["score_threshold"] == 0.7

    # 6. Unauthorized access prevention (Non-existent user / unauthenticated)
    denied_res = client.get(f"/api/v1/assistants/{assistant_id}", headers={"Authorization": "Bearer badtoken"})
    assert denied_res.status_code == 401
