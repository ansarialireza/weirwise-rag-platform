import uuid

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_collection_rename_and_lifecycle():
    # 1. Register & Login
    uid = uuid.uuid4().hex[:8]
    email = f"test_rename_{uid}@example.com"
    password = "TestPassword123!"

    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "Rename Test User"},
    )
    assert reg_resp.status_code in (200, 201)

    login_resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Get Workspace & Project
    ws_res = client.get("/api/v1/workspaces", headers=headers)
    assert ws_res.status_code == 200
    ws_id = ws_res.json()[0]["id"]

    proj_res = client.get(f"/api/v1/workspaces/{ws_id}/projects", headers=headers)
    assert proj_res.status_code == 200
    proj_id = proj_res.json()[0]["id"]

    # 2. Create Knowledge Source
    create_resp = client.post(
        f"/api/v1/projects/{proj_id}/sources",
        headers=headers,
        json={"name": "Initial Source Name", "source_type": "file_upload"},
    )
    assert create_resp.status_code in (200, 201)
    source_id = create_resp.json()["id"]
    assert create_resp.json()["name"] == "Initial Source Name"

    # 3. Rename Knowledge Source via PATCH
    rename_resp = client.patch(
        f"/api/v1/sources/{source_id}",
        headers=headers,
        json={"name": "Renamed Knowledge Source"},
    )
    assert rename_resp.status_code == 200
    assert rename_resp.json()["name"] == "Renamed Knowledge Source"

    # 4. Verify in listing
    list_resp = client.get(f"/api/v1/projects/{proj_id}/sources", headers=headers)
    assert list_resp.status_code == 200
    sources = list_resp.json()
    matched = next((s for s in sources if s["id"] == source_id), None)
    assert matched is not None
    assert matched["name"] == "Renamed Knowledge Source"

    # 5. Clean up via DELETE
    del_resp = client.delete(f"/api/v1/sources/{source_id}", headers=headers)
    assert del_resp.status_code in (200, 204)
