# ADR 002: Multi-Knowledge Base Grounding Adapter

## Status
Accepted

## Context
In the Platform domain model, an `Assistant` can be linked to multiple `KnowledgeSource` entities (`AssistantKnowledgeSource` M:N).

Inspection of the verified Weirwise Core API (`weirwise/server/app/models.py` & `CONTRACT.md`) reveals that Core's `Assistant` schema supports only a single optional `knowledge_base_id`:
```python
knowledge_base_id = Column(GUID, ForeignKey("knowledge_bases.id", ondelete="SET NULL"), nullable=True)
```
Direct modification of Core internals is prohibited.

## Decision
We introduce an integration adapter strategy in the Platform:
1. When an Assistant has **exactly one** Knowledge Source, the Platform configures a 1:1 mapped Assistant in Core.
2. When an Assistant is grounded in **multiple** Knowledge Sources, the Platform queries Core's `/api/v1/search` endpoint across each associated `knowledge_base_id`, applies similarity score filtering and threshold ranking, compiles the synthesized context window, and executes the conversation prompt.

## Consequences
- Enables full multi-source grounding on the Platform without violating Core's immutability rule.
- Eliminates blocking dependencies on future Core database schema updates.
