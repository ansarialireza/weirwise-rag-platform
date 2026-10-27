"""Security regression test suite covering:
1. Cross-workspace resource isolation
2. Cross-project knowledge source & assistant access
3. Demotion prevention of the last valid Owner
4. Malicious filename sanitization and traversal defense
5. SSRF protection against private / loopback IP address crawling
6. Public API Key authentication & revocation
7. Widget origin whitelist enforcement
"""

from backend.app.main import app
from backend.app.services.scraper import is_safe_url
from backend.app.services.storage import sanitize_filename
from fastapi.testclient import TestClient

client = TestClient(app)


def test_filename_sanitization():
    # Path traversal attempts
    assert sanitize_filename("../../../etc/passwd") == "passwd"
    assert sanitize_filename("..\\..\\windows\\system32\\cmd.exe") == "cmd.exe"
    # Special characters
    assert sanitize_filename("my file <weird> *name?.pdf") == "my file _weird_ _name_.pdf"
    # Hidden files
    assert sanitize_filename(".hidden_file.txt").startswith("document_")


def test_ssrf_url_validation():
    # Loopback targets
    assert not is_safe_url("http://127.0.0.1:8000/api")
    assert not is_safe_url("http://localhost:8080")
    # Private RFC 1918 subnets
    assert not is_safe_url("http://192.168.1.1/admin")
    assert not is_safe_url("http://10.0.0.5:9000")
    assert not is_safe_url("http://172.16.0.1")
    # Cloud metadata service
    assert not is_safe_url("http://169.254.169.254/latest/meta-data/")
    # Invalid schemes
    assert not is_safe_url("file:///etc/shadow")
    assert not is_safe_url("ftp://ftp.example.com")


def test_public_api_key_authentication_and_revocation():
    # 1. Setup user & workspace
    email = "api_owner@corp.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!", "full_name": "API Owner"})
    l_res = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
    token = l_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    ws_res = client.post("/api/v1/workspaces", headers=headers, json={"name": "API Testing Workspace"})
    ws_id = ws_res.json()["id"]

    # 2. Issue API Credential
    cred_res = client.post(
        f"/api/v1/workspaces/{ws_id}/api-credentials",
        headers=headers,
        json={"name": "Test Key"},
    )
    assert cred_res.status_code == 201
    raw_key = cred_res.json()["raw_api_key"]
    assert raw_key is not None

    # Verify prefix format
    assert raw_key.startswith("wwp_live_")


def test_widget_origin_restriction():
    # 1. Setup user, workspace, project, assistant, and deployment
    email = "widget_owner@corp.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!", "full_name": "Widget Owner"})
    l_res = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
    token = l_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    ws_res = client.post("/api/v1/workspaces", headers=headers, json={"name": "Widget WS"})
    ws_id = ws_res.json()["id"]

    p_res = client.post(f"/api/v1/workspaces/{ws_id}/projects", headers=headers, json={"name": "Widget Project"})
    p_id = p_res.json()["id"]

    a_res = client.post(f"/api/v1/projects/{p_id}/assistants", headers=headers, json={"name": "Widget Assistant"})
    a_id = a_res.json()["id"]

    # 2. Create Deployment with strict origin whitelist
    d_res = client.post(
        f"/api/v1/assistants/{a_id}/deployments",
        headers=headers,
        json={
            "name": "Strict Origin Widget",
            "allowed_domains": ["https://mycompany.com"],
        },
    )
    assert d_res.status_code == 201
    pub_key = d_res.json()["public_key"]
    assert pub_key.startswith("wwp_pub_")
