"""Durable synchronization worker for real Google Drive accounts into Weirwise Core."""

import asyncio
import hashlib
import logging
import uuid
from datetime import UTC, datetime, timedelta
from io import BytesIO
from typing import Any

from backend.app.adapters.core_client import CoreApiClient, CoreApiException
from backend.app.core.config import settings
from backend.app.db.session import async_session_factory
from backend.app.models.assistant import BusinessIntegration
from backend.app.models.project import (
    Document,
    KnowledgeSource,
    KnowledgeSourceType,
    ProcessingJob,
    SourceProcessingStatus,
)
from backend.app.services.google_drive import (
    GoogleDriveApiError,
    GoogleDriveOAuthError,
    download_google_drive_file_content,
)
from backend.app.services.integrations import integrations_service
from backend.app.services.mock_integrations import MockIntegrationError, mock_drive_files
from backend.app.services.storage import storage_service
from backend.app.services.subscription import subscription_service
from backend.app.tasks.ingestion import enqueue_document_ingestion
from fastapi import UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
_SYNC_STALE_AFTER = timedelta(minutes=15)
_POLL_SECONDS = 2


async def google_drive_sync_worker() -> None:
    """Continuously claim queued Google Drive sync requests and resume interrupted syncs."""
    last_recovery = 0.0
    while True:
        try:
            now = asyncio.get_running_loop().time()
            if now - last_recovery >= 60:
                await _requeue_stale_syncs()
                last_recovery = now

            job = await _claim_next_sync()
            if job:
                await run_google_drive_sync(*job)
            else:
                await asyncio.sleep(_POLL_SECONDS)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Google Drive sync worker iteration failed")
            await asyncio.sleep(_POLL_SECONDS)


