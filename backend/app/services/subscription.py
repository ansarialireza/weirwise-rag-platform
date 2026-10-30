"""Subscription plans, usage tracking, and entitlement enforcement."""

import uuid
from dataclasses import dataclass

from backend.app.models.audit import UsageEvent
from backend.app.models.auth import Workspace
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
        allowed_models=["gpt-4o-mini"],
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
        allowed_models=["gpt-4o-mini", "gpt-4o"],
        features=[
            "10 Assistants",
            "100 Documents",
            "2,500 Queries / month",
            "Web Widget Embed",
            "Priority Email Support",
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
        allowed_models=["gpt-4o-mini", "gpt-4o", "claude-3-5-sonnet"],
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

    @classmethod
    async def check_chat_entitlement(cls, workspace: Workspace, db: AsyncSession) -> None:
        """Enforce strict plan quota on inference chat turns."""
        plan = cls.get_plan(workspace.plan_tier)
        usage = await cls.get_workspace_usage(workspace.id, db)
        current_turns = usage["chat_turns"]

        if current_turns >= plan.max_chat_turns_monthly:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    f"Monthly chat quota exceeded for plan '{plan.name}' "
                    f"({current_turns}/{plan.max_chat_turns_monthly} turns). "
                    "Please upgrade your workspace subscription in Settings -> Billing."
                ),
            )

    @classmethod
    async def check_assistant_creation_entitlement(cls, workspace: Workspace, current_count: int) -> None:
        """Enforce limit on total assistants configured per workspace."""
        plan = cls.get_plan(workspace.plan_tier)
        if current_count >= plan.max_assistants:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Assistant creation limit reached for plan '{plan.name}' "
                    f"({current_count}/{plan.max_assistants}). "
                    "Upgrade your workspace plan to create more assistants."
                ),
            )

    @classmethod
    async def check_document_upload_entitlement(
        cls, workspace: Workspace, current_count: int, additional_docs: int = 1
    ) -> None:
        """Enforce limit on total documents indexed per workspace."""
        plan = cls.get_plan(workspace.plan_tier)
        if (current_count + additional_docs) > plan.max_documents:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Document storage limit reached for plan '{plan.name}' "
                    f"({current_count}/{plan.max_documents} documents). "
                    "Upgrade your workspace plan to ingest more documents."
                ),
            )

    @classmethod
    def check_file_size_entitlement(cls, workspace: Workspace, file_size_bytes: int) -> None:
        """Enforce per-plan upload file size limit."""
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
