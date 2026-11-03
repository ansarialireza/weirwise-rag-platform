"""Live cross-service integration test: Weirwise Platform <-> Weirwise RAG Core.
Performs an end-to-end live workflow:
1. Provisions Tenant & API Key directly in Core PostgreSQL database.
2. Directs Platform CoreApiClient to Core FastAPI app via ASGITransport (real HTTP ASGI request/response).
3. Uses real Jina AI embeddings via Core and persists/retrieves vectors from PostgreSQL pgvector.
4. Verifies Platform-to-Core contract, vector generation, and grounded retrieval.
"""

import asyncio
import io
import os
import sys
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport

# Dynamically resolve paths if present
for p in [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "weirwise-rag-core")),
]:
    if p not in sys.path and os.path.exists(p):
        sys.path.insert(0, p)

from backend.app.adapters.core_client import CoreApiClient, CoreApiException  # noqa: E402
from backend.app.main import app as platform_app  # noqa: E402
from backend.app.models.project import Document, KnowledgeSource  # noqa: E402

try:
    from server.app.auth import generate_api_key  # noqa: E402
    from server.app.database import AsyncSessionLocal as CoreSessionLocal  # noqa: E402
    from server.app.main import app as core_app  # noqa: E402
    from server.app.models import APIKey, DocumentChunk, Tenant  # noqa: E402

    HAS_CORE = True
except ImportError:
    HAS_CORE = False

from sqlalchemy import delete, select  # noqa: E402


