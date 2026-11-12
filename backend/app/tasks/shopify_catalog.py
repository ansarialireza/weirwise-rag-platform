"""Background synchronization of a Shopify product snapshot into Core."""

import asyncio
import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from backend.app.adapters.core_client import CoreApiClient, CoreApiException
from backend.app.core.logging import logger
from backend.app.db.session import async_session_factory
from backend.app.models.assistant import BusinessIntegration
from backend.app.models.project import (
    Document,
    KnowledgeSource,
    KnowledgeSourceType,
    SourceProcessingStatus,
)
from backend.app.services.integrations import integrations_service
from backend.app.services.mock_integrations import MockIntegrationError, mock_shopify_products
from backend.app.services.shopify import ShopifyOAuthError, normalize_shop_domain
from backend.app.services.shopify_catalog import (
    ShopifyCatalogError,
    fetch_shopify_products,
    render_product_catalog,
)
from backend.app.services.storage import storage_service
from backend.app.services.subscription import subscription_service
from backend.app.tasks.ingestion import process_document_ingestion
from fastapi import HTTPException
from sqlalchemy import func, select, update


async def run_shopify_catalog_sync(integration_id: uuid.UUID, user_id: uuid.UUID) -> None:
    try:
        await _sync_shopify_catalog(integration_id, user_id)
    except ShopifyCatalogError as exc:
        logger.warning("Shopify catalog sync failed for integration %s: %s", integration_id, exc.code)
        await _mark_sync_failed(integration_id, user_id, exc.public_message)
    except (ShopifyOAuthError, CoreApiException) as exc:
        logger.warning("Shopify catalog sync failed for integration %s: %s", integration_id, type(exc).__name__)
        await _mark_sync_failed(
            integration_id,
            user_id,
            "The store could not be synchronized. Check the connection and try again.",
        )
    except HTTPException as exc:
        message = str(exc.detail) if isinstance(exc.detail, str) else "Your plan does not allow this catalog sync."
        await _mark_sync_failed(integration_id, user_id, message)
    except Exception:
        logger.exception("Unexpected Shopify catalog sync failure for integration %s", integration_id)
        await _mark_sync_failed(
            integration_id,
            user_id,
            "The store could not be synchronized. Try again.",
        )


