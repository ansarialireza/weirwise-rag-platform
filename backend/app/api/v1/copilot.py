"""Weirwise Copilot API Router: Product Guidance & Deepgram Voice Conversations."""

import time
import uuid
from typing import Optional

from backend.app.api.dependencies import get_current_user
from backend.app.copilot.service import copilot_knowledge_store
from backend.app.core.logging import logger
from backend.app.db.session import get_db_session
from backend.app.models.assistant import Conversation, Message
from backend.app.models.auth import User
from backend.app.schemas.copilot import (
    CopilotChatRequest,
    CopilotChatResponse,
    CopilotCitation,
    CopilotConversationDetail,
    CopilotMessageItem,
    VoiceSynthesizeRequest,
    VoiceTranscribeResponse,
)
from backend.app.services.deepgram import DeepgramError, deepgram_service
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

# Internal fixed Copilot Assistant ID (non-customer owned)
COPILOT_SYSTEM_ASSISTANT_ID = uuid.UUID("00000000-0000-0000-c091-000000000001")
COPILOT_FALLBACK_MESSAGE = (
    "I am sorry, but I do not have enough verified official Weirwise product documentation "
    "to answer that question accurately. "
    "Please check our documentation or contact the Weirwise support team."
)


@router.post("/chat", response_model=CopilotChatResponse)
async def chat_with_copilot(
    payload: CopilotChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> CopilotChatResponse:
    """Chat with the official Weirwise Copilot product guide."""
    start_time = time.perf_counter()

    # 1. Resolve or create user's Copilot conversation
    conv: Optional[Conversation] = None
    if payload.conversation_id:
        c_stmt = select(Conversation).where(
            Conversation.id == payload.conversation_id,
            Conversation.user_id == current_user.id,
            Conversation.assistant_id == COPILOT_SYSTEM_ASSISTANT_ID,
        )
        c_res = await db.execute(c_stmt)
        conv = c_res.scalar_one_or_none()
        if not conv:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if not conv:
        conv = Conversation(
            id=uuid.uuid4(),
            assistant_id=COPILOT_SYSTEM_ASSISTANT_ID,
            user_id=current_user.id,
            title=payload.message[:60],
        )
        db.add(conv)
        await db.flush()

    # 2. Record User Message
    user_msg = Message(
        id=uuid.uuid4(),
        conversation_id=conv.id,
        role="user",
        content=payload.message,
    )
    db.add(user_msg)
    await db.flush()

    # 3. Retrieve verified official knowledge from curated store
    raw_citations = copilot_knowledge_store.search(
        query=payload.message,
        top_k=3,
        score_threshold=0.20,
    )

    citations: list[CopilotCitation] = [
        CopilotCitation(
            chunk_id=c["chunk_id"],
            title=c["title"],
            content=c["content"],
            similarity_score=c["similarity_score"],
            rank=c["rank"],
        )
        for c in raw_citations
    ]

    is_grounded = bool(citations)
    if is_grounded:
        top_chunk = citations[0]
        assistant_reply = (
            f"According to official Weirwise documentation ({top_chunk.title}):\n\n"
            f"{top_chunk.content}\n\n"
            "Is there anything specific you would like me to explain further?"
        )
    else:
        assistant_reply = COPILOT_FALLBACK_MESSAGE

    latency_ms = int((time.perf_counter() - start_time) * 1000)

    # 4. Record Assistant Message
    assistant_msg = Message(
        id=uuid.uuid4(),
        conversation_id=conv.id,
        role="assistant",
        content=assistant_reply,
        citations=[c.model_dump(mode="json") for c in citations],
        latency_ms=latency_ms,
        is_grounded=is_grounded,
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    # Voice playback is supported for English; Persian TTS is unverified/unsupported
    voice_supported = not payload.language.startswith("fa")

    return CopilotChatResponse(
        conversation_id=conv.id,
        message_id=assistant_msg.id,
        role="assistant",
        content=assistant_reply,
        sources=citations,
        latency_ms=latency_ms,
        is_grounded=is_grounded,
        voice_supported=voice_supported,
    )


@router.get("/conversations", response_model=list[CopilotConversationDetail])
async def list_copilot_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[CopilotConversationDetail]:
    """List recent Copilot conversations for authenticated user."""
    stmt = (
        select(Conversation)
        .where(
            Conversation.user_id == current_user.id,
            Conversation.assistant_id == COPILOT_SYSTEM_ASSISTANT_ID,
        )
        .order_by(Conversation.created_at.desc())
        .limit(20)
    )
    res = await db.execute(stmt)
    convs = res.scalars().all()

    result: list[CopilotConversationDetail] = []
    for c in convs:
        # Load messages
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
                        title=item.get("title", "Official Documentation"),
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
) -> VoiceTranscribeResponse:
    """Transcribe speech audio file via Deepgram STT."""
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
) -> Response:
    """Synthesize text to speech audio via Deepgram TTS."""
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