async def _claim_next_sync() -> tuple[uuid.UUID, uuid.UUID] | None:
    async with async_session_factory() as db:
        result = await db.execute(
            select(BusinessIntegration.id, BusinessIntegration.user_id)
            .where(
                BusinessIntegration.provider == "google_drive",
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

        claimed = await db.execute(
            update(BusinessIntegration)
            .where(
                BusinessIntegration.id == job.id,
                BusinessIntegration.sync_status == "queued",
            )
            .values(sync_status="syncing", updated_at=datetime.now(UTC), last_error=None)
        )
        if claimed.rowcount != 1:
            await db.rollback()
            return None
        await db.commit()
        return job.id, job.user_id


async def _requeue_stale_syncs() -> None:
    cutoff = datetime.now(UTC) - _SYNC_STALE_AFTER
    async with async_session_factory() as db:
        await db.execute(
            update(BusinessIntegration)
            .where(
                BusinessIntegration.provider == "google_drive",
                BusinessIntegration.is_active.is_(True),
                BusinessIntegration.sync_status == "syncing",
                BusinessIntegration.updated_at < cutoff,
            )
            .values(
                sync_status="queued",
                last_error="An interrupted Google Drive sync is queued to resume.",
                updated_at=datetime.now(UTC),
            )
        )
        await db.commit()


async def run_google_drive_sync(integration_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Execute complete file download, diffing, and Core RAG indexing for selected Drive items."""
    try:
        await _sync_google_drive(integration_id, user_id)
    except (GoogleDriveOAuthError, GoogleDriveApiError) as exc:
        logger.warning("Google Drive sync failed for integration %s: %s", integration_id, exc.code)
        await _mark_sync_failed(integration_id, user_id, exc.public_message)
    except MockIntegrationError as exc:
        await _mark_sync_failed(integration_id, user_id, str(exc))
    except CoreApiException as exc:
        logger.warning("Google Drive Core indexing failed for integration %s: %s", integration_id, exc.status_code)
        await _mark_sync_failed(integration_id, user_id, "The imported files could not be indexed. Try again.")
    except Exception:
        logger.exception("Unexpected Google Drive sync failure for integration %s", integration_id)
        await _mark_sync_failed(integration_id, user_id, "The imported files could not be updated. Try again.")


async def _sync_google_drive(integration_id: uuid.UUID, user_id: uuid.UUID) -> None:
    async with async_session_factory() as db:
        integration = await db.scalar(
            select(BusinessIntegration)
            .where(
                BusinessIntegration.id == integration_id,
                BusinessIntegration.user_id == user_id,
                BusinessIntegration.provider == "google_drive",
                BusinessIntegration.is_active.is_(True),
            )
            .with_for_update()
        )
        if integration is None:
            return

        config: dict[str, Any] = dict(integration.config or {})
        selected_ids = config.get("selected_file_ids", [])
        if not isinstance(selected_ids, list) or not all(isinstance(item, str) for item in selected_ids):
            raise GoogleDriveApiError("invalid_selection", "Select files from Google Drive before syncing.")

        is_mock = config.get("mock_provider") is True
        source = await _get_or_create_source(db, integration, user_id)

        # Existing documents mapped by Drive external file_id
        docs_res = await db.execute(select(Document).where(Document.knowledge_source_id == source.id))
        existing_documents = list(docs_res.scalars().all())
        existing_by_file_id: dict[str, Document] = {}
        for doc in existing_documents:
            fid = (doc.doc_metadata or {}).get("drive_file_id")
            if isinstance(fid, str):
                existing_by_file_id[fid] = doc

        # Separate items into to_download, to_keep, and to_remove
        selected_set = set(selected_ids)
        to_remove = [doc for fid, doc in existing_by_file_id.items() if fid not in selected_set]

        # Download / prepare files
        downloaded_payloads: list[tuple[str, str, bytes, str]] = []  # (file_id, filename, content_bytes, mime_type)

        if is_mock:
            if not settings.DEMO_INTEGRATIONS_ENABLED:
                raise MockIntegrationError("Demo integrations are disabled.")
            mock_files = mock_drive_files(selected_ids)
            for mf in mock_files:
                downloaded_payloads.append((mf.id, mf.name, mf.content.encode("utf-8"), mf.mime_type))
        else:
            credentials = integrations_service.get_decrypted_credentials(integration)
            if not credentials:
                raise GoogleDriveOAuthError("invalid_credentials", "Reconnect your Google Drive account.")
            for file_id in selected_ids:
                fname, fbytes, fmime = await download_google_drive_file_content(credentials, file_id)
                downloaded_payloads.append((file_id, fname, fbytes, fmime))

        # Check modifications
        to_add: list[tuple[str, str, bytes, str]] = []
        for file_id, fname, fbytes, fmime in downloaded_payloads:
            curr = existing_by_file_id.get(file_id)
            chash = hashlib.sha256(fbytes).hexdigest()
            if curr is None or curr.content_hash != chash:
                if curr is not None and curr not in to_remove:
                    to_remove.append(curr)
                to_add.append((file_id, fname, fbytes, fmime))

        await _cancel_pending_jobs(db, to_remove)

        # Subscription entitlement checks
        current_count = int(await db.scalar(select(func.count(Document.id)).where(Document.user_id == user_id)) or 0)
        await subscription_service.check_document_entitlement(
            user_id,
            max(0, current_count - len(to_remove)),
            additional_docs=len(to_add),
            db=db,
        )
        added_sizes = sum(len(fbytes) for _, _, fbytes, _ in to_add)
        removed_sizes = sum(doc.file_size_bytes for doc in to_remove)
        for _, _, fbytes, _ in to_add:
            subscription_service.check_file_size_entitlement(len(fbytes))
        await subscription_service.check_storage_entitlement(user_id, added_sizes - removed_sizes, db)

        # Process additions and deletions
        stored_items: list[tuple[str, str, str, int, str, str]] = []  # (file_id, fname, storage_path, size, hash, mime)
        new_documents: list[Document] = []
        try:
            for file_id, fname, fbytes, fmime in to_add:
                upload = UploadFile(filename=fname, file=BytesIO(fbytes))
                try:
                    saved_name, storage_path, file_size, content_hash = await storage_service.save_upload(upload)
                finally:
                    await upload.close()
                stored_items.append((file_id, saved_name, storage_path, file_size, content_hash, fmime))

            # Delete Core documents for removed items
            core_client = CoreApiClient()
            for doc in to_remove:
                if doc.core_doc_id:
                    try:
                        await core_client.delete_document(doc.core_doc_id)
                    except CoreApiException:
                        pass

            for file_id, saved_name, storage_path, file_size, content_hash, fmime in stored_items:
                doc = Document(
                    user_id=user_id,
                    knowledge_source_id=source.id,
                    filename=saved_name,
                    mime_type=fmime,
                    file_size_bytes=file_size,
                    content_hash=content_hash,
                    storage_path=storage_path,
                    status=SourceProcessingStatus.PENDING.value,
                    doc_metadata={
                        "provider": "google_drive",
                        "drive_file_id": file_id,
                    },
                )
                db.add(doc)
                await db.flush()
                await enqueue_document_ingestion(db, doc.id)
                new_documents.append(doc)

            for doc in to_remove:
                await db.delete(doc)

            integration.config = {
                **config,
                "catalog_source_id": str(source.id),
                "selected_file_ids": selected_ids,
                "synced_file_count": len(selected_ids),
            }
            integration.sync_status = "completed"
            integration.last_error = None
            integration.last_synced_at = datetime.now(UTC)

            remaining_docs = [doc for doc in existing_documents if doc not in to_remove] + new_documents
            statuses = [doc.status for doc in remaining_docs]
            pending_or_processing = {SourceProcessingStatus.PENDING.value, SourceProcessingStatus.PROCESSING.value}
            if any(s in pending_or_processing for s in statuses):
                source.status = SourceProcessingStatus.PROCESSING.value
            else:
                source.status = SourceProcessingStatus.READY.value

            source.settings = {
                **dict(source.settings or {}),
                "integration_id": str(integration.id),
                "synced_file_count": len(selected_ids),
            }
            await db.commit()
        except BaseException:
            await db.rollback()
            for _, _, spath, _, _, _ in stored_items:
                storage_service.delete_file(spath)
            raise

        for doc in to_remove:
            storage_service.delete_file(doc.storage_path)


async def _get_or_create_source(
    db: AsyncSession,
    integration: BusinessIntegration,
    user_id: uuid.UUID,
) -> KnowledgeSource:
    config = dict(integration.config or {})
    source_id_value = config.get("catalog_source_id")
    source_id = None
    if source_id_value:
        try:
            source_id = uuid.UUID(str(source_id_value))
        except ValueError:
            pass

    source = None
    if source_id:
        source = await db.scalar(
            select(KnowledgeSource).where(
                KnowledgeSource.id == source_id,
                KnowledgeSource.user_id == user_id,
                KnowledgeSource.source_type == KnowledgeSourceType.GOOGLE_DRIVE.value,
            )
        )
    if source is None:
        source = KnowledgeSource(
            user_id=user_id,
            name=f"Google Drive - {integration.display_name}",
            source_type=KnowledgeSourceType.GOOGLE_DRIVE.value,
            settings={"integration_id": str(integration.id)},
        )
        db.add(source)
        await db.flush()
    return source


async def _cancel_pending_jobs(db: AsyncSession, documents: list[Document]) -> None:
    if not documents:
        return
    doc_ids = [d.id for d in documents]
    jobs_res = await db.execute(
        select(ProcessingJob)
        .where(ProcessingJob.document_id.in_(doc_ids), ProcessingJob.status.in_(("pending", "processing")))
        .with_for_update()
    )
    jobs = jobs_res.scalars().all()
    for job in jobs:
        if job.status == "pending":
            job.status = "cancelled"


async def _mark_sync_failed(integration_id: uuid.UUID, user_id: uuid.UUID, message: str) -> None:
    async with async_session_factory() as db:
        integration = await db.scalar(
            select(BusinessIntegration).where(
                BusinessIntegration.id == integration_id,
                BusinessIntegration.user_id == user_id,
            )
        )
        if integration is not None:
            integration.sync_status = "failed"
            integration.last_error = message
            integration.updated_at = datetime.now(UTC)
            await db.commit()
