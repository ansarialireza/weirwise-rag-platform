"""Business Integrations, Webhooks, and n8n Interoperability Endpoints."""

import uuid

from backend.app.api.dependencies import get_current_user
from backend.app.db.session import get_db_session
from backend.app.models.assistant import (
    BusinessIntegration,
    WebhookSubscription,
)
from backend.app.models.auth import User
from backend.app.schemas.assistant import (
    BusinessIntegrationCreateRequest,
    BusinessIntegrationResponse,
    WebhookSubscriptionCreateRequest,
    WebhookSubscriptionResponse,
)
from backend.app.services.integrations import integrations_service
from backend.app.services.scraper import is_ssrf_safe_url
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["Integrations & Webhooks"])


# --- Business Integrations (Shopify, Zendesk, Gorgias, Google Drive, Notion) ---


@router.post("/integrations", response_model=BusinessIntegrationResponse, status_code=status.HTTP_201_CREATED)
async def connect_integration(
    payload: BusinessIntegrationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> BusinessIntegrationResponse:
    """Connect a business service (e.g. Shopify, Zendesk, Gorgias) with encrypted credential storage."""
    try:
        integration = await integrations_service.create_or_update_integration(
            db=db,
            user_id=current_user.id,
            provider=payload.provider,
            display_name=payload.display_name,
            credentials=payload.credentials,
            config=payload.config,
            connection_key=payload.connection_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return BusinessIntegrationResponse.model_validate(integration)


@router.get("/integrations", response_model=list[BusinessIntegrationResponse])
async def list_integrations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[BusinessIntegrationResponse]:
    """List connected business integrations for authenticated user."""
    stmt = select(BusinessIntegration).where(BusinessIntegration.user_id == current_user.id)
    res = await db.execute(stmt)
    return [BusinessIntegrationResponse.model_validate(i) for i in res.scalars().all()]


@router.post("/integrations/{integration_id}/sync")
async def trigger_integration_sync(
    integration_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Trigger incremental knowledge synchronization for a connected integration."""
    stmt = select(BusinessIntegration).where(
        BusinessIntegration.id == integration_id,
        BusinessIntegration.user_id == current_user.id,
    )
    res = await db.execute(stmt)
    integration = res.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found.")

    sync_result = await integrations_service.sync_integration_knowledge(db, current_user.id, integration.id)
    if sync_result.get("status") == "not_implemented":
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=sync_result["message"])
    if sync_result.get("status") == "failed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=sync_result["error"])
    return sync_result


@router.delete("/integrations/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_integration(
    integration_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Disconnect and revoke credentials for an integration."""
    stmt = select(BusinessIntegration).where(
        BusinessIntegration.id == integration_id,
        BusinessIntegration.user_id == current_user.id,
    )
    res = await db.execute(stmt)
    integration = res.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found.")

    await db.delete(integration)
    await db.commit()


# --- Outgoing Webhooks (n8n, Zapier, Custom Systems) ---


@router.post("/webhooks", response_model=WebhookSubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook_subscription(
    payload: WebhookSubscriptionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> WebhookSubscriptionResponse:
    """Register an outgoing webhook endpoint with HMAC signature secret."""
    # SSRF protection
    if not is_ssrf_safe_url(payload.target_url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook target URL cannot point to local or private IP addresses.",
        )

    secret = f"whsec_{uuid.uuid4().hex}{uuid.uuid4().hex[:16]}"
    sub = WebhookSubscription(
        user_id=current_user.id,
        target_url=payload.target_url,
        secret_key=secret,
        events=payload.events,
        is_active=True,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)

    resp = WebhookSubscriptionResponse.model_validate(sub)
    resp.secret_key = secret  # Returned strictly once upon creation
    return resp


@router.get("/webhooks", response_model=list[WebhookSubscriptionResponse])
async def list_webhook_subscriptions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[WebhookSubscriptionResponse]:
    """List registered webhooks for authenticated user."""
    stmt = select(WebhookSubscription).where(WebhookSubscription.user_id == current_user.id)
    res = await db.execute(stmt)
    return [WebhookSubscriptionResponse.model_validate(s) for s in res.scalars().all()]


@router.delete("/webhooks/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook_subscription(
    webhook_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a webhook subscription."""
    stmt = select(WebhookSubscription).where(
        WebhookSubscription.id == webhook_id,
        WebhookSubscription.user_id == current_user.id,
    )
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook subscription not found.")

    await db.delete(sub)
    await db.commit()
