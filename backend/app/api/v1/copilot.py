"""Weirwise Copilot API Router: Product Guidance & Deepgram Voice Conversations."""

from backend.app.api.admin_deps import require_admin_role, require_admin_user
from backend.app.api.dependencies import get_current_user
from backend.app.copilot.manager import copilot_manager
from backend.app.core.logging import logger
from backend.app.db.session import get_db_session
from backend.app.models.admin import AdminAuditLog, AdminRole
from backend.app.models.assistant import Conversation, Message
from backend.app.models.auth import User
from backend.app.schemas.copilot import (
    CopilotAdminConfigRequest,
    CopilotAdminConfigResponse,
    CopilotChatRequest,
    CopilotChatResponse,
    CopilotCitation,
    CopilotConversationDetail,
    CopilotMessageItem,
    VoiceSynthesizeRequest,
    VoiceTranscribeResponse,
)
from backend.app.services.assistant_runtime import execute_assistant_turn
from backend.app.services.deepgram import DeepgramError, deepgram_service
from backend.app.services.vault import decrypt_credential_secret, encrypt_credential_secret
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/copilot", tags=["Weirwise Copilot & Voice"])


async def _resolve_deepgram_key(db: AsyncSession) -> None:
    """Dynamically resolve Deepgram key from SystemConfig if present."""
    cfg = await copilot_manager.get_or_create_system_config(db)
    enc_keys = cfg.encrypted_secrets or {}
    if "deepgram_api_key" in enc_keys:
        try:
            raw_key = decrypt_credential_secret(enc_keys["deepgram_api_key"])
            deepgram_service.set_dynamic_key(raw_key)
        except Exception as e:
            logger.warning(f"Failed to decrypt stored Deepgram key: {e!s}")


@router.post("/chat", response_model=CopilotChatResponse)
async def chat_with_copilot(
    payload: CopilotChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> CopilotChatResponse:
    """Chat with the official Weirwise Copilot product guide via the unified Assistant Runtime."""
    # 1. Verify Copilot is enabled in system config
    sys_cfg = await copilot_manager.get_or_create_system_config(db)
    if not sys_cfg.config.get("is_enabled", True):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Weirwise Copilot is currently disabled by administrators.",
        )

    # 2. Resolve official Copilot assistant entity
    assistant = await copilot_manager.get_copilot_assistant(db)

    # Apply admin-configured model & temperature overrides
    assistant.model = sys_cfg.config.get("model", assistant.model)
    assistant.temperature = float(sys_cfg.config.get("temperature", assistant.temperature))
    assistant.top_k = int(sys_cfg.config.get("top_k", assistant.top_k))
    assistant.score_threshold = float(sys_cfg.config.get("score_threshold", assistant.score_threshold))

    # 3. Execute turn through unified Assistant Runtime
    runtime_resp = await execute_assistant_turn(
        db=db,
        assistant=assistant,
        message=payload.message,
        user=current_user,
        conversation_id=payload.conversation_id,
        chat_history_limit=6,
    )

    # Voice playback support check
    voice_supported = not payload.language.startswith("fa") and sys_cfg.config.get("voice_enabled", True)

    citations = [
        CopilotCitation(
            chunk_id=c.chunk_id,
            title=c.title or c.document_name or "Official Documentation",
            content=c.content,
            similarity_score=c.similarity_score,
            rank=c.rank,
        )
        for c in runtime_resp.sources
    ]

    return CopilotChatResponse(
        conversation_id=runtime_resp.conversation_id,
        message_id=runtime_resp.message_id,
        role=runtime_resp.role,
        content=runtime_resp.content,
        sources=citations,
        latency_ms=runtime_resp.latency_ms,
        is_grounded=runtime_resp.is_grounded,
        voice_supported=voice_supported,
    )


@router.get("/conversations", response_model=list[CopilotConversationDetail])
async def list_copilot_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[CopilotConversationDetail]:
    """List recent Copilot conversations for authenticated user."""
    assistant = await copilot_manager.get_copilot_assistant(db)

    stmt = (
        select(Conversation)
        .where(
            Conversation.user_id == current_user.id,
            Conversation.assistant_id == assistant.id,
        )
        .order_by(Conversation.created_at.desc())
        .limit(20)
    )
    res = await db.execute(stmt)
    convs = res.scalars().all()

    result: list[CopilotConversationDetail] = []
    for c in convs:
        m_stmt = select(Message).where(Message.conversation_id == c.id).order_by(Message.created_at.asc())
        m_res = await db.execute(m_stmt)
        msgs = m_res.scalars().all()

        msg_items = [
            CopilotMessageItem(
                id=m.id,
                role=m.role,
                content=m.content,
                sources=[
                    CopilotCitation(
                        chunk_id=item.get("chunk_id", ""),
                        title=item.get("title", item.get("document_name", "Official Documentation")),
                        content=item.get("content", ""),
                        similarity_score=float(item.get("similarity_score", 0.0)),
                        rank=int(item.get("rank", 1)),
                    )
                    for item in (m.citations or [])
                ],
                is_grounded=bool(m.is_grounded),
                created_at=m.created_at,
            )
            for m in msgs
        ]

        result.append(
            CopilotConversationDetail(
                id=c.id,
                title=c.title or "Copilot Conversation",
                created_at=c.created_at,
                messages=msg_items,
            )
        )
    return result


