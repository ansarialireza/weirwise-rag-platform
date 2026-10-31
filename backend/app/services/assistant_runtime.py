"""Unified Assistant Runtime Engine.

Provides the shared execution pipeline for customer assistants, studio testing,
public widgets, and the first-party Weirwise Copilot.
Connects with RAG Core for pgvector retrieval and LLM Provider Router for generation.
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
from backend.app.services.llm import LLMClient, LLMClientError
from backend.app.services.routing_engine import IntelligentRoutingEngine
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def _compute_keyword_relevance(query: str, content: str) -> float:
    """Compute lexical term overlap score between query and chunk content."""
    q_words = set(query.lower().split())
    # remove very short tokens
    terms = [w.strip(".,?!:;()\"'") for w in q_words if len(w) > 2]
    if not terms:
        return 0.0

    content_lower = content.lower()
    matches = sum(1 for t in terms if t in content_lower)
    return matches / len(terms)


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
    4. Fetch conversation history window.
    5. Resolve LLM provider & credential via IntelligentRoutingEngine.
    6. Construct grounded prompt and execute LLM generation.
    7. Record FinOps token cost ledger & usage metering.
    8. Persist assistant message with citations and latency.
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
                # Query Core vector search
                # In development mode, Core embeddings are pseudo-deterministic hashes with low cosine similarity.
                # We query Core with top_k=20 and score_threshold=0.0, then re-rank via hybrid lexical-vector relevance.
                search_data = await core_client.search(
                    kb_id=ks.core_kb_id,
                    query=message,
                    top_k=20,
                    score_threshold=0.0,
                )
                for item in search_data.get("results", []):
                    doc_id = uuid.UUID(str(item["document_id"])) if "document_id" in item else None
                    doc_rec = None
                    if doc_id:
                        doc_stmt = select(Document).where(Document.core_doc_id == doc_id)
                        doc_rec = (await db.execute(doc_stmt)).scalar_one_or_none()

                    source_url = doc_rec.doc_metadata.get("source_url") if doc_rec else None
                    title = doc_rec.filename if doc_rec else ks.name
                    content = item.get("content", "")
                    vec_score = float(item.get("similarity_score", 0.0))
                    lex_score = _compute_keyword_relevance(message, content)

                    # Hybrid combined relevance: gives primary weight to semantic lexical match in dev mode
                    combined_score = max(vec_score, lex_score)

                    c_item = CitationItem(
                        document_id=doc_rec.id if doc_rec else None,
                        document_name=title,
                        chunk_id=str(item.get("chunk_id")),
                        source_url=source_url,
                        title=title,
                        content=content,
                        similarity_score=round(combined_score, 4),
                        rank=item.get("rank", 1),
                    )
                    citations.append(c_item)
            except CoreApiException as e:
                logger.warning(f"Vector search failed on Core KB {ks.core_kb_id}: {e!s}")

    # Sort citations by relevance descending
    citations.sort(key=lambda x: x.similarity_score, reverse=True)
    # Apply effective threshold and take top_k
    effective_threshold = min(assistant.score_threshold or 0.05, 0.05)
    filtered_citations = [c for c in citations if c.similarity_score >= effective_threshold]
    citations = filtered_citations[: assistant.top_k]
    retrieved_contexts = [c.content for c in citations]

    # 4. Fetch recent conversation context for follow-up continuity
    past_msgs_stmt = (
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc())
        .limit(chat_history_limit)
    )
    past_msgs_res = await db.execute(past_msgs_stmt)
    past_msgs = list(reversed(past_msgs_res.scalars().all()))

    # Resolve effective workspace ID
    effective_ws_id = workspace_id
    if not effective_ws_id:
        p_res = await db.execute(select(Project.workspace_id).where(Project.id == assistant.project_id))
        effective_ws_id = p_res.scalar_one_or_none() or uuid.UUID("9c4bbe63-d0b2-4ef4-b61f-afda2b6d2e11")

    # 5. Resolve LLM Provider Credential via Intelligent Routing Engine
    provider_name = "openrouter"
    model_name = assistant.model or "meta-llama/llama-3.2-3b-instruct"
    model_lower = model_name.lower()

    if "gpt" in model_lower or "o1" in model_lower:
        provider_name = "openrouter"
    elif "claude" in model_lower and not model_lower.startswith("anthropic/"):
        provider_name = "anthropic"

    resolution = await IntelligentRoutingEngine.select_credential(
        db=db,
        provider_name=provider_name,
        model_name=model_name,
    )
    if not resolution:
        # Fallback to any active openrouter, openai or anthropic provider
        for alt_provider in ("openrouter", "openai", "anthropic"):
            resolution = await IntelligentRoutingEngine.select_credential(
                db=db,
                provider_name=alt_provider,
            )
            if resolution:
                provider_name = alt_provider
                break

    # 6. Construct Grounded Messages Payload for LLM
    system_instruction = override_system_prompt or assistant.system_instructions or "You are a helpful assistant."
    strict_grounding_directive = (
        f"{system_instruction}\n\n"
        "STRICT GROUNDING RULES:\n"
        "1. You must answer questions using ONLY the verified context provided below.\n"
        "2. Do NOT extrapolate, speculate, or invent unverified product features.\n"
        "3. If the context does not provide sufficient evidence to answer the question accurately, "
        f"you MUST reply with: '{assistant.fallback_message}'.\n"
    )

    llm_messages: list[dict[str, str]] = [{"role": "system", "content": strict_grounding_directive}]

    if citations:
        context_str = "\n\n---\n\n".join(
            [f"[Source: {c.title} (Score: {c.similarity_score:.4f})]\n{c.content}" for c in citations]
        )
        llm_messages.append(
            {
                "role": "system",
                "content": f"VERIFIED RETRIEVED CONTEXT:\n{context_str}",
            }
        )

    # Append recent conversation turns (excluding the latest user message which we append now)
    for m in past_msgs[:-1]:
        if m.role in ("user", "assistant"):
            llm_messages.append({"role": m.role, "content": m.content})

    llm_messages.append({"role": "user", "content": message})

    # 7. Generate Response via LLM Provider
    assistant_reply = ""
    prompt_tokens = 0
    completion_tokens = 0
    cost_usd = 0.0

    if resolution:
        try:
            gen_res = await LLMClient.generate_chat_completion(
                provider=provider_name,
                api_key=resolution.raw_secret,
                model=model_name,
                messages=llm_messages,
                temperature=assistant.temperature or 0.2,
                max_tokens=assistant.max_tokens or 1024,
            )
            assistant_reply = gen_res.content
            prompt_tokens = gen_res.prompt_tokens
            completion_tokens = gen_res.completion_tokens
            cost_usd = gen_res.cost_usd

            # Record successful routing turn
            await IntelligentRoutingEngine.record_success(
                db=db,
                credential_id=str(resolution.credential.id),
                workspace_id=str(effective_ws_id),
                provider_name=provider_name,
                model_name=model_name,
                input_tokens=prompt_tokens,
                output_tokens=completion_tokens,
                cost_usd=cost_usd,
                latency_ms=int((time.perf_counter() - start_time) * 1000),
            )
        except LLMClientError as e:
            logger.error(f"Real LLM generation failed: {e!s}")
            await IntelligentRoutingEngine.record_failure(
                db=db,
                credential_id=str(resolution.credential.id),
                error_type="api_error",
                reason=str(e),
                is_rate_limit=e.status_code == 429,
            )
            assistant_reply = assistant.fallback_message
    else:
        logger.warning(f"No active credential found in pool for {provider_name}; using grounded synthesizer fallback.")
        if citations:
            context_block = "\n\n".join(retrieved_contexts[:2])
            assistant_reply = (
                f"Based on verified official knowledge:\n\n"
                f"{context_block}\n\n"
                f"Let me know if you would like me to explain anything further!"
            )
        else:
            assistant_reply = assistant.fallback_message

    latency_ms = int((time.perf_counter() - start_time) * 1000)
    is_grounded = bool(citations) and assistant_reply != assistant.fallback_message

    # 8. Record Assistant Message in DB
    assistant_msg = Message(
        conversation_id=conv.id,
        role="assistant",
        content=assistant_reply,
        citations=[c.model_dump(mode="json") for c in citations],
        latency_ms=latency_ms,
        is_grounded=is_grounded,
    )
    db.add(assistant_msg)

    # 9. Record Usage Event
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
