"""Centralized Plan Entitlements, Dynamic Quota Limits, Usage Metering, and Overage Controls."""

import uuid
from datetime import UTC, datetime, timedelta

from backend.app.models.assistant import WorkspacePlanEntitlement
from backend.app.models.audit import UsageEvent
from backend.app.models.auth import SubscriptionTier, Workspace
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

PLAN_DEFINITIONS = {
    "free": {
        "max_assistants": 2,
        "max_knowledge_sources": 3,
        "monthly_chat_turns_limit": 100,
        "max_storage_mb": 50,
        "allow_custom_branding": False,
        "overage_rate_cents": 0,
        "data_retention_days": 30,
    },
    "starter": {
        "max_assistants": 5,
        "max_knowledge_sources": 15,
        "monthly_chat_turns_limit": 2000,
        "max_storage_mb": 500,
        "allow_custom_branding": True,
        "overage_rate_cents": 5,
        "data_retention_days": 90,
    },
    "pro": {
        "max_assistants": 25,
        "max_knowledge_sources": 100,
        "monthly_chat_turns_limit": 10000,
        "max_storage_mb": 5000,
        "allow_custom_branding": True,
        "overage_rate_cents": 3,
        "data_retention_days": 365,
    },
    "enterprise": {
        "max_assistants": 9999,
        "max_knowledge_sources": 9999,
        "monthly_chat_turns_limit": 1000000,
        "max_storage_mb": 100000,
        "allow_custom_branding": True,
        "overage_rate_cents": 2,
        "data_retention_days": 1825,
    },
}


