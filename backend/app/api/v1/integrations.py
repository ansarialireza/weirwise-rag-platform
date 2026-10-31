"""Business Integrations, Webhooks, and n8n Interoperability Endpoints."""

import uuid

from backend.app.api.dependencies import WorkspaceContext, require_workspace
from backend.app.db.session import get_db_session
from backend.app.models.assistant import (
    BusinessIntegration,
    WebhookSubscription,
)
from backend.app.models.auth import WorkspaceRole
from backend.app.schemas.assistant import (
    BusinessIntegrationCreateRequest,
    BusinessIntegrationResponse,
    WebhookSubscriptionCreateRequest,
    WebhookSubscriptionResponse,
)
from backend.app.services.integrations import integrations_service
from backend.app.services.scraper import is_ssrf_safe_url
from backend.app.services.vault import CredentialVaultService
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["Integrations & Webhooks"])


# --- Business Integrations (Shopify, Zendesk, Gorgias, Google Drive, Notion) ---


@router.post("/integrations", response_model=BusinessIntegrationResponse, status_code=status.HTTP_201_CREATED)
async def connect_integration(
    workspace_id: uuid.UUID,
    payload: BusinessIntegrationCreateRequest,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN])),
    db: AsyncSession = Depends(get_db_session),
) -> BusinessIntegrationResponse:
    """Connect a business service (e.g. Shopify, Zendesk, Gorgias) with encrypted credential storage."""
    integration = await integrations_service.create_or_update_integration(
        db=db,
        workspace_id=workspace_id,
        provider=payload.provider,
        display_name=payload.display_name,
        credentials=payload.credentials,
        config=payload.config,
    )
    return BusinessIntegrationResponse.model_validate(integration)


@router.get("/integrations", response_model=list[BusinessIntegrationResponse])
async def list_integrations(
    workspace_id: uuid.UUID,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])),
    db: AsyncSession = Depends(get_db_session),
) -> list[BusinessIntegrationResponse]:
    """List connected business integrations for workspace."""
    stmt = select(BusinessIntegration).where(BusinessIntegration.workspace_id == workspace_id)
    res = await db.execute(stmt)
    return [BusinessIntegrationResponse.model_validate(i) for i in res.scalars().all()]


@router.post("/integrations/{integration_id}/sync")
async def trigger_integration_sync(
    workspace_id: uuid.UUID,
    integration_id: uuid.UUID,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Trigger incremental knowledge synchronization for a connected integration."""
    stmt = select(BusinessIntegration).where(
        BusinessIntegration.id == integration_id,
        BusinessIntegration.workspace_id == workspace_id,
    )
    res = await db.execute(stmt)
    integration = res.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found.")

    sync_result = await integrations_service.sync_integration_knowledge(db, integration.id)
    return sync_result


@router.delete("/integrations/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_integration(
    workspace_id: uuid.UUID,
    integration_id: uuid.UUID,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Disconnect and revoke credentials for an integration."""
    stmt = select(BusinessIntegration).where(
        BusinessIntegration.id == integration_id,
        BusinessIntegration.workspace_id == workspace_id,
    )
    res = await db.execute(stmt)
    integration = res.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found.")

    await db.delete(integration)
    await db.commit()
    return {}


# --- Outgoing Webhooks (n8n, Zapier, Custom Systems) ---


@router.post("/webhooks", response_model=WebhookSubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook_subscription(
    workspace_id: uuid.UUID,
    payload: WebhookSubscriptionCreateRequest,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN])),
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
        workspace_id=workspace_id,
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
    workspace_id: uuid.UUID,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN])),
    db: AsyncSession = Depends(get_db_session),
) -> list[WebhookSubscriptionResponse]:
    """List registered webhooks for workspace."""
    stmt = select(WebhookSubscription).where(WebhookSubscription.workspace_id == workspace_id)
    res = await db.execute(stmt)
    return [WebhookSubscriptionResponse.model_validate(s) for s in res.scalars().all()]


@router.delete("/webhooks/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook_subscription(
    workspace_id: uuid.UUID,
    webhook_id: uuid.UUID,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete a webhook subscription."""
    stmt = select(WebhookSubscription).where(
        WebhookSubscription.id == webhook_id,
        WebhookSubscription.workspace_id == workspace_id,
    )
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook subscription not found.")

    await db.delete(sub)
    await db.commit()
    return {}
