"""Extended test cases for assistant creation, configuration, and security."""

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_assistant_crud_patch_and_security():
    email = "extended_asst@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Asst Dev"},
    )
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "name": "Support Bot",
        "description": "General customer support assistant",
        "system_instructions": "You are a professional customer support agent.",
        "model": "Auto",
        "temperature": 0.3,
        "max_tokens": 512,
        "top_k": 4,
        "score_threshold": 0.7,
    }
    res = client.post("/api/v1/assistants", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    data = res.json()
    assistant_id = data["id"]
    assert data["name"] == "Support Bot"

    # Patch assistant
    patch_payload = {
        "name": "Updated Support Bot",
        "temperature": 0.5,
    }
    patch_res = client.patch(f"/api/v1/assistants/{assistant_id}", json=patch_payload, headers=headers)
    assert patch_res.status_code == 200, patch_res.text
    assert patch_res.json()["name"] == "Updated Support Bot"
    assert patch_res.json()["temperature"] == 0.5