async def _sync_shopify_catalog(integration_id: uuid.UUID, user_id: uuid.UUID) -> None:
    async with async_session_factory() as db:
        result = await db.execute(
            select(BusinessIntegration).where(
                BusinessIntegration.id == integration_id,
                BusinessIntegration.user_id == user_id,
                BusinessIntegration.provider == "shopify",
                BusinessIntegration.is_active.is_(True),
            )
        )
        integration = result.scalar_one_or_none()
        if integration is None:
            return

        config: dict[str, Any] = dict(integration.config or {})
        try:
            shop_domain = normalize_shop_domain(str(config.get("shop_domain") or integration.connection_key))
        except ShopifyOAuthError:
            raise ShopifyCatalogError("invalid_configuration", "Reconnect your Shopify store to continue.")

        if config.get("mock_provider") is True:
            try:
                products = mock_shopify_products()
            except MockIntegrationError as exc:
                raise ShopifyCatalogError("demo_disabled", "Demo integrations are disabled.") from exc
        else:
            credentials = integrations_service.get_decrypted_credentials(integration)
            if not credentials:
                raise ShopifyCatalogError("invalid_credentials", "Reconnect your Shopify store to continue.")

            async def persist_refreshed_credentials(updated_credentials: dict[str, Any]) -> None:
                nonlocal config, integration
                config["access_token_expires_at"] = updated_credentials["access_token_expires_at"]
                config["refresh_token_expires_at"] = updated_credentials["refresh_token_expires_at"]
                integration = await integrations_service.create_or_update_integration(
                    db=db,
                    user_id=user_id,
                    provider="shopify",
                    display_name=integration.display_name,
                    credentials=updated_credentials,
                    config=config,
                    connection_key=shop_domain,
                )

            async def update_sync_heartbeat() -> None:
                integration.updated_at = datetime.now(UTC)
                await db.commit()

            products, _ = await fetch_shopify_products(
                shop_domain,
                credentials,
                on_credentials_rotated=persist_refreshed_credentials,
                on_progress=update_sync_heartbeat,
            )
        content = render_product_catalog(shop_domain, products)
        content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        source = await _get_or_create_source(db, integration, user_id, shop_domain)
        config = {**config, "catalog_source_id": str(source.id)}
        integration.config = config
        await db.commit()
        previous_docs = await _source_documents(db, source.id)

        if (
            config.get("catalog_hash") == content_hash
            and source.status == SourceProcessingStatus.READY.value
            and any(doc.status == SourceProcessingStatus.READY.value and doc.core_doc_id for doc in previous_docs)
        ):
            integration.config = {
                **config,
                "catalog_source_id": str(source.id),
                "product_count": len(products),
            }
            integration.last_synced_at = datetime.now(UTC)
            integration.sync_status = "completed"
            integration.last_error = None
            await db.commit()
            return

        content_size = len(content.encode("utf-8"))
        await _check_catalog_entitlements(db, user_id, content_size, previous_docs)
        filename, storage_path, file_size, file_hash = await storage_service.save_text_content(
            f"{'Demo ' if config.get('mock_provider') is True else ''}Shopify {shop_domain} catalog",
            content,
        )
        document = Document(
            user_id=user_id,
            knowledge_source_id=source.id,
            filename=filename,
            mime_type="text/plain",
            file_size_bytes=file_size,
            content_hash=file_hash,
            storage_path=storage_path,
            status=SourceProcessingStatus.PENDING.value,
            doc_metadata={
                "provider": "shopify",
                "shop_domain": shop_domain,
                "product_count": len(products),
                "catalog_hash": content_hash,
                **({"mock_provider": True} if config.get("mock_provider") is True else {}),
            },
        )
        source.status = SourceProcessingStatus.PENDING.value
        source.error_message = None
        db.add(document)
        await db.commit()
        await db.refresh(document)

        await process_document_ingestion(document.id, user_id)
        await db.refresh(document)
        if document.status != SourceProcessingStatus.READY.value or not document.core_doc_id:
            raise ShopifyCatalogError(
                "indexing_failed",
                "Products were fetched, but indexing did not finish. Retry the product sync.",
            )

        core_client = CoreApiClient()
        old_documents = await _source_documents(db, source.id, exclude_id=document.id)
        for old_document in old_documents:
            if old_document.core_doc_id:
                await core_client.delete_document(old_document.core_doc_id)

        integration.config = {
            **config,
            "catalog_source_id": str(source.id),
            "catalog_document_id": str(document.id),
            "catalog_hash": content_hash,
            "product_count": len(products),
        }
        source.settings = {
            **dict(source.settings or {}),
            "integration_id": str(integration.id),
            "product_count": len(products),
            "catalog_hash": content_hash,
        }
        source.status = SourceProcessingStatus.READY.value
        source.error_message = None
        integration.last_synced_at = datetime.now(UTC)
        integration.sync_status = "completed"
        integration.last_error = None
        for old_document in old_documents:
            await db.delete(old_document)
        await db.commit()

        for old_document in old_documents:
            storage_service.delete_file(old_document.storage_path)


async def _get_or_create_source(
    db,
    integration: BusinessIntegration,
    user_id: uuid.UUID,
    shop_domain: str,
) -> KnowledgeSource:
    is_demo = (integration.config or {}).get("mock_provider") is True
    source_id_value = (integration.config or {}).get("catalog_source_id")
    try:
        source_id = uuid.UUID(str(source_id_value)) if source_id_value else None
    except ValueError:
        source_id = None

    source = None
    if source_id:
        result = await db.execute(
            select(KnowledgeSource).where(
                KnowledgeSource.id == source_id,
                KnowledgeSource.user_id == user_id,
                KnowledgeSource.source_type == KnowledgeSourceType.SHOPIFY_CATALOG.value,
            )
        )
        source = result.scalar_one_or_none()

    if source is None:
        source = KnowledgeSource(
            user_id=user_id,
            name=f"{'Demo ' if is_demo else ''}Shopify products - {shop_domain}",
            source_type=KnowledgeSourceType.SHOPIFY_CATALOG.value,
            target_url=None if is_demo else f"https://{shop_domain}",
            settings={
                "integration_id": str(integration.id),
                "shop_domain": shop_domain,
                **({"mock_provider": True} if is_demo else {}),
            },
        )
        db.add(source)
        await db.flush()
    else:
        if is_demo:
            source.target_url = None
        source_settings = {
            **dict(source.settings or {}),
            "integration_id": str(integration.id),
            "shop_domain": shop_domain,
        }
        if is_demo:
            source_settings["mock_provider"] = True
        else:
            source_settings.pop("mock_provider", None)
        source.settings = source_settings
    return source


