"""Weirwise Copilot Provisioning and System Management Service.

Ensures the first-party official Weirwise Copilot assistant, its dedicated knowledge source,
and its Core Knowledge Base are provisioned under the Platform Operations workspace.
"""

import uuid

from backend.app.adapters.core_client import CoreApiClient
from backend.app.core.logging import logger
from backend.app.models.assistant import (
    Assistant,
    AssistantKnowledgeSource,
    AssistantStatus,
)
from backend.app.models.auth import Workspace
from backend.app.models.project import (
    KnowledgeSource,
    KnowledgeSourceType,
    Project,
    SourceProcessingStatus,
)
from backend.app.models.system import SystemConfig
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

COPILOT_CONFIG_KEY = "copilot_settings"
OPERATIONS_WORKSPACE_SLUG = "ws-operations"
OPERATIONS_PROJECT_SLUG = "platform-operations"

DEFAULT_COPILOT_INSTRUCTIONS = (
    "You are the official Weirwise Copilot, an internal product-guide assistant maintained by the Weirwise team. "
    "Your role is to explain features that actually exist in Weirwise, help customers understand how to use the "
    "platform, guide customers through existing workflows, and answer questions using official Weirwise documentation. "
    "You are an informational guide, NOT an autonomous operator. Do not claim unavailable features exist. "
    "If official documentation is insufficient, clearly acknowledge uncertainty."
)

DEFAULT_COPILOT_FALLBACK = (
    "I am sorry, but I do not have enough verified official Weirwise product documentation "
    "to answer that question accurately. Please check our documentation or contact the Weirwise support team."
)


class CopilotManager:
    @staticmethod
    async def get_or_create_system_config(db: AsyncSession) -> SystemConfig:
        stmt = select(SystemConfig).where(SystemConfig.key == COPILOT_CONFIG_KEY)
        res = await db.execute(stmt)
        cfg = res.scalar_one_or_none()
        if not cfg:
            cfg = SystemConfig(
                key=COPILOT_CONFIG_KEY,
                config={
                    "is_enabled": True,
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "temperature": 0.2,
                    "top_k": 4,
                    "score_threshold": 0.3,
                    "voice_enabled": True,
                    "deepgram_stt_model": "nova-3",
                    "deepgram_tts_model": "aura-2-andromeda-en",
                    "supported_languages": ["en", "fa"],
                },
                encrypted_secrets={},
                is_active=True,
            )
            db.add(cfg)
            await db.commit()
            await db.refresh(cfg)
        return cfg

    @staticmethod
    async def get_copilot_assistant(db: AsyncSession) -> Assistant:
        """Resolves or provisions the official Weirwise Copilot Assistant."""
        # 1. Look for existing Copilot Assistant
        stmt = (
            select(Assistant)
            .join(Project, Project.id == Assistant.project_id)
            .join(Workspace, Workspace.id == Project.workspace_id)
            .where(
                Workspace.slug == OPERATIONS_WORKSPACE_SLUG,
                Assistant.name == "Weirwise Copilot",
            )
        )
        res = await db.execute(stmt)
        assistant = res.scalar_one_or_none()

        if assistant:
            return assistant

        # 2. Resolve Operations Workspace & Project
        ws_stmt = select(Workspace).where(Workspace.slug == OPERATIONS_WORKSPACE_SLUG)
        ws = (await db.execute(ws_stmt)).scalar_one_or_none()
        if not ws:
            ws = Workspace(name="Weirwise Operations", slug=OPERATIONS_WORKSPACE_SLUG)
            db.add(ws)
            await db.flush()

        proj_stmt = select(Project).where(Project.workspace_id == ws.id, Project.slug == OPERATIONS_PROJECT_SLUG)
        proj = (await db.execute(proj_stmt)).scalar_one_or_none()
        if not proj:
            proj = Project(
                workspace_id=ws.id,
                name="Platform Operations",
                slug=OPERATIONS_PROJECT_SLUG,
                description="Administrative project hosting platform-wide official assistants",
            )
            db.add(proj)
            await db.flush()

        # 3. Create Copilot Assistant
        assistant = Assistant(
            project_id=proj.id,
            name="Weirwise Copilot",
            description="Official Weirwise product guide assistant",
            system_instructions=DEFAULT_COPILOT_INSTRUCTIONS,
            model="gpt-4o-mini",
            temperature=0.2,
            max_tokens=1024,
            score_threshold=0.3,
            top_k=4,
            language="en",
            tone="professional",
            fallback_message=DEFAULT_COPILOT_FALLBACK,
            status=AssistantStatus.PUBLISHED.value,
        )
        db.add(assistant)
        await db.flush()

        # 4. Create or link Official Knowledge Source
        ks_stmt = select(KnowledgeSource).where(
            KnowledgeSource.project_id == proj.id,
            KnowledgeSource.name == "Weirwise Official Documentation",
        )
        ks = (await db.execute(ks_stmt)).scalar_one_or_none()
        if not ks:
            ks = KnowledgeSource(
                project_id=proj.id,
                name="Weirwise Official Documentation",
                source_type=KnowledgeSourceType.FILE_UPLOAD.value,
                status=SourceProcessingStatus.READY.value,
            )
            db.add(ks)
            await db.flush()

            # Ensure Core Knowledge Base exists
            core_client = CoreApiClient()
            try:
                kb_resp = await core_client.create_knowledge_base(
                    name="Weirwise Official Product Knowledge",
                    description="Curated official platform documentation for Weirwise Copilot",
                )
                ks.core_kb_id = uuid.UUID(str(kb_resp["id"]))
            except Exception as e:
                logger.warning(f"Could not initialize Core KB for Copilot: {e!s}")

        # Link KnowledgeSource to Assistant
        link_stmt = select(AssistantKnowledgeSource).where(
            AssistantKnowledgeSource.assistant_id == assistant.id,
            AssistantKnowledgeSource.knowledge_source_id == ks.id,
        )
        if not (await db.execute(link_stmt)).scalar_one_or_none():
            db.add(AssistantKnowledgeSource(assistant_id=assistant.id, knowledge_source_id=ks.id, priority=10))

        await db.commit()
        await db.refresh(assistant)
        return assistant


copilot_manager = CopilotManager()
