"""Subscription tier retrieval, document/storage limits, and entitlement validation."""

import logging
import uuid
from decimal import Decimal
from typing import Optional

from backend.app.models.assistant import WorkspacePlanEntitlement
from backend.app.models.audit import UsageEvent
from backend.app.models.auth import SubscriptionTier
from backend.app.models.project import Document
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Fallback in-memory catalog used when the subscription_tiers database table is empty
FALLBACK_TIER_LIMITS: dict[str, dict[str, int]] = {
    "free": {
        "max_assistants": 2,
        "max_documents": 10,
        "max_chat_turns_monthly": 100,
        "max_storage_mb": 50,
        "max_file_size_mb": 10,
    },
    "starter": {
        "max_assistants": 5,
        "max_documents": 50,
        "max_chat_turns_monthly": 500,
        "max_storage_mb": 250,
        "max_file_size_mb": 25,
    },
    "pro": {
        "max_assistants": 20,
        "max_documents": 250,
        "max_chat_turns_monthly": 2500,
        "max_storage_mb": 1000,
        "max_file_size_mb": 50,
    },
    "enterprise": {
        "max_assistants": 100,
        "max_documents": 2000,
        "max_chat_turns_monthly": 20000,
        "max_storage_mb": 10000,
        "max_file_size_mb": 100,
    },
}


class SubscriptionService:
    """Subscription, plan entitlement, and resource limit enforcement."""

    @classmethod
    async def get_user_tier(cls, user_id: uuid.UUID, db: AsyncSession) -> Optional[SubscriptionTier]:
        """Resolve current active subscription tier for user."""
        from backend.app.models.billing import BillingPlan, BillingSubscription

        sub_stmt = (
            select(BillingPlan)
            .join(BillingSubscription, BillingSubscription.plan_id == BillingPlan.id)
            .where(BillingSubscription.user_id == user_id, BillingSubscription.status == "active")
        )
        sub_res = await db.execute(sub_stmt)
        plan = sub_res.scalar_one_or_none()

        if plan:
            # Map BillingPlan to SubscriptionTier interface
            tier = SubscriptionTier(
                id=plan.id,
                name=plan.name,
                monthly_price=plan.monthly_price,
                max_assistants=Decimal(plan.max_assistants),
                max_monthly_messages=Decimal(plan.max_chat_turns_monthly),
                max_storage_mb=Decimal(plan.max_storage_mb),
            )
            return tier

        # Fallback to Free Trial
        stmt = select(SubscriptionTier).where(SubscriptionTier.name == "Free Trial")
        res = await db.execute(stmt)
        tier = res.scalar_one_or_none()
        if not tier:
            res = await db.execute(select(SubscriptionTier).order_by(SubscriptionTier.monthly_price.asc()))
            tier = res.scalars().first()
        return tier

    @classmethod
    async def get_user_document_limit(cls, user_id: uuid.UUID, db: AsyncSession) -> int:
        """Single source of truth for the per-user document limit."""
        tier = await cls.get_user_tier(user_id, db)
        if tier:
            tier_name = (tier.name or "").lower()
            if "enterprise" in tier_name:
                return 2000
            elif "pro" in tier_name:
                return 250
            elif "starter" in tier_name:
                return 50
            return 10

        ent_res = await db.execute(select(WorkspacePlanEntitlement).where(WorkspacePlanEntitlement.user_id == user_id))
        ent = ent_res.scalar_one_or_none()
        if ent:
            tier_name = (ent.plan_tier or "free").lower()
            return FALLBACK_TIER_LIMITS.get(tier_name, FALLBACK_TIER_LIMITS["free"])["max_documents"]

        return 10

    @classmethod
    async def get_workspace_usage(cls, workspace_id: uuid.UUID, db: AsyncSession) -> dict[str, int]:
        return await cls.get_user_usage(workspace_id, db)

    @classmethod
    async def get_user_usage(cls, user_id: uuid.UUID, db: AsyncSession) -> dict[str, int]:
        """Aggregate usage events for the current user billing cycle."""
        ent_res = await db.execute(select(WorkspacePlanEntitlement).where(WorkspacePlanEntitlement.user_id == user_id))
        ent = ent_res.scalar_one_or_none()
        period_start = ent.period_start if ent else None

        stmt = (
            select(UsageEvent.event_type, func.sum(UsageEvent.quantity))
            .where(UsageEvent.user_id == user_id)
            .group_by(UsageEvent.event_type)
        )
        if period_start:
            stmt = stmt.where(UsageEvent.created_at >= period_start)

        res = await db.execute(stmt)
        return {row[0]: int(row[1]) for row in res.all()}

    @classmethod
    async def get_user_storage_mb(cls, user_id: uuid.UUID, db: AsyncSession) -> float:
        """Calculate total uploaded file storage in MB for the user."""
        stmt = select(func.coalesce(func.sum(Document.file_size_bytes), 0)).where(Document.user_id == user_id)
        total_bytes = (await db.execute(stmt)).scalar() or 0
        return float(total_bytes) / (1024 * 1024)

    @classmethod
    async def check_chat_entitlement(cls, user_id: uuid.UUID, db: AsyncSession) -> None:
        """Verify user has not exhausted monthly chat turns."""
        tier = await cls.get_user_tier(user_id, db)
        limit = int(tier.max_monthly_messages) if tier else 100
        usage = await cls.get_user_usage(user_id, db)
        current = usage.get("chat_turn", 0)

        if current >= limit:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Monthly chat turn limit ({limit}) reached for your account. Upgrade your plan to continue.",
            )

    @classmethod
    async def check_assistant_entitlement(
        cls, user_id: uuid.UUID, current_count: int, db: Optional[AsyncSession] = None
    ) -> None:
        """Verify user has not exhausted assistant creation limit."""
        if not db:
            return
        tier = await cls.get_user_tier(user_id, db)
        limit = int(tier.max_assistants) if tier else 2
        if current_count >= limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Assistant limit ({limit}) reached for your account. Upgrade your plan to create more assistants."
                ),
            )

    @classmethod
    async def check_document_entitlement(
        cls, user_id: uuid.UUID, current_count: int, additional_docs: int = 1, db: Optional[AsyncSession] = None
    ) -> None:
        """Verify adding documents does not exceed the user's document limit."""
        if not db:
            return
        limit = await cls.get_user_document_limit(user_id, db)
        if (current_count + additional_docs) > limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Document limit ({limit}) reached for your account. Cannot add {additional_docs} document(s). "
                    "Upgrade your plan to index more documents."
                ),
            )

    @classmethod
    async def check_storage_entitlement(cls, user_id: uuid.UUID, additional_bytes: int, db: AsyncSession) -> None:
        """Verify uploading file does not exceed total storage MB quota."""
        tier = await cls.get_user_tier(user_id, db)
        limit_mb = float(tier.max_storage_mb) if tier else 50.0
        current_mb = await cls.get_user_storage_mb(user_id, db)
        added_mb = additional_bytes / (1024 * 1024)

        if (current_mb + added_mb) > limit_mb:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Storage limit ({limit_mb} MB) exceeded for your account. Upgrade your plan to upload more files."
                ),
            )

    @classmethod
    def check_file_size_entitlement(cls, file_size_bytes: int) -> None:
        """Verify single file size does not exceed default quota."""
        limit_mb = 10.0
        if (file_size_bytes / (1024 * 1024)) > limit_mb:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds maximum upload size of {limit_mb} MB.",
            )


subscription_service = SubscriptionService()
