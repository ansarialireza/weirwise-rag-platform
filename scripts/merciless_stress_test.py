import asyncio
import time
import uuid
import os
import io
import statistics
import asyncpg
import httpx
import subprocess

BASE_URL = "http://127.0.0.1:8000/api/v1"
DB_DSN = os.getenv("DATABASE_URL", "postgresql://weirwise_dev:weirwise_dev_secure_password@db:5432/weirwise_dev_db")
if "+asyncpg" in DB_DSN:
    DB_DSN = DB_DSN.replace("postgresql+asyncpg://", "postgresql://")

async def upgrade_user_to_enterprise(email: str, ws_id: str):
    conn = await asyncpg.connect(DB_DSN)
    try:
        await conn.execute("UPDATE users SET is_verified = true WHERE email = $1", email)
        await conn.execute(
            "UPDATE workspaces SET plan_tier = 'enterprise', subscription_tier_id = (SELECT id FROM subscription_tiers WHERE name = 'Enterprise' LIMIT 1) WHERE id = $1",
            uuid.UUID(ws_id)
        )
    finally:
        await conn.close()

async def create_user_and_token(client: httpx.AsyncClient):
    uid = uuid.uuid4().hex[:8]
    email = f"merciless_{uid}@loadtest.com"
    pwd = "MercilessPassword2026!"
    
    print(f"[SETUP] Registering test user {email}...")
    r = await client.post(f"{BASE_URL}/auth/register", json={"email": email, "password": pwd, "full_name": "Merciless Load Tester"})
    r.raise_for_status()
    
    conn = await asyncpg.connect(DB_DSN)
    await conn.execute("UPDATE users SET is_verified = true WHERE email = $1", email)
    await conn.close()
    
    l = await client.post(f"{BASE_URL}/auth/login", json={"email": email, "password": pwd})
    l.raise_for_status()
    token = l.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create workspace, project, assistant, knowledge_source
    ws = await client.post(f"{BASE_URL}/workspaces", headers=headers, json={"name": "Stress WS"})
    ws.raise_for_status()
    ws_id = ws.json()["id"]
    
    await upgrade_user_to_enterprise(email, ws_id)
    print(f"[SETUP] Workspace {ws_id} upgraded to Enterprise tier (50,000 msgs, 25GB quota).")
    
    p = await client.post(f"{BASE_URL}/workspaces/{ws_id}/projects", headers=headers, json={"name": "Stress Project"})
    p.raise_for_status()
    p_id = p.json()["id"]
    
    a = await client.post(f"{BASE_URL}/projects/{p_id}/assistants", headers=headers, json={"name": "Stress Assistant", "system_prompt": "You are a test assistant."})
    a.raise_for_status()
    assistant_id = a.json()["id"]
    print(f"[SETUP] Created Assistant ID: {assistant_id}")
    
    ks = await client.post(
        f"{BASE_URL}/projects/{p_id}/sources",
        headers=headers,
        json={"name": "Stress Knowledge Source", "source_type": "file_upload"}
    )
    ks.raise_for_status()
    source_id = ks.json()["id"]
    print(f"[SETUP] Created Knowledge Source ID: {source_id}")
    
    return headers, assistant_id, source_id

async def run_ingestion_bombardment(headers, source_id):
    print("\n=======================================================")
    print(" [TEST 1] INGESTION BOMBARDMENT: 50 CONCURRENT 5MB UPLOADS")
    print("=======================================================")
    
    file_size_mb = 5
    file_bytes = b"X" * (file_size_mb * 1024 * 1024)
    num_files = 50
    
    latencies = []
    statuses = []
    
    async def upload_single(client: httpx.AsyncClient, i: int):
        filename = f"stress_doc_{i}_{uuid.uuid4().hex[:6]}.txt"
        files = {"files": (filename, io.BytesIO(file_bytes), "text/plain")}
        t0 = time.perf_counter()
        try:
            r = await client.post(
                f"{BASE_URL}/sources/{source_id}/documents/upload",
                headers=headers,
                files=files,
                timeout=120.0
            )
            elapsed = (time.perf_counter() - t0) * 1000
            return r.status_code, elapsed, r.text[:100]
        except Exception as e:
            elapsed = (time.perf_counter() - t0) * 1000
            return 500, elapsed, str(e)

    limits = httpx.Limits(max_keepalive_connections=50, max_connections=50)
    async with httpx.AsyncClient(limits=limits) as client:
        t_start = time.perf_counter()
        tasks = [upload_single(client, i) for i in range(num_files)]
        results = await asyncio.gather(*tasks)
        total_time = time.perf_counter() - t_start
        
        for code, ms, text in results:
            statuses.append(code)
            latencies.append(ms)

    latencies.sort()
    p50 = statistics.median(latencies)
    p95 = latencies[int(len(latencies) * 0.95)]
    p99 = latencies[-1]
    p0 = latencies[0]
    success_count = sum(1 for s in statuses if 200 <= s < 300)
    error_count = sum(1 for s in statuses if s >= 400)
    
    print("\n--- RESULTS: INGESTION BOMBARDMENT ---")
    print(f"Total Uploads:     {num_files} files (250 MB total)")
    print(f"Total Time Taken:  {total_time:.2f} seconds")
    print(f"Throughput:        {num_files / total_time:.2f} files/sec ({(num_files * 5) / total_time:.2f} MB/s)")
    print(f"Successful (2xx):  {success_count}/{num_files}")
    print(f"Errors (>=400):    {error_count}/{num_files}")
    print(f"Min Latency:       {p0:.2f} ms")
    print(f"p50 (Median):      {p50:.2f} ms")
    print(f"p95 Latency:       {p95:.2f} ms")
    print(f"p99 / Max Latency: {p99:.2f} ms")

