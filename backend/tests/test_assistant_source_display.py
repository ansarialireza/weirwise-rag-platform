"""A Search Assistant may show its passages; an AI Assistant never shows sources.

Covers the whole contract end to end: the builder's setting survives an update, gets
frozen when the assistant ships, is advertised on the public config, and — the part
that actually matters — decides whether original text crosses the wire at all.
"""

import uuid
from contextlib import contextmanager
from types import SimpleNamespace

from backend.app.core.config import settings
from backend.app.main import app
from backend.app.models.assistant import Assistant
from backend.app.models.project import Document, KnowledgeSource
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

client = TestClient(app)

PASSAGE = "Refunds are open for 30 days from delivery."


@contextmanager
def _sync_db():
    engine = create_engine(settings.DATABASE_URL.replace("+aiosqlite", ""))
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _owner() -> tuple[dict[str, str], str]:
    uid = uuid.uuid4().hex[:8]
    email = f"srcdisp_{uid}@example.com"
    password = "SourceDisplay2026!"
    assert (
        client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password, "full_name": "Source Owner"},
        ).status_code
        == 201
    )
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    workspace = client.post("/api/v1/workspaces", headers=headers, json={"name": f"Src {uid}"})
    project = client.post(
        f"/api/v1/workspaces/{workspace.json()['id']}/projects",
        headers=headers,
        json={"name": f"Src project {uid}"},
    )
    return headers, project.json()["id"]


def _ready_source(project_id: str) -> str:
    """A knowledge source with one indexed document, so publishing is allowed."""
    with _sync_db() as session:
        source = KnowledgeSource(
            project_id=uuid.UUID(project_id),
            core_kb_id=uuid.uuid4(),
            name="Policy library",
            status="ready",
            settings={},
        )
        session.add(source)
        session.flush()
        session.add(
            Document(
                knowledge_source_id=source.id,
                core_doc_id=uuid.uuid4(),
                filename="returns.md",
                mime_type="text/markdown",
                file_size_bytes=64,
                content_hash="0" * 64,
                storage_path="/var/tmp/returns.md",
                status="ready",
                doc_metadata={},
            )
        )
        session.commit()
        return str(source.id)


def _published(headers: dict[str, str], project_id: str, **config) -> str:
    source_id = _ready_source(project_id)
    assistant = client.post(
        f"/api/v1/projects/{project_id}/assistants",
        headers=headers,
        json={"name": config.pop("name", "Source Assistant"), "knowledge_source_ids": [source_id], **config},
    )
    assert assistant.status_code == 201, assistant.text
    assistant_id = assistant.json()["id"]
    published = client.post(f"/api/v1/assistants/{assistant_id}/publish", headers=headers)
    assert published.status_code == 200, published.text
    return assistant_id


def _fake_retrieval(monkeypatch):
    """Give every search the same one-passage hit list, with no provider calls."""
    calls: list[str] = []

    async def _search(self, **_kwargs):
        return {
            "results": [
                {
                    "chunk_id": "chunk-1",
                    "document_id": str(uuid.uuid4()),
                    "content": PASSAGE,
                    "similarity_score": 0.93,
                    "rank": 1,
                }
            ]
        }

    async def _generate(**kwargs):
        calls.append(kwargs["query"])
        return SimpleNamespace(content="Written answer.")

    from backend.app.api.v1 import public_runtime

    monkeypatch.setattr(public_runtime.CoreApiClient, "search", _search)
    monkeypatch.setattr(public_runtime.llm_service, "generate_grounded_answer", _generate)
    return calls