@router.post("/voice/transcribe", response_model=VoiceTranscribeResponse)
async def transcribe_voice(
    audio: UploadFile = File(...),
    language: str = Form(default="en"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> VoiceTranscribeResponse:
    """Transcribe speech audio file via Deepgram STT."""
    await _resolve_deepgram_key(db)

    try:
        content = await audio.read()
        res = await deepgram_service.transcribe_audio(
            audio_bytes=content,
            content_type=audio.content_type or "audio/webm",
            language=language,
        )
        return VoiceTranscribeResponse(
            transcript=res["transcript"],
            confidence=res["confidence"],
            language=res["language"],
            duration_seconds=res["duration_seconds"],
        )
    except DeepgramError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected voice transcription error: {e!s}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech transcription failed: {e!s}",
        )


@router.post("/voice/synthesize")
async def synthesize_voice(
    payload: VoiceSynthesizeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> Response:
    """Synthesize text to speech audio via Deepgram TTS."""
    await _resolve_deepgram_key(db)

    try:
        audio_bytes = await deepgram_service.synthesize_speech(
            text=payload.text,
            voice=payload.voice,
            language=payload.language,
        )
        return Response(content=audio_bytes, media_type="audio/mp3")
    except DeepgramError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected voice synthesis error: {e!s}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech synthesis failed: {e!s}",
        )


# --- Super Admin Management Endpoints ---


@router.get("/admin/config", response_model=CopilotAdminConfigResponse)
async def get_copilot_admin_config(
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
) -> CopilotAdminConfigResponse:
    """Super Admin endpoint: inspect active Copilot configuration with masked secrets."""
    sys_cfg = await copilot_manager.get_or_create_system_config(db)
    assistant = await copilot_manager.get_copilot_assistant(db)

    conf = sys_cfg.config
    enc_keys = sys_cfg.encrypted_secrets or {}
    has_key = "deepgram_api_key" in enc_keys or bool(deepgram_service.api_key)
    key_prefix = enc_keys.get("deepgram_key_prefix")

    return CopilotAdminConfigResponse(
        is_enabled=conf.get("is_enabled", True),
        provider=conf.get("provider", "openai"),
        model=conf.get("model", assistant.model),
        temperature=float(conf.get("temperature", assistant.temperature)),
        top_k=int(conf.get("top_k", assistant.top_k)),
        score_threshold=float(conf.get("score_threshold", assistant.score_threshold)),
        voice_enabled=conf.get("voice_enabled", True),
        deepgram_stt_model=conf.get("deepgram_stt_model", "nova-3"),
        deepgram_tts_model=conf.get("deepgram_tts_model", "aura-2-andromeda-en"),
        supported_languages=conf.get("supported_languages", ["en", "fa"]),
        has_deepgram_key=has_key,
        deepgram_key_prefix=key_prefix,
        assistant_id=assistant.id,
    )


@router.patch("/admin/config", response_model=CopilotAdminConfigResponse)
async def update_copilot_admin_config(
    payload: CopilotAdminConfigRequest,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
) -> CopilotAdminConfigResponse:
    """Super Admin endpoint: update active Copilot and voice configuration with encryption at rest."""
    sys_cfg = await copilot_manager.get_or_create_system_config(db)
    assistant = await copilot_manager.get_copilot_assistant(db)

    conf = dict(sys_cfg.config)
    enc_keys = dict(sys_cfg.encrypted_secrets or {})

    if payload.is_enabled is not None:
        conf["is_enabled"] = payload.is_enabled
    if payload.provider is not None:
        conf["provider"] = payload.provider
    if payload.model is not None:
        conf["model"] = payload.model
        assistant.model = payload.model
    if payload.temperature is not None:
        conf["temperature"] = payload.temperature
        assistant.temperature = payload.temperature
    if payload.top_k is not None:
        conf["top_k"] = payload.top_k
        assistant.top_k = payload.top_k
    if payload.score_threshold is not None:
        conf["score_threshold"] = payload.score_threshold
        assistant.score_threshold = payload.score_threshold
    if payload.voice_enabled is not None:
        conf["voice_enabled"] = payload.voice_enabled
    if payload.deepgram_stt_model is not None:
        conf["deepgram_stt_model"] = payload.deepgram_stt_model
    if payload.deepgram_tts_model is not None:
        conf["deepgram_tts_model"] = payload.deepgram_tts_model
    if payload.supported_languages is not None:
        conf["supported_languages"] = payload.supported_languages

    if payload.deepgram_api_key and payload.deepgram_api_key.strip():
        raw_key = payload.deepgram_api_key.strip()
        enc, s_hash, prefix = encrypt_credential_secret(raw_key)
        enc_keys["deepgram_api_key"] = enc
        enc_keys["deepgram_key_prefix"] = prefix
        deepgram_service.set_dynamic_key(raw_key)

    sys_cfg.config = conf
    sys_cfg.encrypted_secrets = enc_keys

    # Audit log
    audit = AdminAuditLog(
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        action="copilot.config_update",
        target_entity="system_config",
        target_id=str(sys_cfg.id),
        details={"provider": conf.get("provider"), "model": conf.get("model")},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(sys_cfg)

    has_key = "deepgram_api_key" in enc_keys or bool(deepgram_service.api_key)
    return CopilotAdminConfigResponse(
        is_enabled=conf.get("is_enabled", True),
        provider=conf.get("provider", "openai"),
        model=conf.get("model", assistant.model),
        temperature=float(conf.get("temperature", assistant.temperature)),
        top_k=int(conf.get("top_k", assistant.top_k)),
        score_threshold=float(conf.get("score_threshold", assistant.score_threshold)),
        voice_enabled=conf.get("voice_enabled", True),
        deepgram_stt_model=conf.get("deepgram_stt_model", "nova-3"),
        deepgram_tts_model=conf.get("deepgram_tts_model", "aura-2-andromeda-en"),
        supported_languages=conf.get("supported_languages", ["en", "fa"]),
        has_deepgram_key=has_key,
        deepgram_key_prefix=enc_keys.get("deepgram_key_prefix"),
        assistant_id=assistant.id,
    )