class MeteringService:
    """Manages user and account plan entitlements, enforces quota limits, and records operational usage."""

    @staticmethod
    async def get_or_create_entitlements(
        db: AsyncSession,
        workspace_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
    ) -> WorkspacePlanEntitlement:
        """Fetch user or workspace entitlements or initialize from plan tier."""
        conditions = []
        if user_id:
            conditions.append(WorkspacePlanEntitlement.user_id == user_id)
        elif workspace_id:
            conditions.append(WorkspacePlanEntitlement.workspace_id == workspace_id)

        stmt = select(WorkspacePlanEntitlement)
        if conditions:
            stmt = stmt.where(*conditions)
        res = await db.execute(stmt)
        ent = res.scalars().first()

        if not ent and user_id:
            # Check user subscription
            from backend.app.models.billing import BillingPlan, BillingSubscription

            sub_res = await db.execute(
                select(BillingSubscription, BillingPlan)
                .join(BillingPlan, BillingSubscription.plan_id == BillingPlan.id)
                .where(BillingSubscription.user_id == user_id)
                .order_by(BillingSubscription.created_at.desc())
            )
            sub_row = sub_res.first()
            if sub_row:
                sub, plan = sub_row
                now = datetime.now(UTC)
                ent = WorkspacePlanEntitlement(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    plan_tier=plan.code,
                    max_assistants=plan.max_assistants,
                    max_knowledge_sources=plan.max_knowledge_sources,
                    monthly_chat_turns_limit=plan.max_chat_turns_monthly,
                    max_storage_mb=plan.max_storage_mb,
                    allow_custom_branding=plan.allow_custom_branding,
                    allow_overage=plan.allow_overage,
                    overage_rate_cents=plan.overage_rate_cents,
                    data_retention_days=30,
                    current_period_chat_turns=0,
                    period_start=sub.current_period_start,
                    period_end=sub.current_period_end,
                )
                db.add(ent)
                await db.commit()
                await db.refresh(ent)
                return ent

        if not ent:
            tier_name = "free"
            max_assts = 2
            max_messages = 100
            max_storage = 50

            if workspace_id:
                ws_res = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
                ws = ws_res.scalar_one_or_none()
                if ws:
                    tier_name = ws.plan_tier or "free"
                    if ws.subscription_tier_id:
                        st_stmt = select(SubscriptionTier).where(SubscriptionTier.id == ws.subscription_tier_id)
                        st_res = await db.execute(st_stmt)
                        st = st_res.scalar_one_or_none()
                        if st:
                            tier_name = st.name
                            max_assts = int(st.max_assistants)
                            max_messages = int(st.max_monthly_messages)
                            max_storage = int(st.max_storage_mb)

            if tier_name not in ["free", "starter", "pro", "enterprise"]:
                defs = PLAN_DEFINITIONS.get(tier_name, PLAN_DEFINITIONS["free"])
                max_assts = defs["max_assistants"]
                max_messages = defs["monthly_chat_turns_limit"]
                max_storage = defs["max_storage_mb"]

            now = datetime.now(UTC)
            ent = WorkspacePlanEntitlement(
                user_id=user_id,
                workspace_id=workspace_id,
                plan_tier=tier_name,
                max_assistants=max_assts,
                max_knowledge_sources=max_assts * 3,
                monthly_chat_turns_limit=max_messages,
                max_storage_mb=max_storage,
                allow_custom_branding=False,
                allow_overage=False,
                overage_rate_cents=5,
                data_retention_days=30,
                current_period_chat_turns=0,
                period_start=now,
                period_end=now + timedelta(days=30),
            )
            db.add(ent)
            await db.commit()
            await db.refresh(ent)

        return ent

    @classmethod
    async def check_and_increment_chat_turn(
        cls,
        db: AsyncSession,
        workspace_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        assistant_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
    ) -> None:
        """Enforce monthly chat turn limit and record UsageEvent."""
        ent = await cls.get_or_create_entitlements(db, workspace_id=workspace_id, user_id=user_id)

        # Reset period if expired
        now = datetime.now(UTC)
        if ent.period_end:
            p_end = ent.period_end if ent.period_end.tzinfo else ent.period_end.replace(tzinfo=UTC)
            if now > p_end:
                ent.current_period_chat_turns = 0
                ent.period_start = now
                ent.period_end = now + timedelta(days=30)

        # Check limit
        if ent.current_period_chat_turns >= ent.monthly_chat_turns_limit:
            if not ent.allow_overage:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "error": "quota_exceeded",
                        "resource": "chat_turns",
                        "current": ent.current_period_chat_turns,
                        "limit": ent.monthly_chat_turns_limit,
                        "tier": ent.plan_tier,
                        "message": (
                            f"Account has reached its monthly plan limit ({ent.monthly_chat_turns_limit} chat turns) "
                            f"for tier '{ent.plan_tier}'. Upgrade required to continue."
                        ),
                    },
                )

        # Increment usage counter
        ent.current_period_chat_turns += 1

        # Record auditable UsageEvent
        event = UsageEvent(
            user_id=user_id,
            workspace_id=workspace_id,
            project_id=project_id,
            assistant_id=assistant_id,
            event_type="chat_turn",
            quantity=1,
            metadata_info={"overage": ent.current_period_chat_turns > ent.monthly_chat_turns_limit},
        )
        db.add(event)
        await db.commit()

    @classmethod
    async def check_assistant_creation_limit(
        cls,
        db: AsyncSession,
        workspace_id: uuid.UUID | None,
        current_count: int,
        user_id: uuid.UUID | None = None,
    ) -> None:
        """Check if user can create another assistant."""
        ent = await cls.get_or_create_entitlements(db, workspace_id=workspace_id, user_id=user_id)
        if current_count >= ent.max_assistants:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "quota_exceeded",
                    "resource": "assistants",
                    "current": current_count,
                    "limit": ent.max_assistants,
                    "tier": ent.plan_tier,
                    "message": (
                        f"Assistant creation limit reached: your '{ent.plan_tier}' tier permits a maximum of "
                        f"{ent.max_assistants} assistant(s). Please upgrade your plan."
                    ),
                },
            )


metering_service = MeteringService()