def test_source_display_defaults_on_and_survives_an_update():
    headers, project_id = _owner()
    assistant = client.post(
        f"/api/v1/projects/{project_id}/assistants",
        headers=headers,
        json={"name": "Defaults", "engine_mode": "search_only"},
    ).json()
    assert assistant["show_sources"] is True

    patched = client.patch(
        f"/api/v1/assistants/{assistant['id']}",
        headers=headers,
        json={"show_sources": False},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["show_sources"] is False
    assert client.get(f"/api/v1/assistants/{assistant['id']}", headers=headers).json()["show_sources"] is False


def test_publish_freezes_the_mode_and_source_display_for_readers():
    headers, project_id = _owner()
    assistant_id = _published(headers, project_id, name="Frozen", engine_mode="search_only", show_sources=False)

    with _sync_db() as session:
        snapshot = session.get(Assistant, uuid.UUID(assistant_id)).published_snapshot

    assert snapshot["engine_mode"] == "search_only"
    assert snapshot["show_sources"] is False


def test_public_config_advertises_the_published_behaviour():
    headers, project_id = _owner()
    search_off = _published(headers, project_id, engine_mode="search_only", show_sources=False)
    ai = _published(headers, project_id, engine_mode="ai_answer")

    off = client.get(f"/api/v1/public/assistants/{search_off}/config").json()
    assert (off["engine_mode"], off["show_sources"]) == ("search_only", False)

    on = client.get(f"/api/v1/public/assistants/{ai}/config").json()
    assert (on["engine_mode"], on["show_sources"]) == ("ai_answer", True)


def test_disabled_search_assistant_keeps_original_text_off_the_wire(monkeypatch):
    _fake_retrieval(monkeypatch)
    headers, project_id = _owner()
    assistant_id = _published(headers, project_id, engine_mode="search_only", show_sources=False)

    answer = client.post(
        f"/api/v1/public/assistants/{assistant_id}/chat", json={"message": "What is the refund window?"}
    )
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert body["sources"] == []
    assert PASSAGE not in answer.text
    # Readers with sources off still get a sentence, not an empty bubble.
    assert body["is_grounded"] is True
    assert body["content"].strip() != ""


def test_enabled_search_assistant_returns_passages_and_skips_the_model(monkeypatch):
    llm_calls = _fake_retrieval(monkeypatch)
    headers, project_id = _owner()
    assistant_id = _published(headers, project_id, engine_mode="search_only", show_sources=True)

    body = client.post(
        f"/api/v1/public/assistants/{assistant_id}/chat", json={"message": "What is the refund window?"}
    ).json()

    assert [s["content"] for s in body["sources"]] == [PASSAGE]
    assert llm_calls == []


def test_ai_assistant_never_returns_sources_even_when_configured_to(monkeypatch):
    llm_calls = _fake_retrieval(monkeypatch)
    headers, project_id = _owner()
    # show_sources defaults to True; the mode, not the flag, decides.
    assistant_id = _published(headers, project_id, engine_mode="ai_answer", show_sources=True)

    body = client.post(
        f"/api/v1/public/assistants/{assistant_id}/chat", json={"message": "What is the refund window?"}
    ).json()

    assert body["sources"] == []
    assert body["content"] == "Written answer."
    assert llm_calls == ["What is the refund window?"]


def test_assistants_published_before_the_setting_keep_answering(monkeypatch):
    """A snapshot from an older build has neither key, so the live columns are used."""
    _fake_retrieval(monkeypatch)
    headers, project_id = _owner()
    assistant_id = _published(headers, project_id, engine_mode="search_only", show_sources=True)

    with _sync_db() as session:
        assistant = session.get(Assistant, uuid.UUID(assistant_id))
        assistant.published_snapshot = {"name": assistant.name, "version": assistant.version}
        session.commit()

    body = client.post(
        f"/api/v1/public/assistants/{assistant_id}/chat", json={"message": "What is the refund window?"}
    ).json()
    assert len(body["sources"]) == 1


def test_studio_search_chat_returns_its_passages_and_counts_them_aloud(monkeypatch):
    """The builder's endpoint is the one place the summary sentence is read out, so
    it has to name the hit list correctly and actually carry it."""
    from backend.app.api.v1 import assistants as assistants_api
    from backend.app.schemas.assistant import CitationItem

    async def _retrieve(_db, _assistant, query: str):
        count = 1 if query == "one" else 2
        return [CitationItem(content=PASSAGE, similarity_score=0.91, rank=rank) for rank in range(1, count + 1)]

    monkeypatch.setattr(assistants_api, "_retrieve_citations", _retrieve)
    headers, project_id = _owner()
    assistant_id = client.post(
        f"/api/v1/projects/{project_id}/assistants",
        headers=headers,
        json={"name": "Studio search", "engine_mode": "search_only"},
    ).json()["id"]

    one = client.post(f"/api/v1/assistants/{assistant_id}/chat", headers=headers, json={"message": "one"})
    assert one.status_code == 200, one.text
    assert one.json()["content"] == "Found 1 matching passage."
    assert [s["content"] for s in one.json()["sources"]] == [PASSAGE]

    two = client.post(f"/api/v1/assistants/{assistant_id}/chat", headers=headers, json={"message": "two"}).json()
    assert two["content"] == "Found 2 matching passages."
    assert len(two["sources"]) == 2
