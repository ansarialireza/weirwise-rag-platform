"""Subscription, Plan, and Usage billing endpoints."""

import uuid

from backend.app.api.dependencies import WorkspaceContext, require_workspace
from backend.app.db.session import get_db_session
from backend.app.models.auth import WorkspaceRole
from backend.app.services.subscription import PLAN_DEFINITIONS, subscription_service
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
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
async def list_available_plans() -> list[PlanInfoResponse]:
    """Public listing of available pricing tiers and entitlements."""
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
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[
        WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER
    ])),
    db: AsyncSession = Depends(get_db_session),
) -> UsageStatusResponse:
    """Retrieve actual server-computed usage metrics vs plan entitlements."""
    ws = context.workspace
    plan = subscription_service.get_plan(ws.plan_tier)
    usage = await subscription_service.get_workspace_usage(ws.id, db)

    return UsageStatusResponse(
        workspace_id=ws.id,
        plan_tier=plan.tier,
        plan_name=plan.name,
        monthly_price_usd=plan.monthly_price_usd,
        chat_turns_used=usage["chat_turns"],
        chat_turns_limit=plan.max_chat_turns_monthly,
        documents_indexed=usage["documents_indexed"],
        documents_limit=plan.max_documents,
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
    target = payload.target_tier.lower()
    if target not in PLAN_DEFINITIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan tier '{payload.target_tier}'. Options: {list(PLAN_DEFINITIONS.keys())}",
        )

    ws = context.workspace
    ws.plan_tier = target
    await db.commit()
    await db.refresh(ws)

    plan = subscription_service.get_plan(ws.plan_tier)
    usage = await subscription_service.get_workspace_usage(ws.id, db)

    return UsageStatusResponse(
        workspace_id=ws.id,
        plan_tier=plan.tier,
        plan_name=plan.name,
        monthly_price_usd=plan.monthly_price_usd,
        chat_turns_used=usage["chat_turns"],
        chat_turns_limit=plan.max_chat_turns_monthly,
        documents_indexed=usage["documents_indexed"],
        documents_limit=plan.max_documents,
        billing_status="active" if ws.is_active else "suspended",
    )
