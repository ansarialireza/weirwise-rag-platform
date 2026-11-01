"""Subscription plans, usage tracking, and entitlement enforcement."""

import uuid
from dataclasses import dataclass
from typing import Optional

from backend.app.models.audit import UsageEvent
from backend.app.models.auth import SubscriptionTier, Workspace
from backend.app.models.project import Document, KnowledgeSource, Project
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class PlanLimits:
    tier: str
    name: str
    monthly_price_usd: int
    max_assistants: int
    max_documents: int
    max_chat_turns_monthly: int
    max_file_size_mb: int
    allowed_models: list[str]
    features: list[str]


PLAN_DEFINITIONS: dict[str, PlanLimits] = {
    "free": PlanLimits(
        tier="free",
        name="Free Trial",
        monthly_price_usd=0,
        max_assistants=2,
        max_documents=10,
        max_chat_turns_monthly=100,
        max_file_size_mb=10,
        allowed_models=["Auto", "Fast"],
        features=["2 Assistants", "10 Documents", "100 Queries / month", "Standard Support"],
    ),
    "starter": PlanLimits(
        tier="starter",
        name="Team Starter",
        monthly_price_usd=49,
        max_assistants=10,
        max_documents=100,
        max_chat_turns_monthly=2500,
        max_file_size_mb=50,
        allowed_models=["Auto", "Fast", "Deep Thinking"],
        features=[
            "10 Assistants",
            "100 Documents",
            "2,500 Queries / month",
            "Web Widget Embed",
            "Priority Email Support",
        ],
    ),
    "pro": PlanLimits(
        tier="pro",
        name="Pro",
        monthly_price_usd=49,
        max_assistants=25,
        max_documents=500,
        max_chat_turns_monthly=10000,
        max_file_size_mb=50,
        allowed_models=["Auto", "Fast", "Deep Thinking"],
        features=[
            "25 Assistants",
            "500 Documents",
            "10,000 Queries / month",
            "Custom Embed Domains",
            "Dedicated Support",
        ],
    ),
    "enterprise": PlanLimits(
        tier="enterprise",
        name="Business Pro",
        monthly_price_usd=199,
        max_assistants=50,
        max_documents=1000,
        max_chat_turns_monthly=20000,
        max_file_size_mb=100,
        allowed_models=["Auto", "Fast", "Deep Thinking"],
        features=[
            "50 Assistants",
            "1,000 Documents",
            "20,000 Queries / month",
            "Custom Embed Domains",
            "Dedicated Support & SLA",
        ],
    ),
}