async def run_query_load(headers, assistant_id):
    print("\n=======================================================")
    print(" [TEST 2] pgvector & RAG QUERY LOAD: 200 CONCURRENT BLAST")
    print("=======================================================")
    num_requests = 200
    latencies = []
    statuses = []
    
    queries = [
        "What are our strict enterprise security policies for API key rotation?",
        "How is cold storage archival handled on Google Drive mounts?",
        "Detail the multi-tenant vector isolation mechanisms in pgvector.",
        "What is the SLA for human-in-the-loop escalation requests?"
    ]
    
    async def query_single(client: httpx.AsyncClient, i: int):
        q = queries[i % len(queries)]
        payload = {"message": q, "stream": False}
        t0 = time.perf_counter()
        try:
            r = await client.post(
                f"{BASE_URL}/assistants/{assistant_id}/chat",
                headers=headers,
                json=payload,
                timeout=60.0
            )
            elapsed = (time.perf_counter() - t0) * 1000
            return r.status_code, elapsed
        except Exception as e:
            elapsed = (time.perf_counter() - t0) * 1000
            return 500, elapsed

    limits = httpx.Limits(max_keepalive_connections=200, max_connections=200)
    async with httpx.AsyncClient(limits=limits) as client:
        t_start = time.perf_counter()
        tasks = [query_single(client, i) for i in range(num_requests)]
        results = await asyncio.gather(*tasks)
        total_time = time.perf_counter() - t_start
        
        for code, ms in results:
            statuses.append(code)
            latencies.append(ms)

    latencies.sort()
    p50 = statistics.median(latencies)
    p95 = latencies[int(len(latencies) * 0.95)]
    p99 = latencies[-1]
    p0 = latencies[0]
    success_count = sum(1 for s in statuses if 200 <= s < 300)
    error_count = sum(1 for s in statuses if s >= 400)
    
    print("\n--- RESULTS: pgvector & RAG QUERY LOAD ---")
    print(f"Total Requests:    {num_requests}")
    print(f"Total Time Taken:  {total_time:.2f} seconds")
    print(f"Throughput:        {num_requests / total_time:.2f} req/s")
    print(f"Successful (2xx):  {success_count}/{num_requests}")
    print(f"Errors (>=400):    {error_count}/{num_requests}")
    print(f"Min Latency:       {p0:.2f} ms")
    print(f"p50 (Median):      {p50:.2f} ms")
    print(f"p95 Latency:       {p95:.2f} ms")
    print(f"p99 / Max Latency: {p99:.2f} ms")

async def run_frontend_pwa_bench():
    print("\n=======================================================")
    print(" [TEST 3] FRONTEND / PWA RESILIENCY & AUDIT")
    print("=======================================================")
    routes = [
        ("http://dev-frontend:3000/en/overview", "Overview (English LTR)"),
        ("http://dev-frontend:3000/fa/overview", "Overview (Persian RTL)"),
        ("http://dev-frontend:3000/manifest.json", "PWA Web App Manifest"),
        ("http://dev-frontend:3000/sw.js", "Serwist Service Worker"),
        ("http://dev-frontend:3000/offline", "Brutalist Offline Fallback")
    ]
    async with httpx.AsyncClient(timeout=10.0) as client:
        for url, label in routes:
            t0 = time.perf_counter()
            r = await client.get(url)
            elapsed = (time.perf_counter() - t0) * 1000
            print(f"[{label:<28}] Status: {r.status_code} | Latency: {elapsed:.2f}ms | Payload: {len(r.content)} bytes")

async def main():
    async with httpx.AsyncClient(timeout=30.0) as client:
        headers, assistant_id, source_id = await create_user_and_token(client)
    
    await run_ingestion_bombardment(headers, source_id)
    await run_query_load(headers, assistant_id)
    await run_frontend_pwa_bench()

if __name__ == "__main__":
    asyncio.run(main())
