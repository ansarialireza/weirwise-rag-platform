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


def test_retry_requires_failed_document(monkeypatch):
    import asyncio

    from backend.app.db.session import async_session_factory
    from backend.app.models.project import Document

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

    queued: list[uuid.UUID] = []

    async def fake_ingestion(document_id):
        queued.append(document_id)

    monkeypatch.setattr("backend.app.api.v1.knowledge.process_document_ingestion", fake_ingestion)

    retried = client.post(f"/api/v1/documents/{failed_id}/retry", headers=headers)
    assert retried.status_code == 200, retried.text
    assert retried.json()["status"] == "pending"
    assert queued == [failed_id]

    refused = client.post(f"/api/v1/documents/{ready_id}/retry", headers=headers)
    assert refused.status_code == 400, refused.text

    missing = client.post(f"/api/v1/documents/{uuid.uuid4()}/retry", headers=headers)
    assert missing.status_code == 404, missing.text


@pytest.mark.asyncio
async def test_grounded_answer_falls_back_without_provider():
    from backend.app.db.session import async_session_factory
    from backend.app.models.assistant import Assistant
    from backend.app.services.llm import LLMService

    assistant = Assistant(
        project_id=uuid.uuid4(),
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
            workspace_id=uuid.uuid4(),
        )
        assert answer.used_llm is False
        assert answer.content == "Returns are accepted within 30 days."

        empty = await LLMService.generate_grounded_answer(
            db=session,
            assistant=assistant,
            query="Anything?",
            passages=[],
            workspace_id=uuid.uuid4(),
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
    assert upgrade.json()["documents_limit"] == 25 * 50

    async def load():
        async with async_session_factory() as session:
            stmt = WorkspacePlanEntitlement.__table__.select().where(
                WorkspacePlanEntitlement.workspace_id == uuid.UUID(workspace_id)
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

    anonymous = client.get("/api/v1/workspaces")
    assert anonymous.status_code == 401

    upload = client.post(
        f"/api/v1/sources/{uuid.uuid4()}/documents/upload",
        headers=headers,
        files=[("files", ("a.txt", io.BytesIO(b"hello"), "text/plain"))],
    )
    assert upload.status_code == 404, upload.text
