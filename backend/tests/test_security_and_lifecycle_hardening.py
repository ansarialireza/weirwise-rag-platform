"""Regression tests for the hardening work in this change set:

1. Widget origin matching never accepts look-alike domains.
2. Public widget/chat session tokens are required to touch a conversation.
3. Deleting a knowledge source purges Core vectors, documents, and files.
4. Failed documents can be retried; healthy documents cannot.
5. Grounded answering falls back to extractive text when no provider exists.
6. A plan change updates the entitlement row that quota enforcement reads.
"""

import io
import uuid
from pathlib import Path

import pytest
from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def _register_and_login(prefix: str) -> dict[str, str]:
    uid = uuid.uuid4().hex[:8]
    email = f"{prefix}_{uid}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": prefix.title()},
    )
    assert reg.status_code == 201, reg.text
    login = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _create_tenant(headers: dict[str, str], name: str) -> tuple[str, str, str]:
    ws = client.post("/api/v1/workspaces", headers=headers, json={"name": f"{name} Workspace"})
    assert ws.status_code == 201, ws.text
    workspace_id = ws.json()["id"]

    project = client.post(
        f"/api/v1/workspaces/{workspace_id}/projects",
        headers=headers,
        json={"name": f"{name} Project"},
    )
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    assistant = client.post(
        f"/api/v1/projects/{project_id}/assistants",
        headers=headers,
        json={"name": f"{name} Assistant"},
    )
    assert assistant.status_code == 201, assistant.text
    return workspace_id, project_id, assistant.json()["id"]


async def _publish_assistant(assistant_id: str) -> None:
    from backend.app.db.session import async_session_factory
    from backend.app.models.assistant import Assistant, AssistantStatus

    async with async_session_factory() as session:
        assistant = await session.get(Assistant, uuid.UUID(assistant_id))
        assistant.status = AssistantStatus.PUBLISHED.value
        await session.commit()


def test_origin_is_allowed_rejects_look_alike_domains():
    from backend.app.api.v1.public_runtime import origin_is_allowed

    allowlist = ["https://mycompany.com"]

    assert origin_is_allowed("https://mycompany.com", allowlist)
    assert origin_is_allowed("https://mycompany.com:8443", allowlist)
    assert origin_is_allowed("https://www.mycompany.com/checkout", ["*.mycompany.com"])
    assert not origin_is_allowed("https://mycompany.com.attacker.net", allowlist)
    assert not origin_is_allowed("https://attacker.net/?host=mycompany.com", allowlist)
    assert not origin_is_allowed("", allowlist)
    assert not origin_is_allowed("https://evil.example", allowlist)
    assert origin_is_allowed("https://anything.example", [])
    assert origin_is_allowed("https://anything.example", ["*"])


