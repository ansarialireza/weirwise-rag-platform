"""Public Runtime API for embedded widgets, shareable playground links, and external clients."""

import asyncio
import time
import uuid
from datetime import UTC, datetime
from urllib.parse import urlsplit

from backend.app.adapters.core_client import CoreApiClient, CoreApiException
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.core.security import generate_secure_token, hash_token
from backend.app.db.session import get_db_session
from backend.app.models.assistant import (
    AnswerFeedback,
    Assistant,
    AssistantKnowledgeSource,
    AssistantStatus,
    Conversation,
    Deployment,
    HumanHandoffRequest,
    Message,
    UnansweredQuery,
)
from backend.app.models.audit import ApiCredential
from backend.app.models.project import Document, KnowledgeSource
from backend.app.schemas.assistant import (
    AnswerFeedbackRequest,
    AnswerFeedbackResponse,
    ChatMessageRequest,
    ChatResponse,
    CitationItem,
    HumanHandoffCreateRequest,
    HumanHandoffResponse,
    PublicRuntimeConfigResponse,
)
from backend.app.services.auth_rate_limiter import client_ip
from backend.app.services.llm import llm_service
from backend.app.services.metering import metering_service
from backend.app.services.public_rate_limiter import enforce_public_limit
from backend.app.services.webhooks import webhook_dispatcher
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/public", tags=["Public Assistant Runtime"])

_SLOW_DOWN_MESSAGE = "You're sending messages too quickly. Please wait a moment and try again."


async def _guard_public_chat(
    request: Request,
    assistant: Assistant,
    deployment: Deployment | None,
    credential: ApiCredential | None,
) -> None:
    """Bound anonymous chat by client IP and by deployment capacity."""
    await enforce_public_limit(
        scope="chat_ip",
        identifier=client_ip(request),
        limit=settings.PUBLIC_CHAT_IP_LIMIT,
        window_seconds=settings.PUBLIC_CHAT_IP_WINDOW_SECONDS,
        message=_SLOW_DOWN_MESSAGE,
    )
    if credential:
        deployment_key = f"api:{credential.id}"
    elif deployment:
        deployment_key = str(deployment.id)
    else:
        deployment_key = f"assistant:{assistant.id}"
    await enforce_public_limit(
        scope="chat_deployment",
        identifier=deployment_key,
        limit=settings.PUBLIC_CHAT_DEPLOYMENT_LIMIT,
        window_seconds=settings.PUBLIC_CHAT_DEPLOYMENT_WINDOW_SECONDS,
        message="This assistant is receiving a lot of messages right now. Please try again in a moment.",
    )


def _hostname(value: str | None) -> str:
    """Extract a lowercase hostname from an Origin, Referer, or domain entry."""
    if not value:
        return ""
    candidate = value if "://" in value else f"https://{value}"
    try:
        return (urlsplit(candidate).hostname or "").lower()
    except ValueError:
        return ""


def origin_is_allowed(request_origin: str | None, allowed_domains: list[str] | None) -> bool:
    """Match the request hostname exactly, allowing explicit wildcard subdomains.

    Substring matching is intentionally not used: it would accept
    `mycompany.com.attacker.net` for an allowlisted `mycompany.com`.
    """
    if not allowed_domains:
        return True
    if "*" in allowed_domains:
        return True

    request_host = _hostname(request_origin)
    if not request_host:
        return False

    for entry in allowed_domains:
        allowed_host = _hostname(entry)
        if not allowed_host:
            continue
        if allowed_host.startswith("*."):
            suffix = allowed_host[2:]
            if request_host == suffix or request_host.endswith(f".{suffix}"):
                return True
        elif request_host == allowed_host:
            return True
    return False


def _session_token(request: Request, body_token: str | None = None) -> str | None:
    return body_token or request.headers.get("X-Session-Token")


def _published_behaviour(assistant: Assistant) -> tuple[str, bool]:
    """The engine mode and source-display flag as they were when the assistant shipped.

    Falls back to the live columns for assistants published before either existed, so
    an already-live widget keeps answering instead of failing on a missing key.
    """
    snapshot = assistant.published_snapshot or {}
    engine_mode = snapshot.get("engine_mode") or assistant.engine_mode or "ai_answer"
    show_sources = snapshot.get("show_sources")
    if show_sources is None:
        show_sources = bool(assistant.show_sources)
    return engine_mode, bool(show_sources)


def _credential_is_expired(credential: ApiCredential) -> bool:
    if not credential.expires_at:
        return False
    expires_at = credential.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return expires_at <= datetime.now(UTC)


