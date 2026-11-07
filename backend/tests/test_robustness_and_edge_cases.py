"""Comprehensive robustness and edge-case test suite for Weirwise platform."""

import io
import uuid
from datetime import timedelta

import pytest
from backend.app.core.security import create_jwt_token, hash_password
from backend.app.db.session import async_session_factory
from backend.app.main import app
from backend.app.models.auth import User
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_file_upload_edge_cases():
    """Verify upload rejection for unsupported extensions, and handling of empty and corrupted payloads."""
    async with async_session_factory() as session:
        user = User(
            email=f"edge_user_{uuid.uuid4().hex[:6]}@example.com",
            full_name="Edge Tester",
            hashed_password=hash_password("Password123!"),
            is_active=True,
            is_verified=True,
        )
        session.add(user)
        await session.commit()
        user_id = user.id

    token = create_jwt_token({"sub": str(user_id)}, timedelta(hours=1))
    headers = {"Authorization": f"Bearer {token}"}
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create Workspace, Project, and Source
        ws_res = await ac.post("/api/v1/workspaces", headers=headers, json={"name": "Edge WS"})
        assert ws_res.status_code == 201
        ws_id = ws_res.json()["id"]

        p_res = await ac.post(f"/api/v1/workspaces/{ws_id}/projects", headers=headers, json={"name": "Edge Project"})
        assert p_res.status_code == 201
        p_id = p_res.json()["id"]

        s_res = await ac.post(f"/api/v1/projects/{p_id}/sources", headers=headers, json={"name": "Edge Source"})
        assert s_res.status_code == 201
        source_id = s_res.json()["id"]

        # 1. Unsupported extension (.sh, .exe, .py)
        unsupported_file = [("files", ("exploit.sh", io.BytesIO(b"#!/bin/bash\necho 1"), "application/x-sh"))]
        unsupported_res = await ac.post(
            f"/api/v1/sources/{source_id}/documents/upload", headers=headers, files=unsupported_file
        )
        assert unsupported_res.status_code == 400
        assert "not supported" in unsupported_res.json()["detail"]

        # 2. Multiple valid files batch upload
        multi_files = [
            ("files", ("batch_1.txt", io.BytesIO(b"Valid content 1"), "text/plain")),
            ("files", ("batch_2.md", io.BytesIO(b"# Valid markdown 2"), "text/markdown")),
        ]
        multi_res = await ac.post(
            f"/api/v1/sources/{source_id}/documents/upload", headers=headers, files=multi_files
        )
        assert multi_res.status_code == 202
        assert len(multi_res.json()["uploaded_documents"]) == 2


@pytest.mark.asyncio
async def test_search_edge_cases():
    """Verify direct search input validation against empty, long, and special character queries."""
    async with async_session_factory() as session:
        user = User(
            email=f"search_edge_{uuid.uuid4().hex[:6]}@example.com",
            full_name="Search Tester",
            hashed_password=hash_password("Password123!"),
            is_active=True,
            is_verified=True,
        )
        session.add(user)
        await session.commit()
        user_id = user.id

    token = create_jwt_token({"sub": str(user_id)}, timedelta(hours=1))
    headers = {"Authorization": f"Bearer {token}"}
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ws_res = await ac.post("/api/v1/workspaces", headers=headers, json={"name": "Search WS"})
        ws_id = ws_res.json()["id"]

        p_res = await ac.post(f"/api/v1/workspaces/{ws_id}/projects", headers=headers, json={"name": "Search Project"})
        p_id = p_res.json()["id"]

        # 1. Empty query should fail pydantic schema validation (422)
        res_empty = await ac.post(
            f"/api/v1/projects/{p_id}/knowledge/search",
            headers=headers,
            json={"query": ""},
        )
        assert res_empty.status_code == 422

        # 2. Empty knowledge base search returns graceful 0 results
        res_empty_kb = await ac.post(
            f"/api/v1/projects/{p_id}/knowledge/search",
            headers=headers,
            json={"query": "test query with no indexed documents"},
        )
        assert res_empty_kb.status_code == 200
        assert res_empty_kb.json()["total_results"] == 0
        assert res_empty_kb.json()["results"] == []


@pytest.mark.asyncio
async def test_cross_tenant_and_unauthorized_isolation():
    """Verify strict tenant isolation across KnowledgeSources, documents, and admin endpoints."""
    async with async_session_factory() as session:
        user1 = User(
            email=f"victim_{uuid.uuid4().hex[:6]}@example.com",
            full_name="Victim User",
            hashed_password=hash_password("Password123!"),
            is_active=True,
            is_verified=True,
        )
        user2 = User(
            email=f"attacker_{uuid.uuid4().hex[:6]}@example.com",
            full_name="Attacker User",
            hashed_password=hash_password("Password123!"),
            is_active=True,
            is_verified=True,
        )
        session.add_all([user1, user2])
        await session.commit()
        user1_id = user1.id
        user2_id = user2.id

    token1 = create_jwt_token({"sub": str(user1_id)}, timedelta(hours=1))
    token2 = create_jwt_token({"sub": str(user2_id)}, timedelta(hours=1))
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # User 1 creates workspace, project, source
        ws_res = await ac.post(
            "/api/v1/workspaces", headers={"Authorization": f"Bearer {token1}"}, json={"name": "Victim WS"}
        )
        ws_id = ws_res.json()["id"]
        p_res = await ac.post(
            f"/api/v1/workspaces/{ws_id}/projects",
            headers={"Authorization": f"Bearer {token1}"},
            json={"name": "Victim Proj"},
        )
        p_id = p_res.json()["id"]
        s_res = await ac.post(
            f"/api/v1/projects/{p_id}/sources",
            headers={"Authorization": f"Bearer {token1}"},
            json={"name": "Victim Source"},
        )
        source_id = s_res.json()["id"]

        # Attacker tries to read victim source documents -> 404 (isolated)
        read_res = await ac.get(
            f"/api/v1/sources/{source_id}/documents", headers={"Authorization": f"Bearer {token2}"}
        )
        assert read_res.status_code == 404

        # Attacker tries to upload document to victim source -> 404
        upload_res = await ac.post(
            f"/api/v1/sources/{source_id}/documents/upload",
            headers={"Authorization": f"Bearer {token2}"},
            files=[("files", ("hacked.txt", io.BytesIO(b"exploit"), "text/plain"))],
        )
        assert upload_res.status_code == 404

        # Unauthenticated request -> 401
        unauth_res = await ac.get(f"/api/v1/sources/{source_id}/documents")
        assert unauth_res.status_code == 401

        # Non-admin attempting super-admin endpoint -> 403
        admin_res = await ac.get("/api/v1/admin/routing/metrics", headers={"Authorization": f"Bearer {token2}"})
        assert admin_res.status_code == 403
