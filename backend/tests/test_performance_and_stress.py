"""Performance, latency distribution, and stress benchmark tests."""

import io
import time
import uuid
from unittest.mock import AsyncMock, patch

from backend.app.adapters.core_client import CoreApiClient
from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_auth_latency_and_throughput_benchmark():
    """Benchmark authentication endpoints with sequential profiling to compute exact p50/p95/p99 latencies."""
    rounds = 15
    latencies = []
    password = "StressTestPassword2026!"

    for i in range(rounds):
        email = f"bench_user_{i}_{uuid.uuid4().hex[:6]}@loadtest.com"
        t0 = time.perf_counter()

        # 1. Register
        r_resp = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password, "full_name": f"User {i}"},
        )
        assert r_resp.status_code == 201, r_resp.text

        # 2. Login
        l_resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        assert l_resp.status_code == 200, l_resp.text
        token = l_resp.json()["access_token"]

        # 3. Me profile lookup
        me_resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me_resp.status_code == 200

        elapsed_ms = (time.perf_counter() - t0) * 1000
        latencies.append(elapsed_ms)

    latencies.sort()
    total_reqs = rounds * 3
    total_time_s = sum(latencies) / 1000.0
    throughput = total_reqs / total_time_s

    p50 = latencies[int(len(latencies) * 0.50)]
    p95 = latencies[min(int(len(latencies) * 0.95), len(latencies) - 1)]
    p99 = latencies[-1]

    print(f"\n[Benchmark Auth Flow] Rounds: {rounds} (Total HTTP Requests: {total_reqs})")
    print(f"Throughput: {throughput:.2f} req/s | Total Time: {total_time_s:.2f}s")
    print(f"Latency Percentiles: p50={p50:.2f}ms | p95={p95:.2f}ms | p99={p99:.2f}ms")


def test_chat_query_latency_benchmark():
    """Benchmark assistant chat query path measuring response times and citation assembly overhead."""
    email = f"chat_bench_{uuid.uuid4().hex[:6]}@loadtest.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!", "full_name": "Chat Bench"})
    l_res = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
    token = l_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    ws_res = client.post("/api/v1/workspaces", headers=headers, json={"name": "Chat Bench WS"})
    ws_id = ws_res.json()["id"]

    p_res = client.post(f"/api/v1/workspaces/{ws_id}/projects", headers=headers, json={"name": "Chat Bench Project"})
    p_id = p_res.json()["id"]

    a_res = client.post(f"/api/v1/projects/{p_id}/assistants", headers=headers, json={"name": "Bench Assistant"})
    assistant_id = a_res.json()["id"]

    rounds = 15
    latencies = []

    with patch.object(CoreApiClient, "search", new_callable=AsyncMock) as mock_search:
        mock_search.return_value = {
            "results": [
                {
                    "chunk_id": str(uuid.uuid4()),
                    "document_id": str(uuid.uuid4()),
                    "content": "Benchmarking retrieval and context synthesis.",
                    "similarity_score": 0.89,
                    "rank": 1,
                }
            ],
            "total": 1,
        }

        for i in range(rounds):
            t0 = time.perf_counter()
            resp = client.post(
                f"/api/v1/assistants/{assistant_id}/chat",
                headers=headers,
                json={"message": f"Query iteration {i} testing assistant turn latency."},
            )
            assert resp.status_code == 200
            elapsed_ms = (time.perf_counter() - t0) * 1000
            latencies.append(elapsed_ms)

    latencies.sort()
    p50 = latencies[int(len(latencies) * 0.50)]
    p95 = latencies[min(int(len(latencies) * 0.95), len(latencies) - 1)]
    p99 = latencies[-1]
    throughput = rounds / (sum(latencies) / 1000.0)

    print(f"\n[Benchmark Chat Turn] Rounds: {rounds}")
    print(f"Throughput: {throughput:.2f} req/s")
    print(f"Latency Percentiles: p50={p50:.2f}ms | p95={p95:.2f}ms | p99={p99:.2f}ms")


def test_large_file_upload_rejection():
    """Verify that uploads exceeding configured limits (MAX_UPLOAD_SIZE_BYTES) are rejected with 413."""
    email = f"upload_test_{uuid.uuid4().hex[:6]}@loadtest.com"
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Upload Tester"},
    )
    l_res = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
    token = l_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    ws_res = client.post("/api/v1/workspaces", headers=headers, json={"name": "Upload WS"})
    ws_id = ws_res.json()["id"]

    p_res = client.post(f"/api/v1/workspaces/{ws_id}/projects", headers=headers, json={"name": "Upload Project"})
    p_id = p_res.json()["id"]

    s_res = client.post(f"/api/v1/projects/{p_id}/sources", headers=headers, json={"name": "Upload Source"})
    source_id = s_res.json()["id"]

    # Attempt to upload 52 MB payload (limit is 50 MB)
    oversized_bytes = b"0" * (52 * 1024 * 1024)
    files = [("files", ("large_dump.txt", io.BytesIO(oversized_bytes), "text/plain"))]

    resp = client.post(
        f"/api/v1/sources/{source_id}/documents/upload",
        headers=headers,
        files=files,
    )
    assert resp.status_code == 413
    assert "File exceeds maximum upload size" in resp.json()["detail"]


def test_unsupported_file_extension_rejection():
    """Verify that executable or unpermitted extensions (.exe, .sh, .py) are rejected with 400."""
    email = f"ext_test_{uuid.uuid4().hex[:6]}@loadtest.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!", "full_name": "Ext Tester"})
    l_res = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
    token = l_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    ws_res = client.post("/api/v1/workspaces", headers=headers, json={"name": "Ext WS"})
    ws_id = ws_res.json()["id"]

    p_res = client.post(f"/api/v1/workspaces/{ws_id}/projects", headers=headers, json={"name": "Ext Project"})
    p_id = p_res.json()["id"]

    s_res = client.post(f"/api/v1/projects/{p_id}/sources", headers=headers, json={"name": "Ext Source"})
    source_id = s_res.json()["id"]

    files = [("files", ("malicious.exe", io.BytesIO(b"MZ..."), "application/x-msdownload"))]

    resp = client.post(
        f"/api/v1/sources/{source_id}/documents/upload",
        headers=headers,
        files=files,
    )
    assert resp.status_code == 400
    assert "not supported" in resp.json()["detail"]