async def _active_api_credential(x_api_key: str, db: AsyncSession) -> ApiCredential:
    stmt = select(ApiCredential).where(
        ApiCredential.key_hash == hash_token(x_api_key),
        ApiCredential.is_active.is_(True),
    )
    credential = (await db.execute(stmt)).scalar_one_or_none()
    if not credential or credential.revoked_at or _credential_is_expired(credential):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API key.")
    return credential


async def _active_deployment(assistant_id: uuid.UUID, db: AsyncSession) -> Deployment | None:
    stmt = (
        select(Deployment)
        .where(Deployment.assistant_id == assistant_id, Deployment.is_active.is_(True))
        .order_by(Deployment.created_at.desc())
    )
    return (await db.execute(stmt)).scalars().first()


async def resolve_public_deployment(
    assistant_id: uuid.UUID,
    x_widget_key: str | None = Header(None, alias="X-Widget-Key"),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    origin: str | None = Header(None, alias="Origin"),
    referer: str | None = Header(None, alias="Referer"),
    db: AsyncSession = Depends(get_db_session),
) -> tuple[Assistant, Deployment | None, ApiCredential | None]:
    """Verify that the assistant is published and the caller is allowed to use it.

    Three access modes are supported: a server-to-server API key, a browser widget
    key bound to allowed domains, or the public share link with no key.
    """
    a_stmt = select(Assistant).where(Assistant.id == assistant_id)
    a_res = await db.execute(a_stmt)
    assistant = a_res.scalar_one_or_none()

    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    if assistant.status != AssistantStatus.PUBLISHED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This assistant isn't live yet.",
        )

    # Server-to-server API keys bypass browser domain rules but stay user-scoped.
    if x_api_key:
        credential = await _active_api_credential(x_api_key, db)
        if assistant.user_id != credential.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This API key can't access this assistant.",
            )
        return assistant, await _active_deployment(assistant_id, db), credential

    deployment = None
    if x_widget_key:
        dep_stmt = select(Deployment).where(
            Deployment.assistant_id == assistant_id,
            Deployment.public_key == x_widget_key,
            Deployment.is_active.is_(True),
        )
        dep_res = await db.execute(dep_stmt)
        deployment = dep_res.scalar_one_or_none()
        if not deployment:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid widget public key.")

        # Origin / Domain restriction check
        if deployment.allowed_domains:
            request_origin = origin or referer or ""
            if not origin_is_allowed(request_origin, deployment.allowed_domains):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This website isn't allowed to use this assistant.",
                )

    return assistant, deployment, None


@router.get("/assistants/{assistant_id}/config", response_model=PublicRuntimeConfigResponse)
async def get_public_runtime_config(
    assistant_id: uuid.UUID,
    request: Request,
    resolved: tuple[Assistant, Deployment | None, ApiCredential | None] = Depends(resolve_public_deployment),
) -> PublicRuntimeConfigResponse:
    """Retrieve public widget styling, greeting, and personality config without exposing prompts or credentials."""
    await enforce_public_limit(
        scope="config_ip",
        identifier=client_ip(request),
        limit=settings.PUBLIC_CONFIG_IP_LIMIT,
        window_seconds=settings.PUBLIC_CONFIG_IP_WINDOW_SECONDS,
        message="Too many requests. Please try again shortly.",
    )
    assistant, deployment, credential = resolved

    if credential and "assistants:read" not in (credential.scopes or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This API key isn't allowed to read assistant configuration.",
        )

    theme = deployment.theme_config if deployment else {}
    engine_mode, show_sources = _published_behaviour(assistant)

    return PublicRuntimeConfigResponse(
        assistant_id=assistant.id,
        name=assistant.name,
        language=assistant.language or "en",
        tone=assistant.tone or "professional",
        engine_mode=engine_mode,
        show_sources=show_sources,
        welcome_message=theme.get("welcome_message", "Hello! How can I assist you with our services today?"),
        placeholder_text=theme.get("placeholder_text", "Ask us a question..."),
        primary_color=theme.get("primary_color", "#3FD0DA"),
        position=theme.get("position", "bottom-right"),
        show_branding=theme.get("show_branding", True),
        allowed_domains=deployment.allowed_domains if deployment else [],
    )


