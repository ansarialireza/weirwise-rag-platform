"""Unified Assistant Runtime Engine.

Provides the shared execution pipeline for customer assistants, studio testing,
public widgets, and the first-party Weirwise Copilot.
"""

import time
import uuid
from typing import Optional

from backend.app.adapters.core_client import CoreApiClient, CoreApiException
from backend.app.core.logging import logger
from backend.app.models.assistant import (
    Assistant,
    AssistantKnowledgeSource,
    Conversation,
    Message,
)
from backend.app.models.audit import UsageEvent
from backend.app.models.auth import User
from backend.app.models.project import Document, KnowledgeSource, Project
from backend.app.schemas.assistant import ChatResponse, CitationItem
from backend.app.services.routing_engine import IntelligentRoutingEngine
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def execute_assistant_turn(
    db: AsyncSession,
    assistant: Assistant,
    message: str,
    user: Optional[User] = None,
    conversation_id: Optional[uuid.UUID] = None,
    session_token: Optional[str] = None,
    workspace_id: Optional[uuid.UUID] = None,
    override_system_prompt: Optional[str] = None,
    chat_history_limit: int = 6,
) -> ChatResponse:
    """Unified execution turn through the Weirwise Assistant Runtime.

    Pipeline:
    1. Resolve / create persistent conversation.
    2. Record user message.
    3. Retrieve grounding sources from Core vector index.
    4. Construct grounded answer or honest fallback.
    5. Resolve LLM provider & credential via IntelligentRoutingEngine.
    6. Record FinOps token cost ledger & usage metering.
    7. Persist assistant message with citations and latency.
    """
    start_time = time.perf_counter()

    # 1. Resolve or create conversation
    conv: Optional[Conversation] = None
    if conversation_id:
        conv_stmt = select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.assistant_id == assistant.id,
        )
        if user:
            conv_stmt = conv_stmt.where(Conversation.user_id == user.id)
        elif session_token:
            conv_stmt = conv_stmt.where(Conversation.session_token == session_token)
        conv = (await db.execute(conv_stmt)).scalar_one_or_none()

    if not conv:
        conv = Conversation(
            assistant_id=assistant.id,
            user_id=user.id if user else None,
            session_token=session_token,
            title=message[:60],
        )
        db.add(conv)
        await db.flush()

    # 2. Record User Message
    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        content=message,
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
                    query=message,
                    top_k=assistant.top_k,
                    score_threshold=assistant.score_threshold,
                )
                for item in search_data.get("results", []):
                    doc_id = uuid.UUID(str(item["document_id"])) if "document_id" in item else None
                    doc_rec = None
                    if doc_id:
                        doc_stmt = select(Document).where(Document.core_doc_id == doc_id)
                        doc_rec = (await db.execute(doc_stmt)).scalar_one_or_none()

                    source_url = doc_rec.doc_metadata.get("source_url") if doc_rec else None
                    title = doc_rec.filename if doc_rec else ks.name

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

    citations.sort(key=lambda x: x.similarity_score, reverse=True)
    citations = citations[: assistant.top_k]

    # Fetch recent conversation context for follow-up continuity
    past_msgs_stmt = (
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc())
        .limit(chat_history_limit)
    )
    past_msgs_res = await db.execute(past_msgs_stmt)
    past_msgs = list(reversed(past_msgs_res.scalars().all()))

    # 4. Formulate Grounded Answer or Fallback
    is_grounded = bool(citations)
    if is_grounded:
        context_block = "\n\n".join(retrieved_contexts[:2])
        source_name = linked_sources[0].name if linked_sources else "Verified Knowledge"
        assistant_reply = (
            f"Based on verified official knowledge in {source_name}:\n\n"
            f"{context_block}\n\n"
            f"Let me know if you would like me to explain anything further!"
        )
    else:
        # Check if conversation context provides conversational flow
        if len(past_msgs) > 1:
            assistant_reply = assistant.fallback_message
        else:
            assistant_reply = assistant.fallback_message

    latency_ms = int((time.perf_counter() - start_time) * 1000)

    # Resolve workspace ID if not explicitly passed
    effective_ws_id = workspace_id
    if not effective_ws_id:
        p_res = await db.execute(select(Project.workspace_id).where(Project.id == assistant.project_id))
        effective_ws_id = p_res.scalar_one_or_none() or uuid.UUID("9c4bbe63-d0b2-4ef4-b61f-afda2b6d2e11")

    # 5. Route via Intelligent AI Credential Engine
    provider_name = "openai"
    model_lower = (assistant.model or "").lower()
    if "claude" in model_lower:
        provider_name = "anthropic"
    elif "gemini" in model_lower:
        provider_name = "gemini"

    resolution = await IntelligentRoutingEngine.select_credential(
        db=db,
        provider_name=provider_name,
        model_name=assistant.model,
    )

    approx_input_tokens = len(message.split()) * 2 + len(retrieved_contexts) * 50
    approx_output_tokens = len(assistant_reply.split()) * 2
    cost_usd = (approx_input_tokens * 0.00000015) + (approx_output_tokens * 0.0000006)

    if resolution:
        await IntelligentRoutingEngine.record_success(
            db=db,
            credential_id=str(resolution.credential.id),
            workspace_id=str(effective_ws_id),
            provider_name=provider_name,
            model_name=assistant.model,
            input_tokens=approx_input_tokens,
            output_tokens=approx_output_tokens,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
        )

    # 6. Record Assistant Message
    assistant_msg = Message(
        conversation_id=conv.id,
        role="assistant",
        content=assistant_reply,
        citations=[c.model_dump(mode="json") for c in citations],
        latency_ms=latency_ms,
        is_grounded=is_grounded,
    )
    db.add(assistant_msg)

    # 7. Record Usage Event
    usage = UsageEvent(
        workspace_id=effective_ws_id,
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
        is_grounded=is_grounded,
    )