class SubscriptionService:
    @staticmethod
    def get_plan(tier: str) -> PlanLimits:
        return PLAN_DEFINITIONS.get(tier.lower(), PLAN_DEFINITIONS["free"])

    @staticmethod
    async def get_workspace_tier(workspace: Workspace, db: AsyncSession) -> Optional[SubscriptionTier]:
        """Fetch linked dynamic SubscriptionTier entity from database if present."""
        if workspace.subscription_tier_id:
            stmt = select(SubscriptionTier).where(SubscriptionTier.id == workspace.subscription_tier_id)
            res = await db.execute(stmt)
            return res.scalar_one_or_none()
        # Fallback query by workspace.plan_tier name
        tier_stmt = select(SubscriptionTier).where(func.lower(SubscriptionTier.name) == func.lower(workspace.plan_tier))
        res = await db.execute(tier_stmt)
        st = res.scalar_one_or_none()
        if st:
            return st
        # Default to first tier (e.g. Free Trial)
        res = await db.execute(select(SubscriptionTier).order_by(SubscriptionTier.monthly_price.asc()))
        return res.scalars().first()

    @staticmethod
    async def get_workspace_usage(workspace_id: uuid.UUID, db: AsyncSession) -> dict[str, int]:
        """Aggregate all billing usage events for the current workspace billing cycle."""
        stmt = (
            select(
                UsageEvent.event_type,
                func.coalesce(func.sum(UsageEvent.quantity), 0).label("total"),
            )
            .where(UsageEvent.workspace_id == workspace_id)
            .group_by(UsageEvent.event_type)
        )
        res = await db.execute(stmt)
        usage_map = {row[0]: int(row[1]) for row in res.all()}
        return {
            "chat_turns": usage_map.get("chat_turn", 0),
            "documents_indexed": usage_map.get("document_indexed", 0),
        }

    @staticmethod
    async def get_workspace_storage_mb(workspace_id: uuid.UUID, db: AsyncSession) -> float:
        """Calculate total uploaded file storage in MB for the workspace."""
        stmt = (
            select(func.coalesce(func.sum(Document.file_size_bytes), 0))
            .join(KnowledgeSource, KnowledgeSource.id == Document.knowledge_source_id)
            .join(Project, Project.id == KnowledgeSource.project_id)
            .where(Project.workspace_id == workspace_id)
        )
        res = await db.execute(stmt)
        total_bytes = res.scalar() or 0
        return total_bytes / (1024 * 1024)

    @classmethod
    async def check_chat_entitlement(cls, workspace: Workspace, db: AsyncSession) -> None:
        """Enforce dynamic quota on monthly inference chat turns.
        Gracefully blocks action with clean 403 structured payload if limit is reached.
        """
        tier = await cls.get_workspace_tier(workspace, db)
        fallback_plan = cls.get_plan(workspace.plan_tier)
        max_messages = int(tier.max_monthly_messages) if tier else fallback_plan.max_chat_turns_monthly
        tier_name = tier.name if tier else workspace.plan_tier

        usage = await cls.get_workspace_usage(workspace.id, db)
        current_turns = usage["chat_turns"]

        if current_turns >= max_messages:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "quota_exceeded",
                    "resource": "chat_turns",
                    "current": current_turns,
                    "limit": max_messages,
                    "tier": tier_name,
                    "message": (
                        f"Monthly message quota exceeded for tier '{tier_name}' "
                        f"({current_turns}/{max_messages} messages). "
                        "Upgrade required to continue running chat turns."
                    ),
                },
            )

    @classmethod
    async def check_assistant_creation_entitlement(
        cls, workspace: Workspace, current_count: int, db: Optional[AsyncSession] = None
    ) -> None:
        """Enforce limit on total assistants configured per workspace."""
        tier = await cls.get_workspace_tier(workspace, db) if db else None
        max_assts = int(tier.max_assistants) if tier else cls.get_plan(workspace.plan_tier).max_assistants
        tier_name = tier.name if tier else workspace.plan_tier

        if current_count >= max_assts:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "quota_exceeded",
                    "resource": "assistants",
                    "current": current_count,
                    "limit": max_assts,
                    "tier": tier_name,
                    "message": (
                        f"Assistant creation limit reached for tier '{tier_name}' "
                        f"({current_count}/{max_assts} assistants). "
                        "Upgrade required to create more assistants."
                    ),
                },
            )

    @classmethod
    async def check_document_upload_entitlement(
        cls, workspace: Workspace, current_count: int, additional_docs: int = 1, db: Optional[AsyncSession] = None
    ) -> None:
        """Enforce limit on total documents indexed per workspace."""
        tier = await cls.get_workspace_tier(workspace, db) if db else None
        max_docs = int(tier.max_assistants * 50) if tier else cls.get_plan(workspace.plan_tier).max_documents
        tier_name = tier.name if tier else workspace.plan_tier

        if (current_count + additional_docs) > max_docs:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "quota_exceeded",
                    "resource": "documents",
                    "current": current_count,
                    "limit": max_docs,
                    "tier": tier_name,
                    "message": (
                        f"Document limit reached for tier '{tier_name}' "
                        f"({current_count}/{max_docs} documents). "
                        "Upgrade required to upload more documents."
                    ),
                },
            )

    @classmethod
    async def check_storage_entitlement(cls, workspace: Workspace, additional_bytes: int, db: AsyncSession) -> None:
        """Enforce workspace total storage MB limit before writing uploaded file."""
        tier = await cls.get_workspace_tier(workspace, db)
        max_storage_mb = int(tier.max_storage_mb) if tier else cls.get_plan(workspace.plan_tier).max_file_size_mb
        tier_name = tier.name if tier else workspace.plan_tier

        current_storage_mb = await cls.get_workspace_storage_mb(workspace.id, db)
        incoming_storage_mb = additional_bytes / (1024 * 1024)

        if (current_storage_mb + incoming_storage_mb) > max_storage_mb:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "quota_exceeded",
                    "resource": "storage_mb",
                    "current_mb": round(current_storage_mb, 2),
                    "incoming_mb": round(incoming_storage_mb, 2),
                    "limit_mb": max_storage_mb,
                    "tier": tier_name,
                    "message": (
                        f"Storage quota exceeded for tier '{tier_name}' "
                        f"({round(current_storage_mb + incoming_storage_mb, 2)}/{max_storage_mb} MB). "
                        "Upgrade required to upload larger or additional files."
                    ),
                },
            )

    @classmethod
    def check_file_size_entitlement(cls, workspace: Workspace, file_size_bytes: int) -> None:
        """Enforce single-file upload size limit."""
        plan = cls.get_plan(workspace.plan_tier)
        max_bytes = plan.max_file_size_mb * 1024 * 1024
        if file_size_bytes > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"File exceeds plan '{plan.name}' maximum upload size of "
                    f"{plan.max_file_size_mb} MB. Upgrade your plan for larger file limits."
                ),
            )


subscription_service = SubscriptionService()