def get_jina_token():
    env_token = os.getenv("JINA_API_KEY") or os.getenv("WEIRWISE_EMBEDDING_API_KEY")
    if env_token and env_token.startswith("jina_"):
        return env_token
    secrets_path = os.getenv("TEST_SECRETS_PATH", r"C:\Users\Alireza\GitHub\test-secrets\.env.testing")
    if os.path.exists(secrets_path):
        with open(secrets_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("jina_"):
                    return line.strip()
    return None


@pytest.mark.asyncio
async def test_live_platform_to_core_jina_integration():
    """Execute complete cross-service live verification."""
    if not HAS_CORE:
        pytest.skip("weirwise-rag-core package not available in environment; skipping live cross-service test.")

    jina_token = get_jina_token()
    if not jina_token:
        pytest.skip("Jina AI API token not configured; skipping live third-party integration test.")

    # Configure Core environment to use Jina AI embeddings
    os.environ["WEIRWISE_EMBEDDING_BASE_URL"] = "https://api.jina.ai/v1"
    os.environ["WEIRWISE_EMBEDDING_API_KEY"] = jina_token
    os.environ["WEIRWISE_EMBEDDING_MODEL"] = "jina-embeddings-v4"
    os.environ["WEIRWISE_EMBEDDING_DIMENSIONS"] = "1536"
    os.environ["WEIRWISE_DATABASE_URL"] = "postgresql+asyncpg://postgres:postgres@localhost:5432/weirwise_test"
    os.environ["WEIRWISE_DATABASE_SYNC_URL"] = "postgresql://postgres:postgres@localhost:5432/weirwise_test"
    os.environ["WEIRWISE_INGESTION_MODE"] = "inline"

    from server.app.config import get_settings

    get_settings.cache_clear()

    core_base_url = "http://test-core"
    core_transport = ASGITransport(app=core_app)

    # 1. Provision a real Tenant and API Key in Core for Platform's workspace
    raw_core_key, core_key_hash = generate_api_key(prefix="ww_core_plat_")
    test_tenant_name = f"Live-Platform-Tenant-{uuid.uuid4().hex[:8]}"

    async with CoreSessionLocal() as session:
        core_tenant = Tenant(name=test_tenant_name)
        session.add(core_tenant)
        await session.flush()
        core_api_key_rec = APIKey(tenant_id=core_tenant.id, key_hash=core_key_hash, name="Platform Adapter Key")
        session.add(core_api_key_rec)
        await session.commit()
        core_tenant_id = core_tenant.id

    try:
        # Verify Core live & ready probes over ASGI
        async with httpx.AsyncClient(transport=core_transport, base_url=core_base_url) as http_client:
            health_res = await http_client.get("/health/live")
            assert health_res.status_code == 200, f"Core health failed: {health_res.text}"
            ready_res = await http_client.get("/health/ready")
            assert ready_res.status_code == 200, f"Core readiness failed: {ready_res.text}"

        # 2. Patch CoreApiClient to use ASGITransport against real Core app
        # This executes REAL request handling, routing, auth, Jina API calls, and pgvector operations
        class RealASGICoreClient(CoreApiClient):
            def __init__(self, base_url=None, api_key=None, timeout=None):
                super().__init__(base_url or core_base_url, api_key or raw_core_key, timeout)

            def _get_client(self):
                return httpx.AsyncClient(transport=core_transport, timeout=self.timeout)

            async def check_health(self):
                url = f"{self.base_url}/health/live"
                async with self._get_client() as client:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        return resp.json()
                    return {"status": "unhealthy", "code": resp.status_code}

            async def create_knowledge_base(self, name: str, description: str | None = None):
                url = f"{self.base_url}/api/v1/knowledge-bases"
                payload = {"name": name, "description": description}
                async with self._get_client() as client:
                    resp = await client.post(url, json=payload, headers=self._get_headers())
                    if resp.status_code in (200, 201):
                        return resp.json()
                    raise CoreApiException(f"Core KB creation failed: {resp.text}", resp.status_code)

            async def upload_document(self, kb_id, filename, content, mime_type):
                url = f"{self.base_url}/api/v1/documents/upload"
                data = {"knowledge_base_id": str(kb_id)}
                files = {"file": (filename, content, mime_type)}
                async with self._get_client() as client:
                    resp = await client.post(url, data=data, files=files, headers=self._get_headers())
                    if resp.status_code in (200, 201, 202):
                        return resp.json()
                    raise CoreApiException(f"Core document upload failed: {resp.text}", resp.status_code)

            async def get_document_status(self, doc_id):
                url = f"{self.base_url}/api/v1/documents/{doc_id}"
                async with self._get_client() as client:
                    resp = await client.get(url, headers=self._get_headers())
                    if resp.status_code == 200:
                        return resp.json()
                    raise CoreApiException(f"Core document fetch failed: {resp.text}", resp.status_code)

            async def search(self, kb_id, query, top_k=4, score_threshold=0.0):
                url = f"{self.base_url}/api/v1/search"
                payload = {
                    "knowledge_base_id": str(kb_id),
                    "query": query,
                    "top_k": top_k,
                    "score_threshold": score_threshold,
                }
                async with self._get_client() as client:
                    resp = await client.post(url, json=payload, headers=self._get_headers())
                    if resp.status_code == 200:
                        return resp.json()
                    raise CoreApiException(f"Core vector search failed: {resp.text}", resp.status_code)

        # Replace CoreApiClient with RealASGICoreClient in ingestion and assistants
        import backend.app.api.v1.assistants as ast_mod
        import backend.app.tasks.ingestion as ing_mod

        ing_mod.CoreApiClient = RealASGICoreClient
        ast_mod.CoreApiClient = RealASGICoreClient

        live_core_client = RealASGICoreClient()
        health_check_result = await live_core_client.check_health()
        assert health_check_result.get("status") == "alive"

        # 3. Create isolated User and Workspace via Platform REST API
        platform_client = TestClient(platform_app)

        email = f"platform_live_{uuid.uuid4().hex[:8]}@weirwise.ai"
        password = "PlatformSecurePassword2026!"
        reg_res = platform_client.post(
            "/api/v1/auth/register", json={"email": email, "password": password, "full_name": "Integration Tester"}
        )
        assert reg_res.status_code == 201

        login_res = platform_client.post("/api/v1/auth/login", json={"email": email, "password": password})
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 4. Create Workspace & Project
        ws_res = platform_client.post(
            "/api/v1/workspaces", headers=headers, json={"name": "Live Integration Workspace"}
        )
        assert ws_res.status_code == 201
        ws_id = ws_res.json()["id"]

        proj_res = platform_client.post(
            f"/api/v1/workspaces/{ws_id}/projects",
            headers=headers,
            json={"name": "Jina Integration Project", "description": "Testing real cross-service Jina flow"},
        )
        assert proj_res.status_code == 201
        proj_id = proj_res.json()["id"]

        # 5. Create KnowledgeSource in Platform
        ks_res = platform_client.post(
            f"/api/v1/projects/{proj_id}/sources",
            headers=headers,
            json={"name": "Architecture Spec", "source_type": "file_upload"},
        )
        assert ks_res.status_code == 201
        source_id = ks_res.json()["id"]

        # 6. Upload Document via Platform API
        # Distinctive content for retrieval validation
        test_secret_fact = f"The unique verification code for this run is JINA-WEIRWISE-ALPHA-{uuid.uuid4().hex[:6]}."
        doc_content = (
            f"Weirwise Architecture Specification 2026.\n\n"
            f"All asynchronous vector computations are delegated from Platform to Core.\n"
            f"{test_secret_fact}\n"
            f"Core computes 1536-dimensional dense vectors using Jina AI and stores them in PostgreSQL pgvector."
        )
        file_bytes = doc_content.encode("utf-8")
        files = [("files", ("arch_spec.txt", io.BytesIO(file_bytes), "text/plain"))]

        upload_res = platform_client.post(f"/api/v1/sources/{source_id}/documents/upload", headers=headers, files=files)
        assert upload_res.status_code == 202
        uploaded_doc = upload_res.json()["uploaded_documents"][0]
        platform_doc_id = uploaded_doc["id"]

        # 7. Execute document ingestion task directly (real Core API call from Platform)
        await ing_mod.process_document_ingestion(uuid.UUID(platform_doc_id))

        # 8. Verify Document status in Platform DB and Core ID linkage
        from backend.app.db.session import async_session_factory

        async with async_session_factory() as plat_db:
            doc_rec = (
                await plat_db.execute(select(Document).where(Document.id == uuid.UUID(platform_doc_id)))
            ).scalar_one()
            ks_rec = (
                await plat_db.execute(select(KnowledgeSource).where(KnowledgeSource.id == uuid.UUID(source_id)))
            ).scalar_one()
            assert doc_rec.status == "ready", f"Doc status is {doc_rec.status}, error: {doc_rec.error_message}"
            assert doc_rec.core_doc_id is not None
            assert ks_rec.core_kb_id is not None
            core_kb_id = ks_rec.core_kb_id
            core_doc_id = doc_rec.core_doc_id

        # Wait for Core background job to complete if pending
        for _ in range(30):
            core_doc_status = await live_core_client.get_document_status(core_doc_id)
            if core_doc_status.get("status") in ("completed", "failed"):
                break
            await asyncio.sleep(1)
        assert core_doc_status.get("status") == "completed", f"Core doc ingestion status: {core_doc_status}"

        # 9. Verify in PostgreSQL test database that real Jina vectors exist
        async with CoreSessionLocal() as core_session:
            chunks_res = await core_session.execute(
                select(DocumentChunk).where(DocumentChunk.document_id == core_doc_id)
            )
            chunks = chunks_res.scalars().all()
            assert len(chunks) > 0, "No chunks found in Core database"
            first_chunk = chunks[0]
            assert first_chunk.embedding is not None
            assert len(first_chunk.embedding) == 1536
            # Assert vector is not all-zero and contains real non-zero components
            assert any(abs(x) > 0.0001 for x in first_chunk.embedding)

        # 10. Query Core via Platform's CoreApiClient using real query embedding
        search_result = await live_core_client.search(
            kb_id=core_kb_id, query="unique verification code Jina", top_k=3, score_threshold=0.0
        )
        assert search_result.get("total", 0) > 0
        hits = search_result.get("results", [])
        assert len(hits) > 0
        assert test_secret_fact in hits[0]["content"]

        # 11. Create Assistant, Publish, and Chat via Platform API
        ast_res = platform_client.post(
            f"/api/v1/projects/{proj_id}/assistants",
            headers=headers,
            json={
                "name": "Live Spec Assistant",
                "system_instructions": "Answer truthfully based on architecture documents.",
                "knowledge_source_ids": [source_id],
                "model": "gpt-4o-mini",
                "score_threshold": 0.0,
            },
        )
        assert ast_res.status_code == 201
        ast_id = ast_res.json()["id"]

        pub_res = platform_client.post(f"/api/v1/assistants/{ast_id}/publish", headers=headers)
        assert pub_res.status_code == 200

        # Execute chat completion through Platform (calls Core search under the hood)
        chat_res = platform_client.post(
            f"/api/v1/assistants/{ast_id}/chat",
            headers=headers,
            json={"message": "What is the unique verification code?"},
        )
        assert chat_res.status_code == 200
        chat_data = chat_res.json()
        assert "sources" in chat_data
        assert len(chat_data["sources"]) > 0
        assert test_secret_fact in chat_data["sources"][0]["content"]

        # 12. Negative Security & Error Tests
        # Unauthorized Platform request
        bad_auth_res = platform_client.post(
            f"/api/v1/assistants/{ast_id}/chat",
            headers={"Authorization": "Bearer invalid_platform_jwt"},
            json={"message": "Exploit"},
        )
        assert bad_auth_res.status_code == 401

        # Unauthorized Core request
        unauth_core_client = RealASGICoreClient(base_url=core_base_url, api_key="ww_bad_core_key_12345")
        with pytest.raises(CoreApiException) as exc_info:
            await unauth_core_client.create_knowledge_base("Unauthorized KB")
        assert exc_info.value.status_code == 401

    finally:
        # Narrowly scoped cleanup of test tenant in Core DB
        try:
            async with CoreSessionLocal() as session:
                await session.execute(delete(Tenant).where(Tenant.id == core_tenant_id))
                await session.commit()
        except Exception:
            pass
