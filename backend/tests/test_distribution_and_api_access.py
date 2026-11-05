"""End-to-end coverage for deployment sharing, API keys, and public access control."""

import uuid

from backend.app.core.config import settings
from backend.app.main import app
from backend.app.models.assistant import Assistant
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

client = TestClient(app)


def _setup_owner() -> tuple[dict[str, str], str, str, str]:
    email = f"dist_{uuid.uuid4().hex[:8]}@enterprise.org"
    password = "MasterKey2026!#"
    registered = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "Distribution Owner"},
    )
    assert registered.status_code == 201, registered.text

    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    workspace = client.post("/api/v1/workspaces", headers=headers, json={"name": "Distribution Workspace"})
    assert workspace.status_code == 201, workspace.text
    workspace_id = workspace.json()["id"]

    project = client.post(
        f"/api/v1/workspaces/{workspace_id}/projects",
        headers=headers,
        json={"name": "Distribution Project"},
    )
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    assistant = client.post(
        f"/api/v1/projects/{project_id}/assistants",
        headers=headers,
        json={"name": "Distribution Assistant", "system_instructions": "Answer plainly."},
    )
    assert assistant.status_code == 201, assistant.text
    return headers, workspace_id, project_id, assistant.json()["id"]


def _publish_directly(assistant_id: str) -> None:
    """Skip ingestion-dependent readiness so public access can be exercised."""
    sync_url = settings.DATABASE_URL.replace("+aiosqlite", "")
    engine = create_engine(sync_url)
    with Session(engine) as session:
        assistant = session.get(Assistant, uuid.UUID(assistant_id))
        assert assistant is not None
        assistant.status = "published"
        session.commit()
    engine.dispose()


def test_deployment_update_preserves_public_key():
    headers, _workspace_id, _project_id, assistant_id = _setup_owner()

    created = client.post(
        f"/api/v1/assistants/{assistant_id}/deployments",
        headers=headers,
        json={
            "name": "Website widget",
            "deployment_type": "widget",
            "allowed_domains": ["example.com"],
            "theme_config": {"welcome_message": "Hello"},
        },
    )
    assert created.status_code == 201, created.text
    deployment = created.json()

    updated = client.patch(
        f"/api/v1/assistants/{assistant_id}/deployments/{deployment['id']}",
        headers=headers,
        json={"allowed_domains": ["Example.COM", " *.example.com ", "example.com", ""]},
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["public_key"] == deployment["public_key"]
    assert body["allowed_domains"] == ["example.com", "*.example.com"]

    rejected = client.patch(
        f"/api/v1/assistants/{assistant_id}/deployments/{deployment['id']}",
        headers=headers,
        json={"theme_config": {"system_prompt": "leak"}},
    )
    assert rejected.status_code == 400


def test_api_key_creation_listing_revocation_and_access():
    headers, workspace_id, _project_id, assistant_id = _setup_owner()
    _publish_directly(assistant_id)

    created = client.post(
        f"/api/v1/workspaces/{workspace_id}/api-credentials",
        headers=headers,
        json={"name": "Backend service", "scopes": ["assistants:read", "assistants:chat"]},
    )
    assert created.status_code == 201, created.text
    credential = created.json()
    raw_key = credential["raw_api_key"]
    assert raw_key and raw_key.startswith("wwp_live_")
    assert credential["key_prefix"] == raw_key[:12]

    listed = client.get(f"/api/v1/workspaces/{workspace_id}/api-credentials", headers=headers)
    assert listed.status_code == 200, listed.text
    entry = next(item for item in listed.json() if item["id"] == credential["id"])
    assert entry["raw_api_key"] is None
    assert entry["is_active"] is True

    config = client.get(
        f"/api/v1/public/assistants/{assistant_id}/config",
        headers={"X-API-Key": raw_key},
    )
    assert config.status_code == 200, config.text

    read_only = client.post(
        f"/api/v1/workspaces/{workspace_id}/api-credentials",
        headers=headers,
        json={"name": "Read only", "scopes": ["assistants:read"]},
    )
    read_only_key = read_only.json()["raw_api_key"]
    denied_chat = client.post(
        f"/api/v1/public/assistants/{assistant_id}/chat",
        headers={"X-API-Key": read_only_key},
        json={"message": "Hello"},
    )
    assert denied_chat.status_code == 403
    assert "start conversations" in denied_chat.json()["detail"]

    revoked = client.delete(
        f"/api/v1/workspaces/{workspace_id}/api-credentials/{credential['id']}",
        headers=headers,
    )
    assert revoked.status_code == 204

    after_revoke = client.get(
        f"/api/v1/public/assistants/{assistant_id}/config",
        headers={"X-API-Key": raw_key},
    )
    assert after_revoke.status_code == 401

    listed_again = client.get(f"/api/v1/workspaces/{workspace_id}/api-credentials", headers=headers)
    assert listed_again.status_code == 200
    revoked_entry = next(item for item in listed_again.json() if item["id"] == credential["id"])
    assert revoked_entry["is_active"] is False


def test_widget_key_domain_allowlist():
    headers, _workspace_id, _project_id, assistant_id = _setup_owner()
    _publish_directly(assistant_id)

    deployment = client.post(
        f"/api/v1/assistants/{assistant_id}/deployments",
        headers=headers,
        json={
            "name": "Locked widget",
            "deployment_type": "widget",
            "allowed_domains": ["acme.com"],
        },
    )
    assert deployment.status_code == 201, deployment.text
    widget_key = deployment.json()["public_key"]

    blocked = client.get(
        f"/api/v1/public/assistants/{assistant_id}/config",
        headers={"X-Widget-Key": widget_key, "Origin": "https://acme.com.attacker.net"},
    )
    assert blocked.status_code == 403

    allowed = client.get(
        f"/api/v1/public/assistants/{assistant_id}/config",
        headers={"X-Widget-Key": widget_key, "Origin": "https://acme.com"},
    )
    assert allowed.status_code == 200, allowed.text

    bad_key = client.get(
        f"/api/v1/public/assistants/{assistant_id}/config",
        headers={"X-Widget-Key": "wwp_pub_not_a_real_key", "Origin": "https://acme.com"},
    )
    assert bad_key.status_code == 401