async def _source_documents(
    db,
    source_id: uuid.UUID,
    exclude_id: uuid.UUID | None = None,
) -> list[Document]:
    statement = select(Document).where(Document.knowledge_source_id == source_id)
    if exclude_id:
        statement = statement.where(Document.id != exclude_id)
    result = await db.execute(statement)
    return list(result.scalars().all())


async def _check_catalog_entitlements(
    db,
    user_id: uuid.UUID,
    content_size: int,
    previous_docs: list[Document],
) -> None:
    current_count = (await db.execute(select(func.count(Document.id)).where(Document.user_id == user_id))).scalar() or 0
    await subscription_service.check_document_entitlement(
        user_id,
        current_count,
        additional_docs=0 if previous_docs else 1,
        db=db,
    )
    subscription_service.check_file_size_entitlement(content_size)
    old_size = sum(document.file_size_bytes for document in previous_docs)
    await subscription_service.check_storage_entitlement(
        user_id,
        max(0, content_size - old_size),
        db,
    )


async def _mark_sync_failed(integration_id: uuid.UUID, user_id: uuid.UUID, message: str) -> None:
    try:
        async with async_session_factory() as db:
            result = await db.execute(
                select(BusinessIntegration).where(
                    BusinessIntegration.id == integration_id,
                    BusinessIntegration.user_id == user_id,
                )
            )
            integration = result.scalar_one_or_none()
            if integration:
                integration.sync_status = "failed"
                integration.last_error = message
                await db.commit()
    except Exception:
        logger.exception("Could not persist Shopify sync failure for integration %s", integration_id)


async def shopify_catalog_sync_worker() -> None:
    """Claim persisted sync requests and requeue work interrupted by a process restart."""
    last_recovery = 0.0
    while True:
        try:
            now = asyncio.get_running_loop().time()
            if now - last_recovery >= 60:
                await _requeue_stale_syncs()
                last_recovery = now

            job = await _claim_next_sync()
            if job:
                await run_shopify_catalog_sync(*job)
            else:
                await asyncio.sleep(2)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Shopify catalog sync worker iteration failed")
            await asyncio.sleep(2)


async def _claim_next_sync() -> tuple[uuid.UUID, uuid.UUID] | None:
    async with async_session_factory() as db:
        result = await db.execute(
            select(BusinessIntegration.id, BusinessIntegration.user_id)
            .where(
                BusinessIntegration.provider == "shopify",
                BusinessIntegration.is_active.is_(True),
                BusinessIntegration.sync_status == "queued",
            )
            .order_by(BusinessIntegration.updated_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        job = result.one_or_none()
        if job is None:
            return None
        claim = await db.execute(
            update(BusinessIntegration)
            .where(
                BusinessIntegration.id == job.id,
                BusinessIntegration.sync_status == "queued",
            )
            .values(
                sync_status="syncing",
                last_error=None,
                updated_at=datetime.now(UTC),
            )
        )
        if claim.rowcount != 1:
            await db.rollback()
            return None
        await db.commit()
        return job.id, job.user_id


async def _requeue_stale_syncs() -> None:
    cutoff = datetime.now(UTC) - timedelta(minutes=15)
    async with async_session_factory() as db:
        await db.execute(
            update(BusinessIntegration)
            .where(
                BusinessIntegration.provider == "shopify",
                BusinessIntegration.is_active.is_(True),
                BusinessIntegration.sync_status == "syncing",
                BusinessIntegration.updated_at < cutoff,
            )
            .values(
                sync_status="queued",
                last_error="An interrupted sync is queued to resume.",
                updated_at=datetime.now(UTC),
            )
        )
        await db.commit()
