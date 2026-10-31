"""Comprehensive Assistant Lifecycle, Conversations, Citations, Golden Evaluations, and Knowledge Gap Analytics."""

import time
import uuid
from datetime import UTC, datetime

from backend.app.adapters.core_client import CoreApiClient, CoreApiException
from backend.app.api.dependencies import (
    WorkspaceContext,
    get_current_user,
    require_workspace,
)
from backend.app.core.logging import logger
from backend.app.core.security import generate_secure_token
from backend.app.db.session import get_db_session
from backend.app.models.assistant import (
    AnswerFeedback,
    Assistant,
    AssistantKnowledgeSource,
    AssistantStatus,
    Conversation,
    Deployment,
    EvaluationCase,
    Message,
    UnansweredQuery,
)
from backend.app.models.audit import ApiCredential, UsageEvent
from backend.app.models.auth import Membership, User, WorkspaceRole
from backend.app.models.project import Document, KnowledgeSource, Project
from backend.app.schemas.assistant import (
    ApiCredentialCreateRequest,
    ApiCredentialResponse,
    AssistantCreateRequest,
    AssistantResponse,
    AssistantUpdateRequest,
    ChatMessageRequest,
    ChatResponse,
    CitationItem,
    ConversationResponse,
    DeploymentCreateRequest,
    DeploymentResponse,
    EvaluationCaseCreateRequest,
    EvaluationCaseResponse,
    KnowledgeGapAnalyticsResponse,
    MessageResponse,
    PublishValidationResponse,
)
from backend.app.services.evaluations import evaluation_service
from backend.app.services.metering import metering_service
from backend.app.services.routing_engine import IntelligentRoutingEngine
from backend.app.services.webhooks import webhook_dispatcher
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["Assistants, Intelligence & Lifecycle"])


