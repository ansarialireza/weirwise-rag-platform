"""Public Runtime API for embedded widgets, shareable playground links, and external clients."""

import time
import uuid

from backend.app.adapters.core_client import CoreApiClient, CoreApiException
from backend.app.core.logging import logger
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
from backend.app.models.project import Document, KnowledgeSource, Project
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
from backend.app.services.metering import metering_service
from backend.app.services.routing_engine import IntelligentRoutingEngine
from backend.app.services.webhooks import webhook_dispatcher
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/public", tags=["Public Assistant Runtime"])


async def resolve_public_deployment(
    assistant_id: uuid.UUID,
    x_widget_key: str | None = Header(None, alias="X-Widget-Key"),
    origin: str | None = Header(None, alias="Origin"),
    referer: str | None = Header(None, alias="Referer"),
    db: AsyncSession = Depends(get_db_session),
) -> tuple[Assistant, Deployment | None]:
    """Verify that assistant is PUBLISHED and deployment key/domains are valid."""
    a_stmt = select(Assistant).where(Assistant.id == assistant_id)
    a_res = await db.execute(a_stmt)
    assistant = a_res.scalar_one_or_none()

    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    if assistant.status != AssistantStatus.PUBLISHED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Assistant is not published. Live runtime access requires published status.",
        )

    # If widget key is provided, validate deployment
    deployment = None
    if x_widget_key:
        dep_stmt = select(Deployment).where(
            Deployment.assistant_id == assistant_id,
            Deployment.public_key == x_widget_key,
            Deployment.is_active == True,
        )
        dep_res = await db.execute(dep_stmt)
        deployment = dep_res.scalar_one_or_none()
        if not deployment:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid widget public key.")

        # Origin / Domain restriction check
        if deployment.allowed_domains and len(deployment.allowed_domains) > 0:
            request_origin = origin or referer or ""
            allowed = False
            for domain in deployment.allowed_domains:
                if domain in request_origin or domain == "*":
                    allowed = True
                    break
            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Origin domain is not permitted by this assistant deployment policy.",
                )

    return assistant, deployment


@router.get("/assistants/{assistant_id}/config", response_model=PublicRuntimeConfigResponse)
async def get_public_runtime_config(
    assistant_id: uuid.UUID,
    x_widget_key: str | None = Header(None, alias="X-Widget-Key"),
    db: AsyncSession = Depends(get_db_session),
) -> PublicRuntimeConfigResponse:
    """Retrieve public widget styling, greeting, and personality config without exposing prompts or credentials."""
    a_stmt = select(Assistant).where(Assistant.id == assistant_id)
    a_res = await db.execute(a_stmt)
    assistant = a_res.scalar_one_or_none()

    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    # Retrieve active deployment theme
    dep_stmt = select(Deployment).where(
        Deployment.assistant_id == assistant_id,
        Deployment.is_active == True,
    )
    if x_widget_key:
        dep_stmt = dep_stmt.where(Deployment.public_key == x_widget_key)

    dep_res = await db.execute(dep_stmt)
    deployment = dep_res.scalars().first()

    theme = deployment.theme_config if deployment else {}

    return PublicRuntimeConfigResponse(
        assistant_id=assistant.id,
        name=assistant.name,
        language=assistant.language or "en",
        tone=assistant.tone or "professional",
        welcome_message=theme.get("welcome_message", "Hello! How can I assist you with our services today?"),
        placeholder_text=theme.get("placeholder_text", "Ask us a question..."),
        primary_color=theme.get("primary_color", "#2563EB"),
        position=theme.get("position", "bottom-right"),
        show_branding=theme.get("show_branding", True),
        allowed_domains=deployment.allowed_domains if deployment else [],
    )


@router.post("/assistants/{assistant_id}/chat", response_model=ChatResponse)
async def public_chat(
    assistant_id: uuid.UUID,
    payload: ChatMessageRequest,
    request: Request,
    resolved: tuple[Assistant, Deployment | None] = Depends(resolve_public_deployment),
    db: AsyncSession = Depends(get_db_session),
) -> ChatResponse:
    """Submit a real user prompt from website widget or shareable assistant link.
    Grounded strictly in published knowledge base snapshot.
    """
    assistant, deployment = resolved
    start_time = time.perf_counter()

    # Get Workspace ID
    p_stmt = select(Project.workspace_id).where(Project.id == assistant.project_id)
    ws_id = (await db.execute(p_stmt)).scalar_one()

    # Enforce Usage Quota & Metering
    await metering_service.check_and_increment_chat_turn(
        db=db,
        workspace_id=ws_id,
        project_id=assistant.project_id,
        assistant_id=assistant.id,
    )

    # 1. Resolve or Create Conversation
    conv = None
    if payload.conversation_id:
        conv_stmt = select(Conversation).where(
            Conversation.id == payload.conversation_id,
            Conversation.assistant_id == assistant.id,
        )
        conv = (await db.execute(conv_stmt)).scalar_one_or_none()

    if not conv:
        conv = Conversation(
            assistant_id=assistant.id,
            session_token=payload.session_token or request.headers.get("X-Session-Token"),
            title=payload.message[:60],
        )
        db.add(conv)
        await db.flush()

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

    for ks in linked_sources:
        if ks.core_kb_id:
            try:
                search_data = await core_client.search(
                    kb_id=ks.core_kb_id,
                    query=payload.message,
                    top_k=assistant.top_k,
                    score_threshold=assistant.score_threshold,
                )
                for item in search_data.get("results", []):
                    # Find matching document for URL / metadata
                    doc_id = uuid.UUID(str(item["document_id"])) if "document_id" in item else None
                    doc_stmt = select(Document).where(Document.core_doc_id == doc_id)
                    doc_rec = (await db.execute(doc_stmt)).scalar_one_or_none()

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
            except CoreApiException as e:
                logger.warning(f"Vector search failed on Core KB {ks.core_kb_id}: {e!s}")

    # Deduplicate and sort citations
    citations.sort(key=lambda x: x.similarity_score, reverse=True)
    citations = citations[: assistant.top_k]

    # 4. Formulate Grounded Answer or Fallback
    is_grounded = bool(citations)
    if is_grounded:
        context_block = "\n\n".join(retrieved_contexts[:2])
        assistant_reply = (
            f"Based on our business knowledge: {context_block}\n\n"
            f"Let me know if you would like more assistance!"
        )
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
            workspace_id=ws_id,
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
        sources=citations,
        latency_ms=latency_ms,
        is_grounded=is_grounded,
        suggest_escalation=suggest_escalation,
    )


@router.post("/messages/{message_id}/feedback", response_model=AnswerFeedbackResponse)
async def submit_answer_feedback(
    message_id: uuid.UUID,
    payload: AnswerFeedbackRequest,
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
    db: AsyncSession = Depends(get_db_session),
) -> HumanHandoffResponse:
    """Escalate a conversation when customer requests human help."""
    c_stmt = select(Conversation).where(Conversation.id == conversation_id)
    conv = (await db.execute(c_stmt)).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

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
    p_stmt = select(Project.workspace_id).where(Project.id == assistant.project_id)
    ws_id = (await db.execute(p_stmt)).scalar_one()

    await webhook_dispatcher.dispatch_event(
        db=db,
        workspace_id=ws_id,
        event_type="handoff.requested",
        payload_data={
            "conversation_id": str(conv.id),
            "customer_email": payload.customer_email,
            "reason": payload.reason,
        },
    )

    await db.commit()
    await db.refresh(handoff)
    return HumanHandoffResponse.model_validate(handoff)
