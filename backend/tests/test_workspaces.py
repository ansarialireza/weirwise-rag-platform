"""Integration tests for Workspaces, RBAC, Multi-tenancy, and Owner protection."""

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_workspace_and_rbac_flow():
    # 1. Register Owner
    owner_email = "workspace_owner@example.com"
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": owner_email, "password": "Password123!", "full_name": "Org Owner"},
    )
    assert reg_resp.status_code == 201

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": owner_email, "password": "Password123!"},
    )
    owner_token = login_resp.json()["access_token"]
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    # 2. Register Member User
    member_email = "team_member@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"email": member_email, "password": "Password123!", "full_name": "Team Member"},
    )
    m_login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": member_email, "password": "Password123!"},
    )
    member_token = m_login_resp.json()["access_token"]
    member_headers = {"Authorization": f"Bearer {member_token}"}

    # 3. Create Custom Workspace
    ws_resp = client.post(
        "/api/v1/workspaces",
        headers=owner_headers,
        json={"name": "Acme Enterprise"},
    )
    assert ws_resp.status_code == 201
    workspace = ws_resp.json()
    ws_id = workspace["id"]

    # 4. Invite Member to Workspace
    invite_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=owner_headers,
        json={"email": member_email, "role": "member"},
    )
    assert invite_resp.status_code == 201
    member_id = invite_resp.json()["id"]

    # 5. Verify Member can view projects
    proj_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/projects",
        headers=member_headers,
        json={"name": "Member Project", "description": "Created by member"},
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]

    # 6. Unauthorized Member cannot change roles or update workspace
    bad_role_change = client.patch(
        f"/api/v1/workspaces/{ws_id}/members/{member_id}",
        headers=member_headers,
        json={"role": "admin"},
    )
    assert bad_role_change.status_code == 403

    # 7. Owner cannot demote themselves if they are the last Owner
    owner_members_resp = client.get(f"/api/v1/workspaces/{ws_id}/members", headers=owner_headers)
    members_list = owner_members_resp.json()
    owner_membership = next(m for m in members_list if m["role"] == "owner")

    demote_fail = client.patch(
        f"/api/v1/workspaces/{ws_id}/members/{owner_membership['id']}",
        headers=owner_headers,
        json={"role": "member"},
    )
    assert demote_fail.status_code == 400
    assert "last remaining Owner" in demote_fail.text

    # 8. Cross-Workspace Isolation Test
    # Register an outsider user
    outsider_email = "outsider@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"email": outsider_email, "password": "Password123!", "full_name": "Outsider"},
    )
    out_login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": outsider_email, "password": "Password123!"},
    )
    outsider_headers = {"Authorization": f"Bearer {out_login_resp.json()['access_token']}"}

    # Outsider cannot read or access Acme Enterprise
    cross_ws_get = client.get(f"/api/v1/workspaces/{ws_id}", headers=outsider_headers)
    assert cross_ws_get.status_code == 404

    # Outsider cannot read or mutate project
    cross_proj_get = client.get(f"/api/v1/projects/{project_id}", headers=outsider_headers)
    assert cross_proj_get.status_code == 404
