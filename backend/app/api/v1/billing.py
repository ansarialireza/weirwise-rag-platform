"""Subscription, Plan, and Usage billing endpoints."""

import uuid

from backend.app.api.dependencies import WorkspaceContext, require_workspace
from backend.app.db.session import get_db_session
from backend.app.models.auth import SubscriptionTier, WorkspaceRole
from backend.app.services.subscription import PLAN_DEFINITIONS, subscription_service
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["Billing & Plans"])


class PlanInfoResponse(BaseModel):
    tier: str
    name: str
    monthly_price_usd: int
    max_assistants: int
    max_documents: int
    max_chat_turns_monthly: int
    max_file_size_mb: int
    allowed_models: list[str]
    features: list[str]


class UsageStatusResponse(BaseModel):
    workspace_id: uuid.UUID
    plan_tier: str
    plan_name: str
    monthly_price_usd: int
    chat_turns_used: int
    chat_turns_limit: int
    documents_indexed: int
    documents_limit: int
    billing_status: str


class PlanChangeRequest(BaseModel):
    target_tier: str


@router.get("/plans", response_model=list[PlanInfoResponse])
async def list_available_plans(db: AsyncSession = Depends(get_db_session)) -> list[PlanInfoResponse]:
    """Public listing of available pricing tiers and entitlements dynamically backed by SubscriptionTier table."""
    st_res = await db.execute(select(SubscriptionTier).order_by(SubscriptionTier.monthly_price.asc()))
    tiers = st_res.scalars().all()
    if tiers:
        return [
            PlanInfoResponse(
                tier=t.name.lower().replace(" ", "_"),
                name=t.name,
                monthly_price_usd=int(t.monthly_price),
                max_assistants=int(t.max_assistants),
                max_documents=int(t.max_assistants * 50),
                max_chat_turns_monthly=int(t.max_monthly_messages),
                max_file_size_mb=int(t.max_storage_mb),
                allowed_models=["Auto", "Fast"] if t.monthly_price == 0 else ["Auto", "Fast", "Deep Thinking"],
                features=[
                    f"{int(t.max_assistants)} Assistants",
                    f"{int(t.max_assistants * 50)} Documents",
                    f"{int(t.max_monthly_messages):,} Queries / month",
                    f"{int(t.max_storage_mb)} MB Knowledge Storage",
                ],
            )
            for t in tiers
        ]

    return [
        PlanInfoResponse(
            tier=p.tier,
            name=p.name,
            monthly_price_usd=p.monthly_price_usd,
            max_assistants=p.max_assistants,
            max_documents=p.max_documents,
            max_chat_turns_monthly=p.max_chat_turns_monthly,
            max_file_size_mb=p.max_file_size_mb,
            allowed_models=p.allowed_models,
            features=p.features,
        )
        for p in PLAN_DEFINITIONS.values()
    ]


@router.get("/workspaces/{workspace_id}/billing", response_model=UsageStatusResponse)
async def get_workspace_billing_status(
    workspace_id: uuid.UUID,
    context: WorkspaceContext = Depends(
        require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])
    ),
    db: AsyncSession = Depends(get_db_session),
) -> UsageStatusResponse:
    """Retrieve actual server-computed usage metrics vs plan entitlements."""
    ws = context.workspace
    tier = await subscription_service.get_workspace_tier(ws, db)
    fallback_plan = subscription_service.get_plan(ws.plan_tier)
    plan_tier = tier.name.lower().replace(" ", "_") if tier else ws.plan_tier
    plan_name = tier.name if tier else ws.plan_tier
    monthly_price = int(tier.monthly_price) if tier else fallback_plan.monthly_price_usd
    max_turns = int(tier.max_monthly_messages) if tier else fallback_plan.max_chat_turns_monthly
    max_docs = int(tier.max_assistants * 50) if tier else fallback_plan.max_documents

    usage = await subscription_service.get_workspace_usage(ws.id, db)

    return UsageStatusResponse(
        workspace_id=ws.id,
        plan_tier=plan_tier,
        plan_name=plan_name,
        monthly_price_usd=monthly_price,
        chat_turns_used=usage["chat_turns"],
        chat_turns_limit=max_turns,
        documents_indexed=usage["documents_indexed"],
        documents_limit=max_docs,
        billing_status="active" if ws.is_active else "suspended",
    )


@router.post("/workspaces/{workspace_id}/billing/change-plan", response_model=UsageStatusResponse)
async def change_workspace_plan(
    workspace_id: uuid.UUID,
    payload: PlanChangeRequest,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER])),
    db: AsyncSession = Depends(get_db_session),
) -> UsageStatusResponse:
    """Update workspace subscription plan (Owner-only).
    Safe surround for automated upgrades / Stripe subscription webhooks.
    """
    target = payload.target_tier.lower().strip()
    target_clean = target.replace("_", " ")

    # Check database dynamic tiers first
    st_res = await db.execute(select(SubscriptionTier).where(func.lower(SubscriptionTier.name) == target_clean))
    db_tier = st_res.scalar_one_or_none()

    if not db_tier and target not in PLAN_DEFINITIONS:
        # Also check without spaces
        st_res2 = await db.execute(select(SubscriptionTier).where(func.lower(SubscriptionTier.name) == target))
        db_tier = st_res2.scalar_one_or_none()

    if not db_tier and target not in PLAN_DEFINITIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan tier '{payload.target_tier}'.",
        )

    ws = context.workspace
    if db_tier:
        ws.subscription_tier_id = db_tier.id
        ws.plan_tier = db_tier.name.lower().replace(" ", "_")
    else:
        ws.plan_tier = target

    await db.commit()
    await db.refresh(ws)

    tier = await subscription_service.get_workspace_tier(ws, db)
    fallback_plan = subscription_service.get_plan(ws.plan_tier)
    plan_tier = tier.name.lower().replace(" ", "_") if tier else ws.plan_tier
    plan_name = tier.name if tier else ws.plan_tier
    monthly_price = int(tier.monthly_price) if tier else fallback_plan.monthly_price_usd
    max_turns = int(tier.max_monthly_messages) if tier else fallback_plan.max_chat_turns_monthly
    max_docs = int(tier.max_assistants * 50) if tier else fallback_plan.max_documents

    usage = await subscription_service.get_workspace_usage(ws.id, db)

    return UsageStatusResponse(
        workspace_id=ws.id,
        plan_tier=plan_tier,
        plan_name=plan_name,
        monthly_price_usd=monthly_price,
        chat_turns_used=usage["chat_turns"],
        chat_turns_limit=max_turns,
        documents_indexed=usage["documents_indexed"],
        documents_limit=max_docs,
        billing_status="active" if ws.is_active else "suspended",
    )
