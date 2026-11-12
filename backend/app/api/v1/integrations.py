"""Business Integrations, Webhooks, and n8n Interoperability Endpoints."""

import uuid

from backend.app.adapters.core_client import CoreApiClient, CoreApiException
from backend.app.api.dependencies import get_current_user
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.db.session import get_db_session
from backend.app.models.assistant import (
    AssistantKnowledgeSource,
    BusinessIntegration,
    WebhookSubscription,
)
from backend.app.models.auth import User
from backend.app.models.project import (
    Document,
    KnowledgeSource,
    KnowledgeSourceType,
    ProcessingJob,
    SourceProcessingStatus,
)
from backend.app.schemas.assistant import (
    BusinessIntegrationCreateRequest,
    BusinessIntegrationResponse,
    WebhookSubscriptionCreateRequest,
    WebhookSubscriptionResponse,
)
from backend.app.schemas.integrations import (
    DemoOAuthCompleteRequest,
    DemoOAuthCompleteResponse,
    DemoOAuthStartResponse,
    IntegrationSyncResponse,
    MockDriveItemsResponse,
    MockDriveSyncRequest,
    ShopifyOAuthStartRequest,
    ShopifyOAuthStartResponse,
)
from backend.app.services.integrations import integrations_service
from backend.app.services.mock_integrations import (
    MOCK_SHOPIFY_DOMAIN,
    MockIntegrationError,
    create_demo_oauth_state,
    demo_authorization_url,
    mock_drive_files,
    mock_drive_items,
    verify_demo_oauth_state,
)
from backend.app.services.scraper import is_ssrf_safe_url
from backend.app.services.shopify import (
    ShopifyOAuthError,
    build_completion_url,
    create_authorization_url,
    get_active_user_id,
    save_shopify_connection,
    verify_callback_parameters,
)
from backend.app.services.storage import storage_service
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["Integrations & Webhooks"])


@router.post("/integrations/shopify/oauth/start", response_model=ShopifyOAuthStartResponse)
async def start_shopify_oauth(
    payload: ShopifyOAuthStartRequest,
    current_user: User = Depends(get_current_user),
) -> ShopifyOAuthStartResponse:
    """Begin Shopify's authorization-code flow for the authenticated account."""
    try:
        authorization_url = create_authorization_url(payload.shop_domain, current_user.id)
    except ShopifyOAuthError as exc:
        if exc.code in {"not_configured", "invalid_configuration"}:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Shopify connection is not configured.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a valid myshopify.com store domain.",
        ) from exc
    return ShopifyOAuthStartResponse(authorization_url=authorization_url)