async def verify_project_access(project_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Project:
    stmt = (
        select(Project)
        .join(Membership, Membership.workspace_id == Project.workspace_id)
        .where(Project.id == project_id, Membership.user_id == user_id)
    )
    res = await db.execute(stmt)
    proj = res.scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found or access denied.")
    return proj


# --- Assistant Management & Creation Wizard ---


@router.post("/projects/{project_id}/assistants", response_model=AssistantResponse, status_code=status.HTTP_201_CREATED)
async def create_assistant(
    project_id: uuid.UUID,
    payload: AssistantCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> AssistantResponse:
    """Create a new Assistant in DRAFT state with business tone and fallback settings."""
    project = await verify_project_access(project_id, current_user.id, db)

    # Entitlement check
    count_stmt = (
        select(func.count(Assistant.id))
        .join(Project, Project.id == Assistant.project_id)
        .where(Project.workspace_id == project.workspace_id)
    )
    current_count = (await db.execute(count_stmt)).scalar() or 0
    await metering_service.check_assistant_creation_limit(db, project.workspace_id, current_count)

    assistant = Assistant(
        project_id=project_id,
        name=payload.name,
        description=payload.description,
        system_instructions=payload.system_instructions,
        model=payload.model,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        score_threshold=payload.score_threshold,
        top_k=payload.top_k,
        language=payload.language,
        tone=payload.tone,
        fallback_message=payload.fallback_message,
        escalation_email=payload.escalation_email,
        status=AssistantStatus.DRAFT.value,
    )
    db.add(assistant)
    await db.flush()

    source_ids = []
    if payload.knowledge_source_ids:
        for sid in payload.knowledge_source_ids:
            ks_res = await db.execute(
                select(KnowledgeSource).where(KnowledgeSource.id == sid, KnowledgeSource.project_id == project_id)
            )
            if not ks_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"KnowledgeSource {sid} does not belong to this project.",
                )
            link = AssistantKnowledgeSource(assistant_id=assistant.id, knowledge_source_id=sid)
            db.add(link)
            source_ids.append(sid)

    await db.commit()
    await db.refresh(assistant)

    resp = AssistantResponse.model_validate(assistant)
    resp.knowledge_source_ids = source_ids
    return resp


@router.get("/projects/{project_id}/assistants", response_model=list[AssistantResponse])
async def list_project_assistants(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[AssistantResponse]:
    """List all assistants scoped to a project."""
    await verify_project_access(project_id, current_user.id, db)

    stmt = select(Assistant).where(Assistant.project_id == project_id).order_by(Assistant.created_at.desc())
    res = await db.execute(stmt)
    assistants = res.scalars().all()

    output = []
    for a in assistants:
        resp = AssistantResponse.model_validate(a)
        links_res = await db.execute(
            select(AssistantKnowledgeSource.knowledge_source_id).where(AssistantKnowledgeSource.assistant_id == a.id)
        )
        resp.knowledge_source_ids = list(links_res.scalars().all())
        output.append(resp)
    return output


@router.get("/assistants/{assistant_id}", response_model=AssistantResponse)
async def get_assistant(
    assistant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> AssistantResponse:
    """Retrieve assistant details, grounding settings, and linked sources."""
    a_res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = a_res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    await verify_project_access(assistant.project_id, current_user.id, db)

    links_res = await db.execute(
        select(AssistantKnowledgeSource.knowledge_source_id).where(
            AssistantKnowledgeSource.assistant_id == assistant.id
        )
    )
    resp = AssistantResponse.model_validate(assistant)
    resp.knowledge_source_ids = list(links_res.scalars().all())
    return resp


@router.patch("/assistants/{assistant_id}", response_model=AssistantResponse)
async def update_assistant(
    assistant_id: uuid.UUID,
    payload: AssistantUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> AssistantResponse:
    """Update assistant behavior, model parameters, or linked sources."""
    a_res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = a_res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    await verify_project_access(assistant.project_id, current_user.id, db)

    for field, val in payload.model_dump(exclude_unset=True).items():
        if field == "knowledge_source_ids":
            continue
        setattr(assistant, field, val)

    if payload.knowledge_source_ids is not None:
        from sqlalchemy import delete

        await db.execute(delete(AssistantKnowledgeSource).where(AssistantKnowledgeSource.assistant_id == assistant.id))
        for sid in payload.knowledge_source_ids:
            link = AssistantKnowledgeSource(assistant_id=assistant.id, knowledge_source_id=sid)
            db.add(link)

    assistant.version += 1
    await db.commit()
    await db.refresh(assistant)

    resp = AssistantResponse.model_validate(assistant)
    links_res = await db.execute(
        select(AssistantKnowledgeSource.knowledge_source_id).where(
            AssistantKnowledgeSource.assistant_id == assistant.id
        )
    )
    resp.knowledge_source_ids = list(links_res.scalars().all())
    return resp


# --- Publishing Lifecycle ---


@router.get("/assistants/{assistant_id}/publish-readiness", response_model=PublishValidationResponse)
async def check_publish_readiness(
    assistant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> PublishValidationResponse:
    """Verify that an assistant has verified knowledge sources and is ready for public deployment."""
    a_res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = a_res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    await verify_project_access(assistant.project_id, current_user.id, db)

    # Check linked sources and documents
    sources_stmt = (
        select(KnowledgeSource)
        .join(AssistantKnowledgeSource, AssistantKnowledgeSource.knowledge_source_id == KnowledgeSource.id)
        .where(AssistantKnowledgeSource.assistant_id == assistant.id)
    )
    sources = (await db.execute(sources_stmt)).scalars().all()

    issues: list[str] = []
    if not sources:
        issues.append("No knowledge sources are attached to this assistant.")

    docs_count_stmt = (
        select(func.count(Document.id))
        .join(KnowledgeSource, KnowledgeSource.id == Document.knowledge_source_id)
        .join(AssistantKnowledgeSource, AssistantKnowledgeSource.knowledge_source_id == KnowledgeSource.id)
        .where(AssistantKnowledgeSource.assistant_id == assistant.id, Document.status == "ready")
    )
    ready_docs = (await db.execute(docs_count_stmt)).scalar() or 0

    if ready_docs == 0:
        issues.append("No processed documents or website pages are ready in attached knowledge sources.")

    return PublishValidationResponse(
        is_ready=len(issues) == 0,
        issues=issues,
        knowledge_sources_count=len(sources),
        indexed_documents_count=ready_docs,
    )


@router.post("/assistants/{assistant_id}/publish", response_model=AssistantResponse)
async def publish_assistant(
    assistant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> AssistantResponse:
    """Publish assistant to live state and freeze immutable runtime configuration snapshot."""
    a_res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = a_res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    project = await verify_project_access(assistant.project_id, current_user.id, db)

    # Validate readiness
    readiness = await check_publish_readiness(assistant_id, current_user, db)
    if not readiness.is_ready:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot publish assistant: {'; '.join(readiness.issues)}",
        )

    assistant.status = AssistantStatus.PUBLISHED.value
    assistant.version += 1
    assistant.last_published_at = datetime.now(UTC)
    assistant.published_snapshot = {
        "name": assistant.name,
        "model": assistant.model,
        "temperature": assistant.temperature,
        "system_instructions": assistant.system_instructions,
        "language": assistant.language,
        "tone": assistant.tone,
        "fallback_message": assistant.fallback_message,
        "published_at": assistant.last_published_at.isoformat(),
        "version": assistant.version,
    }

    # Ensure a default widget deployment exists
    dep_stmt = select(Deployment).where(Deployment.assistant_id == assistant.id)
    deployment = (await db.execute(dep_stmt)).scalar_one_or_none()
    if not deployment:
        raw_key, _ = generate_secure_token("wwp_pub_")
        deployment = Deployment(
            assistant_id=assistant.id,
            deployment_type="widget",
            name=f"{assistant.name} Web Widget",
            public_key=raw_key,
            allowed_domains=["*"],
            theme_config={
                "primary_color": "#2563EB",
                "assistant_title": assistant.name,
                "welcome_message": f"Hello! I am your {assistant.name}. How can I assist you today?",
                "placeholder_text": "Ask us a question...",
                "position": "bottom-right",
                "show_branding": True,
            },
        )
        db.add(deployment)

    # Outgoing Webhook: assistant.published
    await webhook_dispatcher.dispatch_event(
        db=db,
        workspace_id=project.workspace_id,
        event_type="assistant.published",
        payload_data={"assistant_id": str(assistant.id), "name": assistant.name, "version": assistant.version},
    )

    await db.commit()
    await db.refresh(assistant)
    return AssistantResponse.model_validate(assistant)


@router.post("/assistants/{assistant_id}/unpublish", response_model=AssistantResponse)
async def unpublish_assistant(
    assistant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> AssistantResponse:
    """Take an assistant offline (unpublish) safely."""
    a_res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = a_res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    await verify_project_access(assistant.project_id, current_user.id, db)

    assistant.status = AssistantStatus.UNPUBLISHED.value
    await db.commit()
    await db.refresh(assistant)
    return AssistantResponse.model_validate(assistant)


# --- Conversation History & Source Inspection ---


@router.get("/assistants/{assistant_id}/conversations", response_model=list[ConversationResponse])
async def list_assistant_conversations(
    assistant_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[ConversationResponse]:
    """Retrieve actual customer and playground conversation history."""
    a_res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = a_res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    await verify_project_access(assistant.project_id, current_user.id, db)

    stmt = (
        select(Conversation, func.count(Message.id).label("msg_count"))
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.assistant_id == assistant_id)
        .group_by(Conversation.id)
        .order_by(Conversation.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    res = await db.execute(stmt)
    output = []
    for conv, count in res.all():
        resp = ConversationResponse.model_validate(conv)
        resp.message_count = count
        output.append(resp)
    return output


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
async def get_conversation_messages(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[MessageResponse]:
    """Inspect complete message history and supporting source citations."""
    c_stmt = select(Conversation).where(Conversation.id == conversation_id)
    conv = (await db.execute(c_stmt)).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    a_stmt = select(Assistant).where(Assistant.id == conv.assistant_id)
    assistant = (await db.execute(a_stmt)).scalar_one()
    await verify_project_access(assistant.project_id, current_user.id, db)

    m_stmt = select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at.asc())
    msgs = (await db.execute(m_stmt)).scalars().all()
    return [MessageResponse.model_validate(m) for m in msgs]


# --- Knowledge Gap Analytics & Unanswered Queries ---


@router.get("/assistants/{assistant_id}/analytics/knowledge-gaps", response_model=KnowledgeGapAnalyticsResponse)
async def get_knowledge_gap_analytics(
    assistant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> KnowledgeGapAnalyticsResponse:
    """Generate actionable analytics on where assistant fails to find reliable evidence."""
    a_res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = a_res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    await verify_project_access(assistant.project_id, current_user.id, db)

    # 1. Unanswered Queries
    uq_stmt = (
        select(UnansweredQuery)
        .where(UnansweredQuery.assistant_id == assistant_id)
        .order_by(UnansweredQuery.created_at.desc())
    )
    unanswered = (await db.execute(uq_stmt)).scalars().all()

    top_unanswered = [
        {"id": str(u.id), "query": u.query_text, "reason": u.fallback_reason, "date": u.created_at.isoformat()}
        for u in unanswered[:10]
    ]

    # 2. Feedback Metrics
    pos_stmt = select(func.count(AnswerFeedback.id)).where(
        AnswerFeedback.assistant_id == assistant_id, AnswerFeedback.rating == "positive"
    )
    neg_stmt = select(func.count(AnswerFeedback.id)).where(
        AnswerFeedback.assistant_id == assistant_id, AnswerFeedback.rating == "negative"
    )
    pos_count = (await db.execute(pos_stmt)).scalar() or 0
    neg_count = (await db.execute(neg_stmt)).scalar() or 0
    total_fb = pos_count + neg_count
    sat_rate = round((pos_count / total_fb * 100), 1) if total_fb > 0 else 100.0

    return KnowledgeGapAnalyticsResponse(
        total_unanswered=len(unanswered),
        top_unanswered_questions=top_unanswered,
        weak_coverage_topics=[u.query_text[:40] for u in unanswered[:5]],
        positive_feedback_count=pos_count,
        negative_feedback_count=neg_count,
        satisfaction_rate_pct=sat_rate,
    )


# --- Automated Golden Evaluations ---


@router.post(
    "/assistants/{assistant_id}/evaluations", response_model=EvaluationCaseResponse, status_code=status.HTTP_201_CREATED
)
async def create_evaluation_case(
    assistant_id: uuid.UUID,
    payload: EvaluationCaseCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> EvaluationCaseResponse:
    """Add a verified test case to ensure assistant grounding does not regress."""
    a_res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = a_res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    await verify_project_access(assistant.project_id, current_user.id, db)

    case = EvaluationCase(
        assistant_id=assistant.id,
        name=payload.name,
        question=payload.question,
        expected_answer=payload.expected_answer,
        expected_facts=payload.expected_facts,
    )
    db.add(case)
    await db.commit()
    await db.refresh(case)
    return EvaluationCaseResponse.model_validate(case)


@router.get("/assistants/{assistant_id}/evaluations", response_model=list[EvaluationCaseResponse])
async def list_evaluation_cases(
    assistant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[EvaluationCaseResponse]:
    """List evaluation suite for assistant."""
    a_res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = a_res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    await verify_project_access(assistant.project_id, current_user.id, db)

    stmt = (
        select(EvaluationCase)
        .where(EvaluationCase.assistant_id == assistant_id)
        .order_by(EvaluationCase.created_at.desc())
    )
    cases = (await db.execute(stmt)).scalars().all()
    return [EvaluationCaseResponse.model_validate(c) for c in cases]


@router.post("/evaluations/{eval_id}/run", response_model=EvaluationCaseResponse)
async def run_single_evaluation(
    eval_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> EvaluationCaseResponse:
    """Execute a single evaluation case against current assistant grounding."""
    stmt = select(EvaluationCase).where(EvaluationCase.id == eval_id)
    case = (await db.execute(stmt)).scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation case not found.")

    a_stmt = select(Assistant).where(Assistant.id == case.assistant_id)
    assistant = (await db.execute(a_stmt)).scalar_one()
    await verify_project_access(assistant.project_id, current_user.id, db)

    updated_case = await evaluation_service.run_evaluation_case(db, case.id)
    return EvaluationCaseResponse.model_validate(updated_case)


# --- Studio / Dashboard Playground Chat Execution ---


@router.post("/assistants/{assistant_id}/chat", response_model=ChatResponse)
async def studio_playground_chat(
    assistant_id: uuid.UUID,
    payload: ChatMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ChatResponse:
    """Internal studio testing endpoint for assistant tuning and prompt evaluation."""
    start_time = time.perf_counter()

    a_res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = a_res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    project = await verify_project_access(assistant.project_id, current_user.id, db)

    # 1. Resolve or create conversation
    conv = None
    if payload.conversation_id:
        conv_stmt = select(Conversation).where(
            Conversation.id == payload.conversation_id, Conversation.assistant_id == assistant.id
        )
        conv = (await db.execute(conv_stmt)).scalar_one_or_none()

    if not conv:
        conv = Conversation(
            assistant_id=assistant.id,
            user_id=current_user.id,
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

    # 3. Retrieve Context via Core Adapter
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
                    c_item = CitationItem(
                        chunk_id=str(item.get("chunk_id")),
                        content=item.get("content", ""),
                        similarity_score=item.get("similarity_score", 0.0),
                        rank=item.get("rank", 1),
                    )
                    citations.append(c_item)
                    retrieved_contexts.append(item.get("content", ""))
            except CoreApiException as e:
                logger.warning(f"Vector search failed: {e!s}")

    citations.sort(key=lambda x: x.similarity_score, reverse=True)
    citations = citations[: assistant.top_k]

    if citations:
        context_block = "\n\n".join(retrieved_contexts[:2])
        assistant_reply = f"Based on verified knowledge in {linked_sources[0].name}:\n\n{context_block}"
    else:
        assistant_reply = assistant.fallback_message

    latency_ms = int((time.perf_counter() - start_time) * 1000)

    # 4. Route via Intelligent AI Credential Engine
    provider_name = "openai"
    if "claude" in assistant.model.lower():
        provider_name = "anthropic"
    elif "gemini" in assistant.model.lower():
        provider_name = "gemini"

    resolution = await IntelligentRoutingEngine.select_credential(
        db=db,
        provider_name=provider_name,
        model_name=assistant.model,
    )

    approx_input_tokens = len(payload.message.split()) * 2 + len(retrieved_contexts) * 50
    approx_output_tokens = len(assistant_reply.split()) * 2
    cost_usd = (approx_input_tokens * 0.00000015) + (approx_output_tokens * 0.0000006)

    if resolution:
        await IntelligentRoutingEngine.record_success(
            db=db,
            credential_id=str(resolution.credential.id),
            workspace_id=str(project.workspace_id),
            provider_name=provider_name,
            model_name=assistant.model,
            input_tokens=approx_input_tokens,
            output_tokens=approx_output_tokens,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
        )

    # 5. Record Assistant Message
    assistant_msg = Message(
        conversation_id=conv.id,
        role="assistant",
        content=assistant_reply,
        citations=[c.model_dump(mode="json") for c in citations],
        latency_ms=latency_ms,
        is_grounded=bool(citations),
    )
    db.add(assistant_msg)

    # 6. Usage Event
    usage = UsageEvent(
        workspace_id=project.workspace_id,
        project_id=assistant.project_id,
        assistant_id=assistant.id,
        event_type="chat_turn",
        quantity=1,
    )
    db.add(usage)
    await db.commit()
    await db.refresh(assistant_msg)

    return ChatResponse(
        conversation_id=conv.id,
        message_id=assistant_msg.id,
        role="assistant",
        content=assistant_reply,
        sources=citations,
        latency_ms=latency_ms,
        is_grounded=bool(citations),
    )


# --- Deployments & API Credentials ---


@router.post(
    "/assistants/{assistant_id}/deployments",
    response_model=DeploymentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_widget_deployment(
    assistant_id: uuid.UUID,
    payload: DeploymentCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> DeploymentResponse:
    """Create or update embeddable web widget deployment with visual styling and allowed domains."""
    a_res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = a_res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    await verify_project_access(assistant.project_id, current_user.id, db)

    raw_pub, _ = generate_secure_token("wwp_pub_")
    deployment = Deployment(
        assistant_id=assistant.id,
        deployment_type=payload.deployment_type.value,
        name=payload.name,
        public_key=raw_pub,
        allowed_domains=payload.allowed_domains,
        theme_config=payload.theme_config,
    )
    db.add(deployment)
    await db.commit()
    await db.refresh(deployment)

    return DeploymentResponse.model_validate(deployment)


@router.get("/assistants/{assistant_id}/deployments", response_model=list[DeploymentResponse])
async def list_assistant_deployments(
    assistant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[DeploymentResponse]:
    """List deployments and widget public keys for assistant."""
    a_res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = a_res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    await verify_project_access(assistant.project_id, current_user.id, db)

    stmt = select(Deployment).where(Deployment.assistant_id == assistant_id).order_by(Deployment.created_at.desc())
    res = await db.execute(stmt)
    return [DeploymentResponse.model_validate(d) for d in res.scalars().all()]


@router.post(
    "/workspaces/{workspace_id}/api-credentials",
    response_model=ApiCredentialResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_api_credential(
    workspace_id: uuid.UUID,
    payload: ApiCredentialCreateRequest,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN])),
    db: AsyncSession = Depends(get_db_session),
) -> ApiCredentialResponse:
    """Generate a revocable API key for external integrations. Raw key is returned strictly once."""
    raw_key, key_hash = generate_secure_token("wwp_live_")
    prefix = raw_key[:12]

    cred = ApiCredential(
        workspace_id=workspace_id,
        name=payload.name,
        key_prefix=prefix,
        key_hash=key_hash,
        scopes=payload.scopes or ["assistants:read", "assistants:chat"],
    )
    db.add(cred)
    await db.commit()
    await db.refresh(cred)

    resp = ApiCredentialResponse.model_validate(cred)
    resp.raw_api_key = raw_key
    return resp