def test_public_widget_rejects_untrusted_origin():
    headers = _register_and_login("widget_origin")
    _, _, assistant_id = _create_tenant(headers, "WidgetOrigin")

    dep = client.post(
        f"/api/v1/assistants/{assistant_id}/deployments",
        headers=headers,
        json={"name": "Production Widget", "allowed_domains": ["https://mycompany.com"]},
    )
    assert dep.status_code == 201, dep.text
    widget_key = dep.json()["public_key"]

    import asyncio

    asyncio.run(_publish_assistant(assistant_id))

    blocked = client.post(
        f"/api/v1/public/assistants/{assistant_id}/chat",
        headers={"X-Widget-Key": widget_key, "Origin": "https://mycompany.com.attacker.net"},
        json={"message": "Hello"},
    )
    assert blocked.status_code == 403, blocked.text

    allowed = client.post(
        f"/api/v1/public/assistants/{assistant_id}/chat",
        headers={"X-Widget-Key": widget_key, "Origin": "https://mycompany.com"},
        json={"message": "Hello"},
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["session_token"].startswith("wws_")


def test_public_session_token_is_required_for_feedback_and_handoff():
    headers = _register_and_login("widget_session")
    _, _, assistant_id = _create_tenant(headers, "WidgetSession")

    import asyncio

    asyncio.run(_publish_assistant(assistant_id))

    chat = client.post(
        f"/api/v1/public/assistants/{assistant_id}/chat",
        json={"message": "Do you ship internationally?"},
    )
    assert chat.status_code == 200, chat.text
    body = chat.json()
    session_token = body["session_token"]
    conversation_id = body["conversation_id"]
    message_id = body["message_id"]

    missing = client.post(
        f"/api/v1/public/messages/{message_id}/feedback",
        json={"rating": "positive"},
    )
    assert missing.status_code == 403, missing.text

    wrong = client.post(
        f"/api/v1/public/messages/{message_id}/feedback",
        headers={"X-Session-Token": "wws_not-the-owner"},
        json={"rating": "positive"},
    )
    assert wrong.status_code == 403, wrong.text

    owned = client.post(
        f"/api/v1/public/messages/{message_id}/feedback",
        headers={"X-Session-Token": session_token},
        json={"rating": "positive"},
    )
    assert owned.status_code == 200, owned.text

    handoff_blocked = client.post(
        f"/api/v1/public/conversations/{conversation_id}/handoff",
        json={"reason": "Need a human"},
    )
    assert handoff_blocked.status_code == 403, handoff_blocked.text

    handoff_ok = client.post(
        f"/api/v1/public/conversations/{conversation_id}/handoff",
        headers={"X-Session-Token": session_token},
        json={"reason": "Need a human"},
    )
    assert handoff_ok.status_code == 200, handoff_ok.text


def test_deleting_source_purges_core_and_documents(tmp_path: Path, monkeypatch):
    import asyncio

    from backend.app.db.session import async_session_factory
    from backend.app.models.project import Document, KnowledgeSource

    headers = _register_and_login("source_delete")
    _, project_id, _ = _create_tenant(headers, "SourceDelete")

    source = client.post(
        f"/api/v1/projects/{project_id}/sources",
        headers=headers,
        json={"name": "Docs", "source_type": "file_upload"},
    )
    assert source.status_code == 201, source.text
    source_id = source.json()["id"]

    kb_id = uuid.uuid4()
    doc_ids = [uuid.uuid4(), uuid.uuid4()]
    stored_files = []
    for index, doc_id in enumerate(doc_ids):
        path = tmp_path / f"stored_{index}.txt"
        path.write_text("content", encoding="utf-8")
        stored_files.append(path)

    async def seed():
        async with async_session_factory() as session:
            src = await session.get(KnowledgeSource, uuid.UUID(source_id))
            src.core_kb_id = kb_id
            for index, doc_id in enumerate(doc_ids):
                session.add(
                    Document(
                        id=doc_id,
                        knowledge_source_id=src.id,
                        core_doc_id=doc_id,
                        filename=f"doc_{index}.txt",
                        mime_type="text/plain",
                        file_size_bytes=7,
                        content_hash=f"hash-{index}",
                        storage_path=str(stored_files[index]),
                        status="ready",
                        doc_metadata={},
                    )
                )
            await session.commit()

    asyncio.run(seed())

    deleted_kbs: list[uuid.UUID] = []
    deleted_docs: list[uuid.UUID] = []

    class FakeCoreClient:
        async def delete_knowledge_base(self, target_id):
            deleted_kbs.append(target_id)

        async def delete_document(self, target_id):
            deleted_docs.append(target_id)

    monkeypatch.setattr("backend.app.api.v1.knowledge.CoreApiClient", FakeCoreClient)

    response = client.delete(f"/api/v1/sources/{source_id}", headers=headers)
    assert response.status_code == 204, response.text
    assert deleted_kbs == [kb_id]
    assert not stored_files[0].exists() and not stored_files[1].exists()

    async def remaining():
        async with async_session_factory() as session:
            src = await session.get(KnowledgeSource, uuid.UUID(source_id))
            docs = (
                await session.execute(
                    Document.__table__.select().where(Document.knowledge_source_id == uuid.UUID(source_id))
                )
            ).fetchall()
            return src, docs

    src, docs = asyncio.run(remaining())
    assert src is None
    assert docs == []


def test_document_delete_cancels_queued_jobs_but_rejects_active_jobs(tmp_path: Path):
    import asyncio

    from backend.app.db.session import async_session_factory
    from backend.app.models.project import Document, ProcessingJob
    from sqlalchemy import select

    headers = _register_and_login("document_delete_queue")
    _, project_id, _ = _create_tenant(headers, "DocumentDeleteQueue")
    source = client.post(
        f"/api/v1/projects/{project_id}/sources",
        headers=headers,
        json={"name": "Queued deletion", "source_type": "file_upload"},
    )
    assert source.status_code == 201, source.text
    source_id = uuid.UUID(source.json()["id"])

    pending_id, processing_id = uuid.uuid4(), uuid.uuid4()
    pending_path = tmp_path / "queued.txt"
    processing_path = tmp_path / "processing.txt"
    pending_path.write_text("queued", encoding="utf-8")
    processing_path.write_text("processing", encoding="utf-8")

    async def seed():
        async with async_session_factory() as session:
            for document_id, path, document_status, job_status in (
                (pending_id, pending_path, "pending", "pending"),
                (processing_id, processing_path, "processing", "processing"),
            ):
                document = Document(
                    id=document_id,
                    knowledge_source_id=source_id,
                    filename=path.name,
                    mime_type="text/plain",
                    file_size_bytes=1,
                    content_hash=str(document_id),
                    storage_path=str(path),
                    status=document_status,
                )
                session.add(document)
                session.add(
                    ProcessingJob(
                        document_id=document_id,
                        status=job_status,
                        attempts=1 if job_status == "processing" else 0,
                        max_attempts=3,
                    )
                )
            await session.commit()

    asyncio.run(seed())

    deleted = client.delete(f"/api/v1/documents/{pending_id}", headers=headers)
    assert deleted.status_code == 204, deleted.text
    assert not pending_path.exists()

    rejected = client.delete(f"/api/v1/documents/{processing_id}", headers=headers)
    assert rejected.status_code == 409, rejected.text
    assert processing_path.exists()
    rejected_source = client.delete(f"/api/v1/sources/{source_id}", headers=headers)
    assert rejected_source.status_code == 409, rejected_source.text

    async def verify_processing_job_remains():
        async with async_session_factory() as session:
            document = await session.get(Document, processing_id)
            job = await session.scalar(select(ProcessingJob).where(ProcessingJob.document_id == processing_id))
            return document, job

    document, job = asyncio.run(verify_processing_job_remains())
    assert document is not None and document.status == "processing"
    assert job is not None and job.status == "processing"


def test_shopify_disconnect_removes_catalog_and_local_credentials(tmp_path: Path, monkeypatch):
    import asyncio

    from backend.app.db.session import async_session_factory
    from backend.app.models.assistant import BusinessIntegration
    from backend.app.models.project import Document, KnowledgeSource, KnowledgeSourceType

    headers = _register_and_login("shopify_disconnect")
    user_response = client.get("/api/v1/auth/me", headers=headers)
    assert user_response.status_code == 200, user_response.text
    user_id = uuid.UUID(user_response.json()["id"])

    integration_id, source_id, core_kb_id, document_id = (uuid.uuid4() for _ in range(4))
    stored_file = tmp_path / "shopify-catalog.txt"
    stored_file.write_text("product catalog", encoding="utf-8")

    async def seed():
        async with async_session_factory() as session:
            session.add(
                BusinessIntegration(
                    id=integration_id,
                    user_id=user_id,
                    connection_key="shop.myshopify.com",
                    provider="shopify",
                    display_name="shop.myshopify.com",
                    encrypted_credentials="encrypted-test-value",
                    config={"catalog_source_id": str(source_id)},
                    sync_status="completed",
                )
            )
            source = KnowledgeSource(
                id=source_id,
                user_id=user_id,
                core_kb_id=core_kb_id,
                name="Shopify products",
                source_type=KnowledgeSourceType.SHOPIFY_CATALOG.value,
                status="ready",
                settings={"integration_id": str(integration_id)},
            )
            session.add(source)
            session.add(
                Document(
                    id=document_id,
                    user_id=user_id,
                    knowledge_source_id=source_id,
                    core_doc_id=document_id,
                    filename=stored_file.name,
                    mime_type="text/plain",
                    file_size_bytes=15,
                    content_hash="catalog-hash",
                    storage_path=str(stored_file),
                    status="ready",
                )
            )
            await session.commit()

    asyncio.run(seed())
    deleted_kbs = []

    class FakeCoreClient:
        async def delete_knowledge_base(self, target_id):
            deleted_kbs.append(target_id)

    monkeypatch.setattr("backend.app.api.v1.integrations.CoreApiClient", FakeCoreClient)
    response = client.delete(f"/api/v1/integrations/{integration_id}", headers=headers)

    assert response.status_code == 204, response.text
    assert deleted_kbs == [core_kb_id]
    assert not stored_file.exists()

    async def verify_removed():
        async with async_session_factory() as session:
            return (
                await session.get(BusinessIntegration, integration_id),
                await session.get(KnowledgeSource, source_id),
                await session.get(Document, document_id),
            )

    integration, source, document = asyncio.run(verify_removed())
    assert integration is None and source is None and document is None


def test_shopify_disconnect_rejects_active_sync():
    import asyncio

    from backend.app.db.session import async_session_factory
    from backend.app.models.assistant import BusinessIntegration

    headers = _register_and_login("shopify_disconnect_syncing")
    user_response = client.get("/api/v1/auth/me", headers=headers)
    assert user_response.status_code == 200, user_response.text
    user_id = uuid.UUID(user_response.json()["id"])
    integration_id = uuid.uuid4()

    async def seed():
        async with async_session_factory() as session:
            session.add(
                BusinessIntegration(
                    id=integration_id,
                    user_id=user_id,
                    connection_key="busy.myshopify.com",
                    provider="shopify",
                    display_name="busy.myshopify.com",
                    encrypted_credentials="encrypted-test-value",
                    config={},
                    sync_status="syncing",
                )
            )
            await session.commit()

    asyncio.run(seed())

    response = client.delete(f"/api/v1/integrations/{integration_id}", headers=headers)
    assert response.status_code == 409, response.text

    async def verify_integration_remains():
        async with async_session_factory() as session:
            return await session.get(BusinessIntegration, integration_id)

    integration = asyncio.run(verify_integration_remains())
    assert integration is not None and integration.sync_status == "syncing"


def test_retry_requires_failed_document():
    import asyncio

    from backend.app.db.session import async_session_factory
    from backend.app.models.project import Document, ProcessingJob
    from sqlalchemy import select

    headers = _register_and_login("doc_retry")
    _, project_id, _ = _create_tenant(headers, "DocRetry")

    source = client.post(
        f"/api/v1/projects/{project_id}/sources",
        headers=headers,
        json={"name": "Retry Docs", "source_type": "file_upload"},
    )
    assert source.status_code == 201, source.text
    source_id = source.json()["id"]

    failed_id = uuid.uuid4()
    ready_id = uuid.uuid4()

    async def seed():
        async with async_session_factory() as session:
            for doc_id, status in ((failed_id, "failed"), (ready_id, "ready")):
                session.add(
                    Document(
                        id=doc_id,
                        knowledge_source_id=uuid.UUID(source_id),
                        filename=f"{status}.txt",
                        mime_type="text/plain",
                        file_size_bytes=1,
                        content_hash=str(doc_id),
                        storage_path=f"/tmp/{doc_id}.txt",
                        status=status,
                        error_message="boom" if status == "failed" else None,
                        doc_metadata={},
                    )
                )
            await session.commit()

    asyncio.run(seed())

    retried = client.post(f"/api/v1/documents/{failed_id}/retry", headers=headers)
    assert retried.status_code == 200, retried.text
    assert retried.json()["status"] == "pending"

    async def queued_jobs():
        async with async_session_factory() as session:
            result = await session.execute(select(ProcessingJob).where(ProcessingJob.document_id == failed_id))
            return result.scalars().all()

    jobs = asyncio.run(queued_jobs())
    assert len(jobs) == 1
    assert jobs[0].status == "pending"
    assert jobs[0].attempts == 0

    refused = client.post(f"/api/v1/documents/{ready_id}/retry", headers=headers)
    assert refused.status_code == 400, refused.text

    missing = client.post(f"/api/v1/documents/{uuid.uuid4()}/retry", headers=headers)
    assert missing.status_code == 404, missing.text


def test_legacy_document_download_uses_parent_source_ownership(tmp_path: Path):
    import asyncio

    from backend.app.db.session import async_session_factory
    from backend.app.models.project import Document, KnowledgeSource

    owner_headers = _register_and_login("legacy_document_owner")
    other_headers = _register_and_login("legacy_document_other")
    source_response = client.post(
        "/api/v1/sources",
        headers=owner_headers,
        json={"name": "Legacy document source", "source_type": "file_upload"},
    )
    assert source_response.status_code == 201, source_response.text
    source_id = uuid.UUID(source_response.json()["id"])
    document_id = uuid.uuid4()
    storage_path = tmp_path / "legacy-document.txt"
    storage_path.write_text("owner-only data", encoding="utf-8")

    async def seed():
        async with async_session_factory() as session:
            source = await session.get(KnowledgeSource, source_id)
            session.add(
                Document(
                    id=document_id,
                    knowledge_source_id=source.id,
                    core_doc_id=uuid.uuid4(),
                    filename="legacy-document.txt",
                    mime_type="text/plain",
                    file_size_bytes=15,
                    content_hash="d" * 64,
                    storage_path=str(storage_path),
                    status="ready",
                    doc_metadata={},
                )
            )
            await session.commit()

    asyncio.run(seed())

    owner_download = client.get(f"/api/v1/documents/{document_id}/download", headers=owner_headers)
    other_download = client.get(f"/api/v1/documents/{document_id}/download", headers=other_headers)
    assert owner_download.status_code == 200
    assert owner_download.content == b"owner-only data"
    assert other_download.status_code == 404


def test_ingestion_job_rejects_wrong_owner(tmp_path: Path):
    import asyncio

    from backend.app.db.session import async_session_factory
    from backend.app.models.project import Document, KnowledgeSource
    from backend.app.tasks.ingestion import process_document_ingestion

    headers = _register_and_login("ingestion_owner")
    source_response = client.post(
        "/api/v1/sources",
        headers=headers,
        json={"name": "Owned source", "source_type": "file_upload"},
    )
    assert source_response.status_code == 201, source_response.text
    source_id = uuid.UUID(source_response.json()["id"])
    document_id = uuid.uuid4()
    storage_path = tmp_path / "not-read.txt"
    storage_path.write_text("test", encoding="utf-8")

    async def seed_and_get_owner():
        async with async_session_factory() as session:
            source = await session.get(KnowledgeSource, source_id)
            session.add(
                Document(
                    id=document_id,
                    knowledge_source_id=source.id,
                    core_doc_id=uuid.uuid4(),
                    filename="not-read.txt",
                    mime_type="text/plain",
                    file_size_bytes=4,
                    content_hash="c" * 64,
                    storage_path=str(storage_path),
                    status="pending",
                    doc_metadata={},
                )
            )
            await session.commit()
            return source.user_id

    asyncio.run(seed_and_get_owner())
    asyncio.run(process_document_ingestion(document_id, uuid.uuid4()))

    async def load_document():
        async with async_session_factory() as session:
            return await session.get(Document, document_id)

    document = asyncio.run(load_document())
    assert document is not None
    assert document.status == "pending"
    assert document.user_id is None
    assert storage_path.exists()


@pytest.mark.asyncio
async def test_grounded_answer_falls_back_without_provider():
    from backend.app.db.session import async_session_factory
    from backend.app.models.assistant import Assistant
    from backend.app.services.llm import LLMService

    assistant = Assistant(
        user_id=uuid.uuid4(),
        name="Support Assistant",
        system_instructions="Be helpful.",
        model="Auto",
        temperature=0.2,
        max_tokens=256,
        language="en",
        tone="professional",
        fallback_message="I could not find that answer.",
    )

    async with async_session_factory() as session:
        answer = await LLMService.generate_grounded_answer(
            db=session,
            assistant=assistant,
            query="What is the return policy?",
            passages=["Returns are accepted within 30 days.", "Shipping takes five days."],
        )
        assert answer.used_llm is False
        assert answer.content == "Returns are accepted within 30 days."

        empty = await LLMService.generate_grounded_answer(
            db=session,
            assistant=assistant,
            query="Anything?",
            passages=[],
        )
        assert empty.content == "I could not find that answer."


def test_plan_change_updates_entitlement_row():
    import asyncio

    from backend.app.db.session import async_session_factory
    from backend.app.models.assistant import WorkspacePlanEntitlement

    headers = _register_and_login("plan_sync")
    workspace_id, _, _ = _create_tenant(headers, "PlanSync")

    upgrade = client.post(
        f"/api/v1/workspaces/{workspace_id}/billing/change-plan",
        headers=headers,
        json={"target_tier": "pro"},
    )
    assert upgrade.status_code == 200, upgrade.text
    assert upgrade.json()["plan_tier"] == "pro"
    assert upgrade.json()["chat_turns_limit"] == 10000
    assert upgrade.json()["documents_limit"] in (500, 25 * 50)

    async def load():
        async with async_session_factory() as session:
            stmt = WorkspacePlanEntitlement.__table__.select().where(
                WorkspacePlanEntitlement.user_id == uuid.UUID(workspace_id)
            )
            return (await session.execute(stmt)).fetchone()

    row = asyncio.run(load())
    assert row is not None
    assert row.plan_tier == "pro"
    assert row.max_assistants == 25
    assert row.monthly_chat_turns_limit == 10000
    assert row.max_storage_mb == 5000


def test_dashboard_requires_auth_and_upload_rejects_unknown_source():
    headers = _register_and_login("upload_guard")
    _, _, _ = _create_tenant(headers, "UploadGuard")

    anon_client = TestClient(app)
    anonymous = anon_client.get("/api/v1/workspaces")
    assert anonymous.status_code == 401

    upload = client.post(
        f"/api/v1/sources/{uuid.uuid4()}/documents/upload",
        headers=headers,
        files=[("files", ("a.txt", io.BytesIO(b"hello"), "text/plain"))],
    )
    assert upload.status_code == 404, upload.text
