"""Test user level isolation and core flat entity access."""

import uuid

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_user_direct_entities_flow():
    uid = uuid.uuid4().hex[:8]
    user_email = f"flat_user_{uid}@example.com"
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": user_email, "password": "Password123!", "full_name": "Flat User"},
    )
    assert reg_resp.status_code == 201

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": user_email, "password": "Password123!"},
    )
    assert login_resp.status_code == 200, login_resp.text
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create knowledge source
    src_resp = client.post(
        "/api/v1/sources",
        headers=headers,
        json={"name": "User Direct KB", "source_type": "file_upload"},
    )
    assert src_resp.status_code == 201, src_resp.text
    source_id = src_resp.json()["id"]

    # List knowledge sources
    list_src = client.get("/api/v1/sources", headers=headers)
    assert list_src.status_code == 200
    assert any(s["id"] == source_id for s in list_src.json())

    # Create assistant directly
    asst_resp = client.post(
        "/api/v1/assistants",
        headers=headers,
        json={
            "name": "Direct Assistant",
            "system_instructions": "Direct user assistant instructions with enough chars.",
            "knowledge_source_ids": [source_id],
        },
    )
    assert asst_resp.status_code == 201, asst_resp.text
    assistant_id = asst_resp.json()["id"]

    # Get assistant
    get_asst = client.get(f"/api/v1/assistants/{assistant_id}", headers=headers)
    assert get_asst.status_code == 200
    assert get_asst.json()["name"] == "Direct Assistant"