@router.post("/assistants/{assistant_id}/chat", response_model=ChatResponse)
async def public_chat(
    assistant_id: uuid.UUID,
    payload: ChatMessageRequest,
    request: Request,
    resolved: tuple[Assistant, Deployment | None, ApiCredential | None] = Depends(resolve_public_deployment),
    db: AsyncSession = Depends(get_db_session),
) -> ChatResponse:
    """Submit a real user prompt from website widget or shareable assistant link.
    Grounded strictly in published knowledge base snapshot.
    """
    assistant, deployment, credential = resolved
    start_time = time.perf_counter()

    if credential and "assistants:chat" not in (credential.scopes or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This API key isn't allowed to start conversations.",
        )

    # Reject scripted floods before spending quota, retrieval, or provider budget.
    await _guard_public_chat(request, assistant, deployment, credential)

    # Enforce Usage Quota & Metering for assistant owner
    await metering_service.record_chat_turn(
        db=db,
        user_id=assistant.user_id,
        assistant_id=assistant.id,
        model_name=assistant.model,
    )

    # 1. Resolve or Create Conversation
    incoming_token = _session_token(request, payload.session_token)
    conv = None
    if payload.conversation_id:
        conv_stmt = select(Conversation).where(
            Conversation.id == payload.conversation_id,
            Conversation.assistant_id == assistant.id,
        )
        conv = (await db.execute(conv_stmt)).scalar_one_or_none()
        if conv and conv.session_token and incoming_token != conv.session_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your conversation expired. Please refresh and try again.",
            )

    session_token = incoming_token
    if not conv:
        session_token = incoming_token or generate_secure_token("wws_")[0]
        conv = Conversation(
            assistant_id=assistant.id,
            session_token=session_token,
            title=payload.message[:60],
        )
        db.add(conv)
        await db.flush()
    else:
        session_token = conv.session_token or session_token

    # 2. Record User Message
    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        content=payload.message,
    )
    db.add(user_msg)
    await db.flush()

    # 3. Retrieve Grounding Citations across attached knowledge sources
    core_client = CoreApiClient()
    citations: list[CitationItem] = []
    retrieved_contexts: list[str] = []

    sources_stmt = (
        select(KnowledgeSource)
        .join(AssistantKnowledgeSource, AssistantKnowledgeSource.knowledge_source_id == KnowledgeSource.id)
        .where(AssistantKnowledgeSource.assistant_id == assistant.id)
        .order_by(AssistantKnowledgeSource.priority.desc())
    )
    s_res = await db.execute(sources_stmt)
    linked_sources = s_res.scalars().all()

    # Query Core vector indexes concurrently across all linked sources
    active_sources = [ks for ks in linked_sources if ks.core_kb_id]

    async def _query_public_kb(ks: KnowledgeSource) -> list[dict]:
        try:
            search_data = await core_client.search(
                kb_id=ks.core_kb_id,
                query=payload.message,
                top_k=assistant.top_k,
                score_threshold=assistant.score_threshold,
            )
            return search_data.get("results", [])
        except CoreApiException as e:
            logger.warning(f"Vector search failed on Core KB {ks.core_kb_id}: {e!s}")
            return []

    results_lists = await asyncio.gather(*[_query_public_kb(ks) for ks in active_sources])
    all_raw_items = [item for sublist in results_lists for item in sublist]

    # Batch lookup matching documents to eliminate N+1 DB queries
    raw_doc_ids = [
        uuid.UUID(str(item["document_id"])) for item in all_raw_items if "document_id" in item and item["document_id"]
    ]
    doc_map: dict[uuid.UUID, Document] = {}
    if raw_doc_ids:
        docs_stmt = select(Document).where(Document.core_doc_id.in_(raw_doc_ids))
        docs_res = await db.execute(docs_stmt)
        for d in docs_res.scalars():
            if d.core_doc_id:
                doc_map[d.core_doc_id] = d

    for item in all_raw_items:
        doc_id = uuid.UUID(str(item["document_id"])) if "document_id" in item and item["document_id"] else None
        doc_rec = doc_map.get(doc_id) if doc_id else None

        source_url = doc_rec.doc_metadata.get("source_url") if doc_rec else None
        title = doc_rec.filename if doc_rec else "Knowledge Document"

        c_item = CitationItem(
            document_id=doc_rec.id if doc_rec else None,
            document_name=title,
            chunk_id=str(item.get("chunk_id")),
            source_url=source_url,
            title=title,
            content=item.get("content", ""),
            similarity_score=item.get("similarity_score", 0.0),
            rank=item.get("rank", 1),
        )
        citations.append(c_item)
        retrieved_contexts.append(item.get("content", ""))

    # Deduplicate and sort citations
    citations.sort(key=lambda x: x.similarity_score, reverse=True)
    citations = citations[: assistant.top_k]

    # 4. Formulate Grounded Answer or Fallback
    engine_mode, show_sources = _published_behaviour(assistant)
    # Only a Search Assistant whose publisher enabled sources ever lets original text
    # cross the wire. Hiding it in the interface would leave the passages one
    # devtools panel away, so the server decides, and every channel obeys.
    sources_visible = engine_mode == "search_only" and show_sources
    is_grounded = bool(citations)
    if is_grounded and engine_mode == "search_only":
        # A published Search Assistant hands back the passages it found and never
        # spends provider budget writing prose over them; the retrieval already is
        # the answer. What readers may open is decided by show_sources below.
        assistant_reply = f"Found {len(citations)} matching passage{'s' if len(citations) != 1 else ''}."
    elif is_grounded:
        answer = await llm_service.generate_grounded_answer(
            db=db,
            assistant=assistant,
            query=payload.message,
            passages=[c.content for c in citations],
            user_id=assistant.user_id,
        )
        assistant_reply = answer.content
    else:
        assistant_reply = assistant.fallback_message
        # Track unanswered query for analytics
        uq = UnansweredQuery(
            assistant_id=assistant.id,
            conversation_id=conv.id,
            query_text=payload.message,
            fallback_reason="insufficient_grounding_evidence",
        )
        db.add(uq)
        # Webhook dispatch: question.unanswered
        await webhook_dispatcher.dispatch_event(
            db=db,
            user_id=assistant.user_id,
            event_type="question.unanswered",
            payload_data={"query": payload.message, "assistant_id": str(assistant.id)},
        )

    latency_ms = int((time.perf_counter() - start_time) * 1000)

    # 5. Record Assistant Message
    assistant_msg = Message(
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

    # Check for escalation suggestion
    suggest_escalation = not is_grounded and bool(assistant.escalation_email)

    return ChatResponse(
        conversation_id=conv.id,
        message_id=assistant_msg.id,
        role="assistant",
        content=assistant_reply,
        sources=citations if sources_visible else [],
        latency_ms=latency_ms,
        is_grounded=is_grounded,
        suggest_escalation=suggest_escalation,
        session_token=session_token,
    )


@router.post("/messages/{message_id}/feedback", response_model=AnswerFeedbackResponse)
async def submit_answer_feedback(
    message_id: uuid.UUID,
    payload: AnswerFeedbackRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> AnswerFeedbackResponse:
    """Submit thumbs up/down customer feedback on an assistant message."""
    m_stmt = select(Message).where(Message.id == message_id)
    msg = (await db.execute(m_stmt)).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")

    # Find conversation and assistant
    c_stmt = select(Conversation).where(Conversation.id == msg.conversation_id)
    conv = (await db.execute(c_stmt)).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if conv.session_token and _session_token(request) != conv.session_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your conversation expired. Please refresh and try again.",
        )

    # Check existing feedback
    fb_stmt = select(AnswerFeedback).where(AnswerFeedback.message_id == message_id)
    fb = (await db.execute(fb_stmt)).scalar_one_or_none()

    if fb:
        fb.rating = payload.rating
        fb.reason = payload.reason
        fb.comment = payload.comment
    else:
        fb = AnswerFeedback(
            assistant_id=conv.assistant_id,
            conversation_id=conv.id,
            message_id=msg.id,
            rating=payload.rating,
            reason=payload.reason,
            comment=payload.comment,
        )
        db.add(fb)

    await db.commit()
    await db.refresh(fb)
    return AnswerFeedbackResponse.model_validate(fb)


@router.post("/conversations/{conversation_id}/handoff", response_model=HumanHandoffResponse)
async def request_human_handoff(
    conversation_id: uuid.UUID,
    payload: HumanHandoffCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> HumanHandoffResponse:
    """Escalate a conversation when customer requests human help."""
    c_stmt = select(Conversation).where(Conversation.id == conversation_id)
    conv = (await db.execute(c_stmt)).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if conv.session_token and _session_token(request) != conv.session_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your conversation expired. Please refresh and try again.",
        )

    conv.is_escalated = True
    conv.escalation_reason = payload.reason
    conv.escalation_contact = payload.customer_email

    handoff = HumanHandoffRequest(
        conversation_id=conv.id,
        customer_email=payload.customer_email,
        customer_name=payload.customer_name,
        reason=payload.reason,
        status="pending",
    )
    db.add(handoff)

    # Dispatch handoff webhook
    a_stmt = select(Assistant).where(Assistant.id == conv.assistant_id)
    assistant = (await db.execute(a_stmt)).scalar_one()

    await webhook_dispatcher.dispatch(
        db=db,
        user_id=assistant.user_id,
        event_type="handoff.requested",
        payload={
            "conversation_id": str(conv.id),
            "customer_email": payload.customer_email,
            "reason": payload.reason,
        },
    )

    await db.commit()
    await db.refresh(handoff)
    return HumanHandoffResponse.model_validate(handoff)
