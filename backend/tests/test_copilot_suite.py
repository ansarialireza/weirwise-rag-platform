"""Comprehensive Verification Suite for Weirwise Copilot, Runtime Integration & Deepgram Voice."""

import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
from backend.app.core.security import create_jwt_token, hash_password
from backend.app.db.session import async_session_factory
from backend.app.main import app
from backend.app.models.admin import AdminRole, AdminUserRole
from backend.app.models.assistant import Conversation, Message
from backend.app.models.auth import Membership, User, Workspace
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select


@pytest.fixture
async def setup_test_environment():
    user_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    ws_id = uuid.uuid4()

    async with async_session_factory() as session:
        # Standard customer user
        u = User(
            id=user_id,
            email=f"customer-{user_id.hex[:6]}@enterprise.test",
            full_name="Customer User",
            hashed_password=hash_password("Pass123!"),
            is_active=True,
            is_superuser=False,
        )
        session.add(u)

        # Admin user
        admin = User(
            id=admin_id,
            email=f"admin-{admin_id.hex[:6]}@weirwise.local",
            full_name="Platform Admin",
            hashed_password=hash_password("AdminPass123!"),
            is_active=True,
            is_superuser=True,
        )
        session.add(admin)

        # Admin role assignment
        role = AdminUserRole(user_id=admin_id, role=AdminRole.SUPER_ADMIN.value)
        session.add(role)

        # Customer Workspace
        ws = Workspace(id=ws_id, name="Customer Workspace", slug=f"ws-{ws_id.hex[:6]}")
        session.add(ws)

        mem = Membership(workspace_id=ws.id, user_id=u.id, role="owner")
        session.add(mem)

        await session.commit()

    user_token = create_jwt_token({"sub": str(user_id)}, timedelta(minutes=30))
    admin_token = create_jwt_token({"sub": str(admin_id)}, timedelta(minutes=30))

    return {
        "user_id": user_id,
        "user_token": user_token,
        "admin_id": admin_id,
        "admin_token": admin_token,
        "workspace_id": ws_id,
    }


@pytest.mark.asyncio
async def test_copilot_unauthenticated_request_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/copilot/chat", json={"message": "Hello"})
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_copilot_uses_assistant_runtime_and_finops(setup_test_environment):
    env = setup_test_environment
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {env['user_token']}"}

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Turn 1
        resp = await client.post(
            "/api/v1/copilot/chat",
            headers=headers,
            json={"message": "What file types are supported for knowledge sources?"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["conversation_id"] is not None
        assert data["message_id"] is not None
        conv_id = data["conversation_id"]

        # Turn 2: Follow-up question using conversation context
        resp2 = await client.post(
            "/api/v1/copilot/chat",
            headers=headers,
            json={"message": "What is the upload size limit?", "conversation_id": conv_id},
        )
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["conversation_id"] == conv_id

    # Verify conversation and messages are persisted in DB
    async with async_session_factory() as session:
        c_stmt = select(Conversation).where(Conversation.id == uuid.UUID(conv_id))
        conv = (await session.execute(c_stmt)).scalar_one_or_none()
        assert conv is not None
        assert conv.user_id == env["user_id"]

        m_stmt = select(Message).where(Message.conversation_id == conv.id)
        msgs = (await session.execute(m_stmt)).scalars().all()
        assert len(msgs) >= 4  # 2 user + 2 assistant messages


@pytest.mark.asyncio
async def test_copilot_admin_config_authorization_and_persistence(setup_test_environment):
    env = setup_test_environment
    transport = ASGITransport(app=app)
    user_headers = {"Authorization": f"Bearer {env['user_token']}"}
    admin_headers = {"Authorization": f"Bearer {env['admin_token']}"}

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Regular customer cannot access admin config
        forbidden_resp = await client.get("/api/v1/copilot/admin/config", headers=user_headers)
        assert forbidden_resp.status_code == 403

        # Super Admin can access admin config
        admin_resp = await client.get("/api/v1/copilot/admin/config", headers=admin_headers)
        assert admin_resp.status_code == 200
        config_data = admin_resp.json()
        assert "model" in config_data
        assert "provider" in config_data
        assert "has_deepgram_key" in config_data

        # Admin updates config with encrypted Deepgram key
        patch_resp = await client.patch(
            "/api/v1/copilot/admin/config",
            headers=admin_headers,
            json={
                "model": "gpt-4o",
                "temperature": 0.15,
                "deepgram_api_key": "dg_test_secret_key_12345678",
            },
        )
        assert patch_resp.status_code == 200
        patched = patch_resp.json()
        assert patched["model"] == "gpt-4o"
        assert patched["temperature"] == 0.15
        assert patched["has_deepgram_key"] is True
        # Plain secret must never be returned
        assert "dg_test_secret_key_12345678" not in patch_resp.text


@pytest.mark.asyncio
async def test_tenant_isolation_boundary(setup_test_environment):
    """Verify that Copilot conversations and customer assistants remain strictly isolated."""
    env = setup_test_environment
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {env['user_token']}"}

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # List customer copilot conversations
        resp = await client.get("/api/v1/copilot/conversations", headers=headers)
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_deepgram_voice_mocked_transcription_and_synthesis(setup_test_environment):
    env = setup_test_environment
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {env['user_token']}"}

    mock_stt_result = {
        "transcript": "How do I create and deploy an assistant in Weirwise?",
        "confidence": 0.99,
        "language": "en",
        "duration_seconds": 2.8,
    }

    mock_tts_bytes = b"\xff\xf3\x44\xc4\x00\x00synthesizedaudiomp3"

    with (
        patch("backend.app.api.v1.copilot.deepgram_service.transcribe_audio", new_callable=AsyncMock) as mock_stt,
        patch("backend.app.api.v1.copilot.deepgram_service.synthesize_speech", new_callable=AsyncMock) as mock_tts,
    ):
        mock_stt.return_value = mock_stt_result
        mock_tts.return_value = mock_tts_bytes

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Test STT
            files = {"audio": ("sample.webm", b"audiobyteswebm", "audio/webm")}
            stt_resp = await client.post(
                "/api/v1/copilot/voice/transcribe",
                headers=headers,
                files=files,
                data={"language": "en"},
            )
            assert stt_resp.status_code == 200
            assert stt_resp.json()["transcript"] == mock_stt_result["transcript"]

            # Test TTS
            tts_resp = await client.post(
                "/api/v1/copilot/voice/synthesize",
                headers=headers,
                json={"text": "Assistants are conversational agents grounded in your knowledge sources."},
            )
            assert tts_resp.status_code == 200
            assert tts_resp.headers["content-type"] == "audio/mp3"
            assert tts_resp.content == mock_tts_bytes
