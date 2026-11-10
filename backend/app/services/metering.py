"""Metering, token accounting, and hard enforcement of Plan Entitlements."""

import logging
import uuid
from datetime import UTC, datetime
from typing import Optional

from backend.app.models.assistant import WorkspacePlanEntitlement
from backend.app.models.audit import UsageEvent
from backend.app.models.auth import SubscriptionTier, User
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class MeteringService:
    """Core metering engine managing usage tracking, billing cycle rollovers, and hard plan ceilings."""

    @classmethod
    async def get_or_create_entitlements(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> WorkspacePlanEntitlement:
        """Fetch user entitlements or initialize from default free tier."""
        stmt = select(WorkspacePlanEntitlement).where(WorkspacePlanEntitlement.user_id == user_id)
        res = await db.execute(stmt)
        ent = res.scalar_one_or_none()

        if ent:
            # Check for monthly billing rollover
            now = datetime.now(UTC)
            period_end = ent.period_end
            if period_end and period_end.tzinfo is None:
                period_end = period_end.replace(tzinfo=UTC)
            if period_end and now >= period_end:
                logger.info(f"Billing cycle expired for user {user_id}. Rolling over usage.")
                ent.period_start = now
                ent.period_end = now.replace(day=28)  # Approximate 1-month window
                ent.current_period_chat_turns = 0
                await db.commit()
                await db.refresh(ent)
            return ent

        # Lookup user to determine initial tier
        user_res = await db.execute(select(User).where(User.id == user_id))
        user_res.scalar_one_or_none()
        plan_name = "free"

        # Lookup SubscriptionTier template
        tier_res = await db.execute(select(SubscriptionTier).where(SubscriptionTier.name == "Free Trial"))
        tier_obj = tier_res.scalar_one_or_none()

        if not tier_obj:
            tier_res = await db.execute(select(SubscriptionTier).order_by(SubscriptionTier.monthly_price.asc()))
            tier_obj = tier_res.scalars().first()

        if tier_obj:
            ent = WorkspacePlanEntitlement(
                user_id=user_id,
                plan_tier=tier_obj.name.lower().replace(" ", "_"),
                max_assistants=int(tier_obj.max_assistants),
                monthly_chat_turns_limit=int(tier_obj.max_monthly_messages),
                max_storage_mb=int(tier_obj.max_storage_mb),
                max_knowledge_sources=3,
                allow_custom_branding=False,
                allow_overage=False,
            )
            db.add(ent)
            await db.commit()
            await db.refresh(ent)
            return ent

        # Fallback conservative defaults
        ent = WorkspacePlanEntitlement(
            user_id=user_id,
            plan_tier=plan_name,
            max_assistants=2,
            monthly_chat_turns_limit=100,
            max_storage_mb=50,
            max_knowledge_sources=3,
            allow_custom_branding=False,
            allow_overage=False,
        )
        db.add(ent)
        await db.commit()
        await db.refresh(ent)
        return ent

    @classmethod
    async def record_chat_turn(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
        assistant_id: Optional[uuid.UUID] = None,
        model_name: Optional[str] = None,
    ) -> None:
        """Atomic recording of a chat turn usage event and entitlement decrement."""
        ent = await cls.get_or_create_entitlements(db, user_id=user_id)

        # Enforce quota ceiling unless overage is authorized
        if ent.current_period_chat_turns >= ent.monthly_chat_turns_limit:
            if not ent.allow_overage:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "error": "quota_exceeded",
                        "resource": "chat_turns",
                        "message": (
                            f"Upgrade required: Monthly chat turn limit ({ent.monthly_chat_turns_limit}) "
                            f"exceeded for your plan tier ({ent.plan_tier})."
                        ),
                    },
                )

        # Increment usage counter
        ent.current_period_chat_turns += 1

        # Write auditable UsageEvent
        meta = {}
        if model_name:
            meta["model"] = model_name

        event = UsageEvent(
            user_id=user_id,
            assistant_id=assistant_id,
            event_type="chat_turn",
            quantity=1,
            metadata_info=meta,
        )
        db.add(event)
        await db.commit()

    @classmethod
    async def check_assistant_creation_limit(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
        current_count: int,
    ) -> None:
        """Verify user has not reached their maximum allowed assistants count."""
        ent = await cls.get_or_create_entitlements(db, user_id=user_id)
        if current_count >= ent.max_assistants:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Assistant creation limit reached: ({ent.max_assistants}) for your plan ({ent.plan_tier}). "
                    "Upgrade your plan to create more assistants."
                ),
            )


metering_service = MeteringService()