@router.get("/integrations/shopify/oauth/callback")
async def complete_shopify_oauth(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
):
    """Validate Shopify's signed callback and persist the encrypted offline token."""
    try:
        callback = verify_callback_parameters(list(request.query_params.multi_items()))
    except ShopifyOAuthError as exc:
        if exc.code in {"not_configured", "invalid_configuration"}:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Shopify connection is not configured.",
            ) from exc
        logger.warning("Shopify OAuth callback rejected: %s", exc.code)
        try:
            return RedirectResponse(build_completion_url("failed"), status_code=status.HTTP_303_SEE_OTHER)
        except ShopifyOAuthError as config_error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Shopify connection is not configured.",
            ) from config_error

    shop_domain = str(callback["shop"])
    if callback.get("error"):
        return RedirectResponse(
            build_completion_url("cancelled", shop_domain),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    code = callback.get("code")
    user_id = callback["user_id"]
    if not isinstance(code, str) or not code:
        return RedirectResponse(
            build_completion_url("failed", shop_domain),
            status_code=status.HTTP_303_SEE_OTHER,
        )
    if await get_active_user_id(db, user_id) is None:
        logger.warning("Shopify OAuth callback references an inactive account.")
        return RedirectResponse(
            build_completion_url("failed", shop_domain),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    try:
        await save_shopify_connection(db, user_id, shop_domain, code)
    except ShopifyOAuthError as exc:
        logger.warning("Shopify OAuth completion failed: %s", exc.code)
        return RedirectResponse(
            build_completion_url("failed", shop_domain),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    return RedirectResponse(
        build_completion_url("connected", shop_domain),
        status_code=status.HTTP_303_SEE_OTHER,
    )


@router.get("/integrations/mock/capabilities")
async def get_mock_integration_capabilities(
    current_user: User = Depends(get_current_user),
) -> dict[str, object]:
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is inactive.")
    enabled = settings.DEMO_INTEGRATIONS_ENABLED
    return {
        "enabled": enabled,
        "providers": ["shopify", "google_drive"] if enabled else [],
    }


@router.post("/integrations/mock/{provider}/oauth/start", response_model=DemoOAuthStartResponse)
async def start_demo_integration_oauth(
    provider: str,
    current_user: User = Depends(get_current_user),
) -> DemoOAuthStartResponse:
    if provider not in {"shopify", "google_drive"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo provider not found.")
    try:
        state = create_demo_oauth_state(current_user.id, provider)
        authorization_url = demo_authorization_url(provider, state)
    except MockIntegrationError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo integrations are disabled.") from exc
    return DemoOAuthStartResponse(authorization_url=authorization_url)


@router.post(
    "/integrations/mock/{provider}/oauth/callback",
    response_model=DemoOAuthCompleteResponse,
)
async def complete_demo_integration_oauth(
    provider: str,
    payload: DemoOAuthCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> DemoOAuthCompleteResponse:
    if provider not in {"shopify", "google_drive"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo provider not found.")
    try:
        owner_id = verify_demo_oauth_state(payload.state, provider)
    except MockIntegrationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This demo authorization has expired. Start again to continue.",
        ) from exc
    if owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo authorization belongs to another account.",
        )
    if not payload.approved:
        return DemoOAuthCompleteResponse(status="cancelled")

    if provider == "shopify":
        connection_key = "demo-shopify"
        display_name = "Demo Shopify store · Cedar & Sage"
        config = {
            "mock_provider": True,
            "shop_domain": MOCK_SHOPIFY_DOMAIN,
            "mock_provider_label": "Simulated store",
        }
        credentials = {"mode": "demo", "fixture": "shopify-catalog-v1"}
    else:
        connection_key = "demo-google-drive"
        display_name = "Demo Google Drive · Maya Chen"
        config = {
            "mock_provider": True,
            "account_email": "maya.chen@example.test",
            "mock_provider_label": "Simulated account",
            "selected_file_ids": [],
        }
        credentials = {"mode": "demo", "fixture": "google-drive-v1"}

    integration = await integrations_service.create_or_update_integration(
        db=db,
        user_id=current_user.id,
        provider=provider,
        display_name=display_name,
        credentials=credentials,
        config=config,
        connection_key=connection_key,
    )
    return DemoOAuthCompleteResponse(status="connected", integration_id=integration.id)


# --- Business Integrations (Shopify, Zendesk, Gorgias, Google Drive, Notion) ---


@router.post("/integrations", response_model=BusinessIntegrationResponse, status_code=status.HTTP_201_CREATED)
async def connect_integration(
    payload: BusinessIntegrationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> BusinessIntegrationResponse:
    """Connect a business service (e.g. Shopify, Zendesk, Gorgias) with encrypted credential storage."""
    if payload.config.get("mock_provider") is True:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Demo integrations must be connected through the simulated authorization flow.",
        )
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


@router.post(
    "/integrations/{integration_id}/sync",
    response_model=IntegrationSyncResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_integration_sync(
    integration_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    payload: MockDriveSyncRequest | None = None,
) -> IntegrationSyncResponse:
    """Trigger incremental knowledge synchronization for a connected integration."""
    stmt = (
        select(BusinessIntegration)
        .where(
            BusinessIntegration.id == integration_id,
            BusinessIntegration.user_id == current_user.id,
        )
        .with_for_update()
    )
    res = await db.execute(stmt)
    integration = res.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found.")

    if integration.provider == "shopify":
        if (integration.config or {}).get("mock_provider") is True and not settings.DEMO_INTEGRATIONS_ENABLED:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo integration not found.")
        if not integration.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This Shopify connection is inactive.",
            )
        if integration.sync_status in {"queued", "syncing"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A Shopify product sync is already in progress.",
            )
        integration.sync_status = "queued"
        integration.last_error = None
        await db.commit()
        return IntegrationSyncResponse(integration_id=integration.id, status="queued")

    if integration.provider == "google_drive" and (integration.config or {}).get("mock_provider") is True:
        if not settings.DEMO_INTEGRATIONS_ENABLED:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo integration not found.")
        if not integration.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This Google Drive connection is inactive.",
            )
        if integration.sync_status in {"queued", "syncing"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A Google Drive sync is already in progress.",
            )
        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Choose at least one file from the demo Drive before syncing.",
            )
        try:
            mock_drive_files(payload.file_ids)
        except MockIntegrationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Choose valid files from the demo Drive.",
            ) from exc
        integration.config = {
            **dict(integration.config or {}),
            "selected_file_ids": payload.file_ids,
        }
        integration.sync_status = "queued"
        integration.last_error = None
        await db.commit()
        return IntegrationSyncResponse(integration_id=integration.id, status="queued")

    sync_result = await integrations_service.sync_integration_knowledge(db, current_user.id, integration.id)
    if sync_result.get("status") == "not_implemented":
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=sync_result["message"])
    if sync_result.get("status") == "failed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=sync_result["error"])
    return sync_result


