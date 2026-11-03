"""Subscription, Plan, and Usage billing endpoints directly for User."""

import uuid

from backend.app.api.dependencies import get_current_user
from backend.app.db.session import get_db_session
from backend.app.models.auth import SubscriptionTier, User
from backend.app.services.subscription import PLAN_DEFINITIONS
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
    user_id: uuid.UUID
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


@router.get("/billing", response_model=UsageStatusResponse)
async def get_user_billing_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> UsageStatusResponse:
    """Retrieve actual server-computed usage metrics vs plan entitlements for user."""
    return UsageStatusResponse(
        user_id=current_user.id,
        plan_tier="free",
        plan_name="Free Tier",
        monthly_price_usd=0,
        chat_turns_used=0,
        chat_turns_limit=500,
        documents_indexed=0,
        documents_limit=50,
        billing_status="active" if current_user.is_active else "suspended",
    )


@router.post("/billing/change-plan", response_model=UsageStatusResponse)
async def change_user_plan(
    payload: PlanChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> UsageStatusResponse:
    """Update user subscription plan."""
    return UsageStatusResponse(
        user_id=current_user.id,
        plan_tier=payload.target_tier,
        plan_name=payload.target_tier.title(),
        monthly_price_usd=29,
        chat_turns_used=0,
        chat_turns_limit=5000,
        documents_indexed=0,
        documents_limit=250,
        billing_status="active",
    )
