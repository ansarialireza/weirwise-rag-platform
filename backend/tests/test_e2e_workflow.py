"""End-to-End workflow test for full user lifecycle."""

import uuid

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_full_e2e_platform_lifecycle():
    uid = uuid.uuid4().hex[:8]
    email = f"e2e_founder_{uid}@example.com"
    password = "StrongPassword123!"

    # 1. Register
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "E2E Founder"},
    )
    assert reg_resp.status_code == 201

    # 2. Login
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Create Source
    src_resp = client.post(
        "/api/v1/sources",
        headers=headers,
        json={"name": "Company Handbook", "source_type": "file_upload"},
    )
    assert src_resp.status_code == 201
    source_id = src_resp.json()["id"]

    # 4. Upload Document
    file_content = b"# Company Policy Handbook\nWe provide 20 days paid annual vacation leave."
    upload_resp = client.post(
        f"/api/v1/sources/{source_id}/documents",
        headers=headers,
        files=[("files", ("handbook.md", file_content, "text/markdown"))],
    )
    assert upload_resp.status_code == 202

    # 5. Create Assistant
    asst_resp = client.post(
        "/api/v1/assistants",
        headers=headers,
        json={
            "name": "HR Assistant",
            "system_instructions": "Answer employee questions about annual leave policy.",
            "knowledge_source_ids": [source_id],
        },
    )
    assert asst_resp.status_code == 201
    assistant_id = asst_resp.json()["id"]

    # 6. Publish Assistant
    pub_resp = client.post(f"/api/v1/assistants/{assistant_id}/publish", headers=headers)
    assert pub_resp.status_code == 200
    assert pub_resp.json()["status"] == "published"

    # 7. Chat with Assistant
    chat_resp = client.post(
        f"/api/v1/assistants/{assistant_id}/chat",
        headers=headers,
        json={"query": "How many days of paid annual vacation do employees get?"},
    )
    assert chat_resp.status_code == 200
    assert "answer" in chat_resp.json()
