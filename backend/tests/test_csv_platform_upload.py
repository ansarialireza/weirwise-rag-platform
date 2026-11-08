import io

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_csv_upload_entitlement_and_extension_allowed():
    # Register and login
    email = "csv_tester@loadtest.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!", "full_name": "CSV Tester"})
    l_res = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
    token = l_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Workspace
    ws_res = client.post("/api/v1/workspaces", headers=headers, json={"name": "CSV WS"})
    ws_id = ws_res.json()["id"]

    # Project
    p_res = client.post(f"/api/v1/workspaces/{ws_id}/projects", headers=headers, json={"name": "CSV Project"})
    p_id = p_res.json()["id"]

    # Source
    s_res = client.post(
        f"/api/v1/projects/{p_id}/sources",
        headers=headers,
        json={"name": "CSV Source", "source_type": "file_upload"},
    )
    source_id = s_res.json()["id"]

    csv_data = b"col1,col2,col3\nval1,val2,val3\n"
    files = [("files", ("test_data.csv", io.BytesIO(csv_data), "text/csv"))]

    resp = client.post(f"/api/v1/sources/{source_id}/documents/upload", headers=headers, files=files)
    assert resp.status_code == 202, resp.text
    docs = resp.json()["uploaded_documents"]
    assert len(docs) == 1
    assert docs[0]["filename"] == "test_data.csv"
    assert docs[0]["mime_type"] == "text/csv"
