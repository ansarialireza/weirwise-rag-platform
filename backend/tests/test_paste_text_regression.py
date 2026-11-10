import uuid

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_paste_text_ingestion_and_lifecycle():
    # 1. Register & Login
    uid = uuid.uuid4().hex[:8]
    email = f"paste_text_{uid}@example.com"
    password = "TestPassword123!"

    reg = client.post(
        "/api/v1/auth/register", json={"email": email, "password": password, "full_name": "Paste Text Tester"}
    )
    assert reg.status_code in (200, 201)

    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    # Workspace & Project
    ws_id = client.get("/api/v1/workspaces", headers=headers).json()[0]["id"]
    proj_id = client.get(f"/api/v1/workspaces/{ws_id}/projects", headers=headers).json()[0]["id"]

    # 2. Create Knowledge Source
    ks = client.post(
        f"/api/v1/projects/{proj_id}/sources",
        headers=headers,
        json={"name": "Notes Collection", "source_type": "file_upload"},
    ).json()
    source_id = ks["id"]

    # 3. Paste Text Ingest
    paste_content = (
        "Weirwise Paste Text Feature: Customers can paste raw meeting notes, transcripts, or policy clauses directly."
    )
    paste_resp = client.post(
        f"/api/v1/sources/{source_id}/documents/paste-text",
        headers=headers,
        json={"title": "Meeting Transcript", "content": paste_content},
    )
    assert paste_resp.status_code in (200, 202)
    doc_data = paste_resp.json()
    assert doc_data["filename"] == "Meeting Transcript.txt"
    assert doc_data["mime_type"] == "text/plain"
    assert doc_data["file_size_bytes"] == len(paste_content.encode("utf-8"))

    # 4. Verify in Document Listing
    docs = client.get(f"/api/v1/sources/{source_id}/documents", headers=headers).json()
    assert any(d["id"] == doc_data["id"] for d in docs)

    # 5. Clean up Document
    del_resp = client.delete(f"/api/v1/documents/{doc_data['id']}", headers=headers)
    assert del_resp.status_code in (200, 204)
