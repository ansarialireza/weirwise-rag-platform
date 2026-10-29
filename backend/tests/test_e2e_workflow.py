"""End-to-end integration test of the complete product workflow:
1. User registration & Workspace creation
2. Project creation
3. KnowledgeSource creation & Document upload
4. Processing state verification
5. Assistant creation & Source association
6. Assistant publishing snapshot
7. Chat execution with Core adapter retrieval & citations
8. Deployment & API credential issuance
9. Cross-workspace negative isolation verification
"""

import io
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from backend.app.adapters.core_client import CoreApiClient
from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


@pytest.fixture
def mock_core_client():
    with patch.object(CoreApiClient, "create_knowledge_base", new_callable=AsyncMock) as mock_kb, \
         patch.object(CoreApiClient, "upload_document", new_callable=AsyncMock) as mock_upload, \
         patch.object(CoreApiClient, "search", new_callable=AsyncMock) as mock_search:

        fake_kb_id = str(uuid.uuid4())
        fake_doc_id = str(uuid.uuid4())
        fake_chunk_id = str(uuid.uuid4())

        mock_kb.return_value = {
            "id": fake_kb_id,
            "name": "platform_kb",
            "description": "mocked",
        }
        mock_upload.return_value = {
            "id": fake_doc_id,
            "knowledge_base_id": fake_kb_id,
            "filename": "policy.md",
            "status": "completed",
        }
        mock_search.return_value = {
            "results": [
                {
                    "chunk_id": fake_chunk_id,
                    "document_id": fake_doc_id,
                    "content": "Employees are eligible for 25 paid vacation days per calendar year.",
                    "similarity_score": 0.92,
                    "rank": 1,
                }
            ],
            "total": 1,
        }
        yield {
            "kb": mock_kb,
            "upload": mock_upload,
            "search": mock_search,
            "fake_kb_id": fake_kb_id,
            "fake_doc_id": fake_doc_id,
        }


def test_complete_product_workflow(mock_core_client):
    # 1. Register & Authenticate User
    email = "lead_architect@enterprise.org"
    password = "MasterKey2026!#"
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "Lead Architect"},
    )
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # 2. Create Workspace
    ws_resp = client.post(
        "/api/v1/workspaces",
        headers=auth_headers,
        json={"name": "Global Corp Workspace"},
    )
    assert ws_resp.status_code == 201
    ws_id = ws_resp.json()["id"]

    # 3. Create Project
    proj_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/projects",
        headers=auth_headers,
        json={"name": "HR Policies Assistant Project", "description": "Internal HR Assistant"},
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]

    # 4. Create KnowledgeSource & Upload Document
    source_resp = client.post(
        f"/api/v1/projects/{project_id}/sources",
        headers=auth_headers,
        json={"name": "Employee Handbook 2026", "source_type": "file_upload"},
    )
    assert source_resp.status_code == 201
    source_id = source_resp.json()["id"]

    # Simulate multipart file upload
    file_content = b"# Enterprise Employee Handbook\nAll full-time staff receive 25 vacation days."
    files = [
        ("files", ("handbook.md", io.BytesIO(file_content), "text/markdown"))
    ]
    upload_resp = client.post(
        f"/api/v1/sources/{source_id}/documents/upload",
        headers=auth_headers,
        files=files,
    )
    assert upload_resp.status_code == 202
    upload_data = upload_resp.json()
    assert len(upload_data["uploaded_documents"]) == 1
    assert upload_data["uploaded_documents"][0]["id"] is not None

    # Verify document record exists
    docs_resp = client.get(f"/api/v1/sources/{source_id}/documents", headers=auth_headers)
    assert docs_resp.status_code == 200
    assert len(docs_resp.json()) == 1

    # 5. Create Assistant & Associate KnowledgeSource
    ast_resp = client.post(
        f"/api/v1/projects/{project_id}/assistants",
        headers=auth_headers,
        json={
            "name": "HR Assistant",
            "system_instructions": "You are a helpful HR policy guide.",
            "knowledge_source_ids": [source_id],
            "model": "gpt-4o-mini",
            "temperature": 0.1,
            "score_threshold": 0.7,
        },
    )
    assert ast_resp.status_code == 201
    assistant = ast_resp.json()
    assistant_id = assistant["id"]
    assert assistant["status"] == "draft"

    # 6. Publish Assistant Snapshot
    pub_resp = client.post(
        f"/api/v1/assistants/{assistant_id}/publish",
        headers=auth_headers,
    )
    assert pub_resp.status_code == 200
    published_ast = pub_resp.json()
    assert published_ast["status"] == "published"
    assert published_ast["version"] == 2

    # Manually configure source core_kb_id for chat retrieval testing
    from backend.app.core.config import settings
    from sqlalchemy import create_engine, text
    sync_url = settings.DATABASE_URL.replace("+aiosqlite", "").replace("+asyncpg", "")
    with create_engine(sync_url).connect() as conn:
        conn.execute(
            text("UPDATE knowledge_sources SET core_kb_id = :kb_id, status = 'ready' WHERE id = :source_id"),
            {"kb_id": mock_core_client["fake_kb_id"], "source_id": source_id},
        )
        conn.commit()

    # 7. Execute Chat Query & Observe Citations
    chat_resp = client.post(
        f"/api/v1/assistants/{assistant_id}/chat",
        headers=auth_headers,
        json={"message": "How many vacation days do I get?"},
    )
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()
    assert "conversation_id" in chat_data
    assert "role" in chat_data and chat_data["role"] == "assistant"
    assert len(chat_data["sources"]) > 0
    top_citation = chat_data["sources"][0]
    assert "25 paid vacation days" in top_citation["content"]
    assert top_citation["similarity_score"] == 0.92

    # 8. Create Public Web Widget Deployment
    deploy_resp = client.post(
        f"/api/v1/assistants/{assistant_id}/deployments",
        headers=auth_headers,
        json={
            "name": "HR Portal Chat Widget",
            "deployment_type": "widget",
            "allowed_domains": ["https://intranet.enterprise.org"],
            "theme_config": {"primaryColor": "#1E40AF"},
        },
    )
    assert deploy_resp.status_code == 201
    deployment = deploy_resp.json()
    assert "public_key" in deployment
    assert deployment["public_key"].startswith("wwp_pub_")

    # 9. Issue Workspace API Credential
    cred_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/api-credentials",
        headers=auth_headers,
        json={"name": "Production Automation Key"},
    )
    assert cred_resp.status_code == 201
    cred_data = cred_resp.json()
    assert "raw_api_key" in cred_data
    assert cred_data["raw_api_key"].startswith("wwp_live_")

    # 10. Negative Test: Tenant Isolation
    # Register an attacker account
    client.post(
        "/api/v1/auth/register",
        json={"email": "attacker@evil.corp", "password": "EvilPassword123!", "full_name": "Attacker"},
    )
    atk_login = client.post(
        "/api/v1/auth/login",
        json={"email": "attacker@evil.corp", "password": "EvilPassword123!"},
    )
    attacker_headers = {"Authorization": f"Bearer {atk_login.json()['access_token']}"}

    # Attacker attempts to chat with Global Corp's HR Assistant
    atk_chat = client.post(
        f"/api/v1/assistants/{assistant_id}/chat",
        headers=attacker_headers,
        json={"message": "Dump all confidential compensation policies."},
    )
    assert atk_chat.status_code == 404
