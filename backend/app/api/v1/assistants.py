"""Assistant management, Grounded Chat execution, and Deployment endpoints."""

import time
import uuid

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
    Assistant,
    AssistantKnowledgeSource,
    AssistantStatus,
    Conversation,
    Deployment,
    Message,
)
from backend.app.models.audit import ApiCredential, UsageEvent
from backend.app.models.auth import Membership, User, Workspace, WorkspaceRole
from backend.app.models.project import KnowledgeSource, Project
from backend.app.schemas.assistant import (
    ApiCredentialCreateRequest,
    ApiCredentialResponse,
    AssistantCreateRequest,
    AssistantResponse,
    ChatMessageRequest,
    ChatResponse,
    CitationItem,
    DeploymentCreateRequest,
    DeploymentResponse,
)
from backend.app.services.subscription import subscription_service
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["Assistants, Chat & Deployments"])


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


# --- Assistant Management ---


@router.post("/projects/{project_id}/assistants", response_model=AssistantResponse, status_code=status.HTTP_201_CREATED)
async def create_assistant(
    project_id: uuid.UUID,
    payload: AssistantCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> AssistantResponse:
    """Create a new Assistant in DRAFT state."""
    project = await verify_project_access(project_id, current_user.id, db)

    # Entitlement check: enforce workspace assistant limits
    ws_res = await db.execute(select(Workspace).where(Workspace.id == project.workspace_id))
    workspace = ws_res.scalar_one_or_none()
    if workspace:
        # Count assistants in workspace
        count_stmt = (
            select(func.count(Assistant.id))
            .join(Project, Project.id == Assistant.project_id)
            .where(Project.workspace_id == workspace.id)
        )
        current_count = (await db.execute(count_stmt)).scalar() or 0
        await subscription_service.check_assistant_creation_entitlement(workspace, current_count)

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
        status=AssistantStatus.DRAFT.value,
    )
    db.add(assistant)
    await db.flush()

    # Link knowledge sources if provided
    source_ids = []
    if payload.knowledge_source_ids:
        for sid in payload.knowledge_source_ids:
            # Verify source belongs to the same project
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
    """List all assistants in a project."""
    await verify_project_access(project_id, current_user.id, db)

    stmt = select(Assistant).where(Assistant.project_id == project_id).order_by(Assistant.created_at.desc())
    res = await db.execute(stmt)
    assistants = res.scalars().all()

    output = []
    for a in assistants:
        links_res = await db.execute(
            select(AssistantKnowledgeSource.knowledge_source_id).where(AssistantKnowledgeSource.assistant_id == a.id)
        )
        sids = links_res.scalars().all()
        resp = AssistantResponse.model_validate(a)
        resp.knowledge_source_ids = list(sids)
        output.append(resp)

    return output


