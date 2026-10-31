"""Comprehensive Unit and Integration Tests for Weirwise Copilot & Deepgram Voice."""

import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
from backend.app.core.security import create_jwt_token, hash_password
from backend.app.db.session import async_session_factory
from backend.app.main import app
from backend.app.models.auth import User
from backend.app.services.deepgram import DeepgramError, DeepgramService
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def copilot_user():
    user_id = uuid.uuid4()
    async with async_session_factory() as session:
        u = User(
            id=user_id,
            email=f"copilot-user-{user_id.hex[:6]}@weirwise.local",
            full_name="Copilot Tester",
            hashed_password=hash_password("CopilotPass123!"),
            is_active=True,
            is_superuser=False,
        )
        session.add(u)
        await session.commit()
    token = create_jwt_token({"sub": str(user_id)}, timedelta(minutes=30))
    return {"user_id": user_id, "token": token}


@pytest.mark.asyncio
async def test_copilot_unauthenticated_request_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/copilot/chat", json={"message": "Hello"})
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_copilot_official_knowledge_retrieval(copilot_user):
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {copilot_user['token']}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Ask about supported file types in knowledge base
        resp = await client.post(
            "/api/v1/copilot/chat",
            headers=headers,
            json={"message": "What file types are supported for knowledge sources?"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_grounded"] is True
        assert len(data["sources"]) > 0
        assert "PDF" in data["content"] or "docx" in data["content"] or "markdown" in data["content"].lower()
        assert data["conversation_id"] is not None


@pytest.mark.asyncio
async def test_copilot_unknown_question_honest_fallback(copilot_user):
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {copilot_user['token']}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Ask question completely unrelated to product documentation
        resp = await client.post(
            "/api/v1/copilot/chat",
            headers=headers,
            json={"message": "What is the capital of Atlantis and the secret code?"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_grounded"] is False
        assert len(data["sources"]) == 0
        assert "do not have enough verified official Weirwise product documentation" in data["content"]


@pytest.mark.asyncio
async def test_copilot_conversation_persistence_and_listing(copilot_user):
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {copilot_user['token']}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # First turn
        r1 = await client.post(
            "/api/v1/copilot/chat",
            headers=headers,
            json={"message": "Explain workspace roles and permissions"},
        )
        assert r1.status_code == 200
        conv_id = r1.json()["conversation_id"]

        # Second turn in same conversation
        r2 = await client.post(
            "/api/v1/copilot/chat",
            headers=headers,
            json={"message": "What can an Owner do?", "conversation_id": conv_id},
        )
        assert r2.status_code == 200
        assert r2.json()["conversation_id"] == conv_id

        # List conversations
        list_resp = await client.get("/api/v1/copilot/conversations", headers=headers)
        assert list_resp.status_code == 200
        convs = list_resp.json()
        assert any(c["id"] == conv_id for c in convs)
        matched = next(c for c in convs if c["id"] == conv_id)
        assert len(matched["messages"]) >= 2


@pytest.mark.asyncio
async def test_deepgram_service_missing_api_key():
    svc = DeepgramService(api_key="")
    assert svc.is_configured() is False

    with pytest.raises(DeepgramError) as exc_info:
        await svc.transcribe_audio(b"dummy audio bytes")
    assert exc_info.value.status_code == 503

    with pytest.raises(DeepgramError) as exc_info:
        await svc.synthesize_speech("Hello test")
    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_deepgram_service_persian_tts_limitation():
    svc = DeepgramService(api_key="test_mock_key")
    with pytest.raises(DeepgramError) as exc_info:
        await svc.synthesize_speech("سلام وقت بخیر", language="fa")
    assert exc_info.value.status_code == 422
    assert "Persian text-to-speech voice is currently unsupported" in str(exc_info.value)


@pytest.mark.asyncio
async def test_deepgram_transcribe_endpoint_with_mock(copilot_user):
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {copilot_user['token']}"}

    mock_result = {
        "transcript": "How do I configure score threshold for my assistant?",
        "confidence": 0.98,
        "language": "en",
        "duration_seconds": 3.2,
    }

    with patch("backend.app.api.v1.copilot.deepgram_service.transcribe_audio", new_callable=AsyncMock) as mock_stt:
        mock_stt.return_value = mock_result

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            files = {"audio": ("speech.webm", b"RIFFmockwavcontent", "audio/webm")}
            resp = await client.post(
                "/api/v1/copilot/voice/transcribe",
                headers=headers,
                files=files,
                data={"language": "en"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["transcript"] == mock_result["transcript"]
            assert data["confidence"] == 0.98


@pytest.mark.asyncio
async def test_deepgram_synthesize_endpoint_with_mock(copilot_user):
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {copilot_user['token']}"}

    mock_audio = b"\xff\xf3\x44\xc4\x00\x00mp3framedata"

    with patch("backend.app.api.v1.copilot.deepgram_service.synthesize_speech", new_callable=AsyncMock) as mock_tts:
        mock_tts.return_value = mock_audio

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/copilot/voice/synthesize",
                headers=headers,
                json={"text": "Assistants are conversational agents grounded in your knowledge sources."},
            )
            assert resp.status_code == 200
            assert resp.headers["content-type"] == "audio/mp3"
            assert resp.content == mock_audio