@router.get(
    "/integrations/{integration_id}/google-drive/items",
    response_model=MockDriveItemsResponse,
)
async def list_mock_google_drive_items(
    integration_id: uuid.UUID,
    parent_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> MockDriveItemsResponse:
    integration = await db.scalar(
        select(BusinessIntegration).where(
            BusinessIntegration.id == integration_id,
            BusinessIntegration.user_id == current_user.id,
            BusinessIntegration.provider == "google_drive",
        )
    )
    if (
        integration is None
        or (integration.config or {}).get("mock_provider") is not True
        or not integration.is_active
        or not settings.DEMO_INTEGRATIONS_ENABLED
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo Google Drive account not found.")
    try:
        items = mock_drive_items(parent_id)
    except MockIntegrationError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The selected demo folder was not found.",
        ) from exc
    return MockDriveItemsResponse(parent_id=parent_id, items=items)


async def _cancel_pending_ingestion_jobs(db: AsyncSession, documents: list[Document]) -> None:
    if not documents:
        return
    result = await db.execute(
        select(ProcessingJob)
        .where(
            ProcessingJob.document_id.in_([document.id for document in documents]),
            ProcessingJob.status.in_(("pending", "processing")),
        )
        .with_for_update()
    )
    jobs = result.scalars().all()
    if any(job.status == "processing" for job in jobs) or any(
        document.status == SourceProcessingStatus.PROCESSING.value for document in documents
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Imported files are still being prepared. Try disconnecting again shortly.",
        )
    for job in jobs:
        cancelled_id = await db.scalar(
            delete(ProcessingJob)
            .where(ProcessingJob.id == job.id, ProcessingJob.status == "pending")
            .returning(ProcessingJob.id)
        )
        if cancelled_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A file started processing. Try disconnecting again shortly.",
            )


@router.delete("/integrations/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_integration(
    integration_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Disconnect an integration and remove its associated imported knowledge."""
    stmt = (
        select(BusinessIntegration)
        .where(
            BusinessIntegration.id == integration_id,
            BusinessIntegration.user_id == current_user.id,
        )
        .with_for_update()
    )
    res = await db.execute(stmt)
    integration = res.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found.")

    storage_paths: list[str] = []
    config = dict(integration.config or {})
    source_type = {
        "shopify": KnowledgeSourceType.SHOPIFY_CATALOG.value,
        "google_drive": KnowledgeSourceType.GOOGLE_DRIVE.value,
    }.get(integration.provider)
    has_catalog = integration.provider == "shopify" or (
        integration.provider == "google_drive" and config.get("mock_provider") is True
    )
    if has_catalog:
        if integration.sync_status in {"queued", "syncing"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Wait for the sync to finish before disconnecting this source.",
            )

        source_id_value = config.get("catalog_source_id")
        if source_id_value:
            try:
                source_id = uuid.UUID(str(source_id_value))
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Imported product data could not be verified for safe removal.",
                ) from exc

            source_result = await db.execute(
                select(KnowledgeSource)
                .where(
                    KnowledgeSource.id == source_id,
                    KnowledgeSource.user_id == current_user.id,
                )
                .with_for_update()
            )
            source = source_result.scalar_one_or_none()
            if source is not None:
                if source.source_type != source_type:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Imported product data could not be verified for safe removal.",
                    )

                documents_result = await db.execute(select(Document).where(Document.knowledge_source_id == source.id))
                documents = documents_result.scalars().all()
                if source.status == SourceProcessingStatus.PROCESSING.value or any(
                    document.status == SourceProcessingStatus.PROCESSING.value for document in documents
                ):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Imported product data is still being processed. Try disconnecting again shortly.",
                    )
                await _cancel_pending_ingestion_jobs(db, documents)

                core_client = CoreApiClient()
                try:
                    if source.core_kb_id:
                        await core_client.delete_knowledge_base(source.core_kb_id)
                    else:
                        for document in documents:
                            if document.core_doc_id:
                                await core_client.delete_document(document.core_doc_id)
                except CoreApiException as exc:
                    logger.warning(
                        "Could not remove imported catalog from Core for integration %s (status %s)",
                        integration.id,
                        exc.status_code,
                    )
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="The product knowledge could not be removed right now. Please try again.",
                    ) from exc

                storage_paths = [document.storage_path for document in documents]
                await db.execute(delete(Document).where(Document.knowledge_source_id == source.id))
                await db.execute(
                    delete(AssistantKnowledgeSource).where(AssistantKnowledgeSource.knowledge_source_id == source.id)
                )
                await db.delete(source)

    await db.delete(integration)
    await db.commit()
    for storage_path in storage_paths:
        storage_service.delete_file(storage_path)


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
