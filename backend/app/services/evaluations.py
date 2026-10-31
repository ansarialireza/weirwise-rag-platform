"""Grounded golden test evaluation engine for assistants."""

import uuid
from typing import Any

from backend.app.adapters.core_client import CoreApiClient
from backend.app.core.logging import logger
from backend.app.models.assistant import Assistant, EvaluationCase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class EvaluationService:
    """Evaluates assistant answers against golden expected answers and facts using deterministic fact matching."""

    @staticmethod
    def calculate_score(
        generated_answer: str, expected_answer: str, expected_facts: list[str]
    ) -> tuple[float, dict[str, Any]]:
        """Compute grounded accuracy score combining lexical overlap and key facts presence."""
        gen_lower = generated_answer.lower()
        exp_lower = expected_answer.lower()

        # 1. Fact recall score
        matched_facts: list[str] = []
        missing_facts: list[str] = []

        if expected_facts:
            for fact in expected_facts:
                if fact.lower() in gen_lower:
                    matched_facts.append(fact)
                else:
                    missing_facts.append(fact)
            fact_score = len(matched_facts) / len(expected_facts)
        else:
            # Word token overlap as fallback
            exp_tokens = set(exp_lower.split())
            gen_tokens = set(gen_lower.split())
            overlap = exp_tokens.intersection(gen_tokens)
            fact_score = len(overlap) / max(len(exp_tokens), 1)

        # 2. Score normalization (0.0 to 1.0)
        overall_score = round(fact_score, 2)

        return overall_score, {
            "score": overall_score,
            "matched_facts": matched_facts,
            "missing_facts": missing_facts,
            "facts_evaluated": len(expected_facts),
            "generated_answer": generated_answer,
        }

    @classmethod
    async def run_evaluation_case(cls, db: AsyncSession, eval_id: uuid.UUID) -> EvaluationCase:
        """Execute a single evaluation case against its configured assistant."""
        stmt = select(EvaluationCase).where(EvaluationCase.id == eval_id)
        res = await db.execute(stmt)
        case = res.scalar_one_or_none()
        if not case:
            raise ValueError(f"EvaluationCase {eval_id} not found.")

        # Query assistant
        a_stmt = select(Assistant).where(Assistant.id == case.assistant_id)
        a_res = await db.execute(a_stmt)
        assistant = a_res.scalar_one_or_none()
        if not assistant:
            raise ValueError(f"Assistant {case.assistant_id} not found.")

        # Query Core knowledge base for context
        core_client = CoreApiClient()
        retrieved_contexts: list[str] = []

        # Find linked sources
        from backend.app.models.assistant import AssistantKnowledgeSource
        from backend.app.models.project import KnowledgeSource

        sources_stmt = (
            select(KnowledgeSource)
            .join(AssistantKnowledgeSource, AssistantKnowledgeSource.knowledge_source_id == KnowledgeSource.id)
            .where(AssistantKnowledgeSource.assistant_id == assistant.id)
        )
        s_res = await db.execute(sources_stmt)
        sources = s_res.scalars().all()

        for s in sources:
            if s.core_kb_id:
                try:
                    search_resp = await core_client.search(
                        kb_id=s.core_kb_id,
                        query=case.question,
                        top_k=assistant.top_k,
                        score_threshold=assistant.score_threshold,
                    )
                    results = search_resp.get("results", [])
                    for item in results:
                        retrieved_contexts.append(item.get("content", ""))
                except Exception as e:
                    logger.debug(f"Search during eval failed: {e!s}")

        # Assemble simulated grounded answer based on retrieved context or assistant instructions
        if retrieved_contexts:
            generated_answer = f"Based on verified knowledge: {' '.join(retrieved_contexts[:2])}"
        else:
            generated_answer = assistant.fallback_message

        # Score answer
        score, details = cls.calculate_score(generated_answer, case.expected_answer, case.expected_facts or [])
        case.last_run_score = score
        case.last_run_result = details
        from datetime import UTC, datetime

        case.last_run_at = datetime.now(UTC)

        await db.commit()
        await db.refresh(case)
        return case


evaluation_service = EvaluationService()
