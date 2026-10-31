"""Centralized Plan Entitlements, Dynamic Quota Limits, Usage Metering, and Overage Controls."""

import uuid
from datetime import UTC, datetime, timedelta

from backend.app.models.assistant import WorkspacePlanEntitlement
from backend.app.models.audit import UsageEvent
from backend.app.models.auth import Workspace
from fastapi import HTTPException, status
from sqlalchemy import func, select
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
    """Manages workspace plan entitlements, enforces quota limits, and records operational usage."""

    @staticmethod
    async def get_or_create_entitlements(db: AsyncSession, workspace_id: uuid.UUID) -> WorkspacePlanEntitlement:
        """Fetch workspace entitlements or initialize from workspace plan tier."""
        stmt = select(WorkspacePlanEntitlement).where(WorkspacePlanEntitlement.workspace_id == workspace_id)
        res = await db.execute(stmt)
        ent = res.scalar_one_or_none()

        if not ent:
            # Query workspace
            ws_res = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
            ws = ws_res.scalar_one_or_none()
            tier = ws.plan_tier if ws else "free"
            defs = PLAN_DEFINITIONS.get(tier, PLAN_DEFINITIONS["free"])

            now = datetime.now(UTC)
            ent = WorkspacePlanEntitlement(
                workspace_id=workspace_id,
                plan_tier=tier,
                max_assistants=defs["max_assistants"],
                max_knowledge_sources=defs["max_knowledge_sources"],
                monthly_chat_turns_limit=defs["monthly_chat_turns_limit"],
                max_storage_mb=defs["max_storage_mb"],
                allow_custom_branding=defs["allow_custom_branding"],
                allow_overage=False,
                overage_rate_cents=defs["overage_rate_cents"],
                data_retention_days=defs["data_retention_days"],
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
        workspace_id: uuid.UUID,
        project_id: uuid.UUID | None,
        assistant_id: uuid.UUID | None,
    ) -> None:
        """Enforce monthly chat turn limit and record UsageEvent."""
        ent = await cls.get_or_create_entitlements(db, workspace_id)

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
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Workspace has reached its monthly plan limit ({ent.monthly_chat_turns_limit} chat turns). Please upgrade your plan or enable optional overage.",
                )

        # Increment usage counter
        ent.current_period_chat_turns += 1

        # Record auditable UsageEvent
        event = UsageEvent(
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
    async def check_assistant_creation_limit(cls, db: AsyncSession, workspace_id: uuid.UUID, current_count: int) -> None:
        """Check if workspace can create another assistant."""
        ent = await cls.get_or_create_entitlements(db, workspace_id)
        if current_count >= ent.max_assistants:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Assistant creation limit reached: your '{ent.plan_tier}' tier permits a maximum of {ent.max_assistants} assistant(s). Please upgrade your plan.",
            )


metering_service = MeteringService()