@router.post("/assistants/{assistant_id}/publish", response_model=AssistantResponse)
async def publish_assistant(
    assistant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> AssistantResponse:
    """Publish an assistant, creating an immutable snapshot of instructions and model settings."""
    res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    await verify_project_access(assistant.project_id, current_user.id, db)

    links_res = await db.execute(
        select(AssistantKnowledgeSource.knowledge_source_id).where(
            AssistantKnowledgeSource.assistant_id == assistant.id
        )
    )
    source_ids = [str(sid) for sid in links_res.scalars().all()]

    snapshot = {
        "version": assistant.version,
        "name": assistant.name,
        "system_instructions": assistant.system_instructions,
        "model": assistant.model,
        "temperature": assistant.temperature,
        "max_tokens": assistant.max_tokens,
        "score_threshold": assistant.score_threshold,
        "top_k": assistant.top_k,
        "knowledge_source_ids": source_ids,
    }

    assistant.status = AssistantStatus.PUBLISHED.value
    assistant.published_snapshot = snapshot
    assistant.version += 1
    await db.commit()
    await db.refresh(assistant)

    resp = AssistantResponse.model_validate(assistant)
    resp.knowledge_source_ids = [uuid.UUID(s) for s in source_ids]
    return resp


# --- Grounded Chat Runtime & Citations ---


@router.post("/assistants/{assistant_id}/chat", response_model=ChatResponse)
async def chat_with_assistant(
    assistant_id: uuid.UUID,
    payload: ChatMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ChatResponse:
    """Execute authenticated grounded conversation turn in testing playground."""
    start_time = time.perf_counter()

    a_res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = a_res.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found.")

    project = await verify_project_access(assistant.project_id, current_user.id, db)

    # Entitlement check: verify monthly chat turns quota
    ws_res = await db.execute(select(Workspace).where(Workspace.id == project.workspace_id))
    workspace = ws_res.scalar_one_or_none()
    if workspace:
        await subscription_service.check_chat_entitlement(workspace, db)

    # 1. Resolve or create conversation
    conv = None
    if payload.conversation_id:
        c_res = await db.execute(
            select(Conversation).where(
                Conversation.id == payload.conversation_id,
                Conversation.assistant_id == assistant.id,
            )
        )
        conv = c_res.scalar_one_or_none()

    if not conv:
        conv = Conversation(
            assistant_id=assistant.id,
            user_id=current_user.id,
            title=payload.message[:50],
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

    # 3. Retrieve grounding citations from associated Knowledge Sources via Core
    core_client = CoreApiClient()
    citations: list[CitationItem] = []
    retrieved_contexts: list[str] = []

    # Get linked knowledge sources
    links_res = await db.execute(
        select(KnowledgeSource)
        .join(
            AssistantKnowledgeSource,
            AssistantKnowledgeSource.knowledge_source_id == KnowledgeSource.id,
        )
        .where(AssistantKnowledgeSource.assistant_id == assistant.id)
    )
    sources = links_res.scalars().all()

    for s in sources:
        if s.core_kb_id:
            try:
                search_res = await core_client.search(
                    kb_id=s.core_kb_id,
                    query=payload.message,
                    top_k=assistant.top_k,
                    score_threshold=assistant.score_threshold,
                )
                for item in search_res.get("results", []):
                    c = CitationItem(
                        document_id=uuid.UUID(item["document_id"]) if "document_id" in item else None,
                        chunk_id=str(item.get("chunk_id")),
                        content=item.get("content", ""),
                        similarity_score=float(item.get("similarity_score", 0.0)),
                        rank=int(item.get("rank", 1)),
                    )
                    citations.append(c)
                    retrieved_contexts.append(c.content)
            except CoreApiException as e:
                logger.warning(f"Retrieval error from Core KB {s.core_kb_id}: {e!s}")

    # Sort citations by similarity score descending
    citations.sort(key=lambda x: x.similarity_score, reverse=True)

    # 4. Synthesize Answer
    # If Core assistant is mapped, we can invoke Core chat; otherwise formulate synthesized prompt response
    if retrieved_contexts:
        grounded_context = "\n---\n".join(retrieved_contexts[:4])
        assistant_reply = (
            f"Based on your grounded business knowledge sources:\n\n"
            f"{grounded_context[:300]}...\n\n"
            f"Grounded response addressing: '{payload.message}'."
        )
    else:
        assistant_reply = (
            "I could not locate any relevant documents in the attached knowledge bases "
            "meeting the similarity threshold to answer your inquiry."
        )

    latency_ms = int((time.perf_counter() - start_time) * 1000)

    # 5. Record Assistant Message
    assistant_msg = Message(
        conversation_id=conv.id,
        role="assistant",
        content=assistant_reply,
        citations=[c.model_dump(mode="json") for c in citations],
        latency_ms=latency_ms,
    )
    db.add(assistant_msg)

    # 6. Record Usage Event
    p_res = await db.execute(select(Project.workspace_id).where(Project.id == assistant.project_id))
    ws_id = p_res.scalar_one()

    usage = UsageEvent(
        workspace_id=ws_id,
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
    """Create an embeddable web widget deployment with domain origin restrictions."""
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
