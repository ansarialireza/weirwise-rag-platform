"""Business Integration & Webhook dispatch endpoints directly for User."""

import secrets

from backend.app.api.dependencies import get_current_user
from backend.app.core.security import encrypt_token
from backend.app.db.session import get_db_session
from backend.app.models.assistant import ThirdPartyIntegration, WebhookSubscription
from backend.app.models.auth import User
from backend.app.schemas.assistant import (
    BusinessIntegrationCreateRequest,
    BusinessIntegrationResponse,
    WebhookSubscriptionCreateRequest,
    WebhookSubscriptionResponse,
)
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/integrations", tags=["Integrations & Webhooks"])


@router.post("", response_model=BusinessIntegrationResponse, status_code=status.HTTP_201_CREATED)
async def connect_integration(
    payload: BusinessIntegrationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> BusinessIntegrationResponse:
    """Connect a third-party CRM / ticketing tool."""
    enc = encrypt_token(payload.credentials_raw)
    integ = ThirdPartyIntegration(
        user_id=current_user.id,
        provider=payload.provider.value,
        encrypted_credentials=enc,
        config=payload.config,
    )
    db.add(integ)
    await db.commit()
    await db.refresh(integ)
    return BusinessIntegrationResponse.model_validate(integ)


@router.get("", response_model=list[BusinessIntegrationResponse])
async def list_integrations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[BusinessIntegrationResponse]:
    """List configured integrations."""
    stmt = select(ThirdPartyIntegration).where(ThirdPartyIntegration.user_id == current_user.id)
    res = await db.execute(stmt)
    return [BusinessIntegrationResponse.model_validate(i) for i in res.scalars().all()]


@router.post("/webhooks", response_model=WebhookSubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook_subscription(
    payload: WebhookSubscriptionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> WebhookSubscriptionResponse:
    """Register an outbound webhook endpoint."""
    secret = secrets.token_hex(32)
    sub = WebhookSubscription(
        user_id=current_user.id,
        target_url=payload.target_url,
        secret_key=secret,
        events=payload.events,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return WebhookSubscriptionResponse.model_validate(sub)


@router.get("/webhooks", response_model=list[WebhookSubscriptionResponse])
async def list_webhook_subscriptions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[WebhookSubscriptionResponse]:
    """List registered webhooks."""
    stmt = select(WebhookSubscription).where(WebhookSubscription.user_id == current_user.id)
    res = await db.execute(stmt)
    return [WebhookSubscriptionResponse.model_validate(s) for s in res.scalars().all()]
