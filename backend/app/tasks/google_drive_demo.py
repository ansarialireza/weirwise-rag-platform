"""Durable synchronization worker for the explicitly simulated Google Drive account."""

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
from backend.app.services.mock_integrations import MockDriveFile, MockIntegrationError, mock_drive_files
from backend.app.services.storage import storage_service
from backend.app.services.subscription import subscription_service
from backend.app.tasks.ingestion import enqueue_document_ingestion
from fastapi import UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
_SYNC_STALE_AFTER = timedelta(minutes=15)
_POLL_SECONDS = 2


async def google_drive_demo_sync_worker() -> None:
    """Claim persisted demo sync requests and requeue work interrupted by restarts."""
    last_recovery = 0.0
    while True:
        try:
            now = asyncio.get_running_loop().time()
            if now - last_recovery >= 60:
                await _requeue_stale_syncs()
                last_recovery = now

            job = await _claim_next_sync()
            if job:
                await run_google_drive_demo_sync(*job)
            else:
                await asyncio.sleep(_POLL_SECONDS)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Google Drive demo sync worker iteration failed")
            await asyncio.sleep(_POLL_SECONDS)


async def _claim_next_sync() -> tuple[uuid.UUID, uuid.UUID] | None:
    async with async_session_factory() as db:
        result = await db.execute(
            select(BusinessIntegration)
            .where(
                BusinessIntegration.provider == "google_drive",
                BusinessIntegration.is_active.is_(True),
                BusinessIntegration.sync_status == "queued",
            )
            .order_by(BusinessIntegration.updated_at)
            .limit(10)
            .with_for_update(skip_locked=True)
        )
        candidates = result.scalars().all()
        integration = next(
            (item for item in candidates if (item.config or {}).get("mock_provider") is True),
            None,
        )
        if integration is None:
            await db.rollback()
            return None

        claimed_id = await db.scalar(
            update(BusinessIntegration)
            .where(
                BusinessIntegration.id == integration.id,
                BusinessIntegration.sync_status == "queued",
            )
            .values(sync_status="syncing", updated_at=datetime.now(UTC))
            .returning(BusinessIntegration.id)
        )
        if claimed_id is None:
            await db.rollback()
            return None
        user_id = integration.user_id
        await db.commit()
        return integration.id, user_id


async def _requeue_stale_syncs() -> None:
    cutoff = datetime.now(UTC) - _SYNC_STALE_AFTER
    async with async_session_factory() as db:
        result = await db.execute(
            select(BusinessIntegration)
            .where(
                BusinessIntegration.provider == "google_drive",
                BusinessIntegration.is_active.is_(True),
                BusinessIntegration.sync_status == "syncing",
                BusinessIntegration.updated_at < cutoff,
            )
            .limit(100)
            .with_for_update(skip_locked=True)
        )
        for integration in result.scalars().all():
            if (integration.config or {}).get("mock_provider") is True:
                integration.sync_status = "queued"
                integration.last_error = "An interrupted demo sync is queued to resume."
                integration.updated_at = datetime.now(UTC)
        await db.commit()


async def run_google_drive_demo_sync(integration_id: uuid.UUID, user_id: uuid.UUID) -> None:
    try:
        await _sync_google_drive_demo(integration_id, user_id)
    except MockIntegrationError as exc:
        await _mark_sync_failed(integration_id, user_id, str(exc))
    except CoreApiException as exc:
        logger.warning("Google Drive demo sync failed for integration %s: %s", integration_id, exc.status_code)
        await _mark_sync_failed(integration_id, user_id, "The imported files could not be updated. Try again.")
    except Exception:
        logger.exception("Google Drive demo sync failed for integration %s", integration_id)
        await _mark_sync_failed(integration_id, user_id, "The imported files could not be updated. Try again.")


async def _sync_google_drive_demo(integration_id: uuid.UUID, user_id: uuid.UUID) -> None:
    if not settings.DEMO_INTEGRATIONS_ENABLED:
        raise MockIntegrationError("Demo integrations are disabled.")

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
        if integration is None or (integration.config or {}).get("mock_provider") is not True:
            return

        config: dict[str, Any] = dict(integration.config or {})
        selected_ids = config.get("selected_file_ids")
        if not isinstance(selected_ids, list) or not all(isinstance(item, str) for item in selected_ids):
            raise MockIntegrationError("Select files from the demo Drive before syncing.")
        files = mock_drive_files(selected_ids)

        source = await _get_or_create_source(db, integration, user_id)
        documents_result = await db.execute(select(Document).where(Document.knowledge_source_id == source.id))
        existing_documents = list(documents_result.scalars().all())
        existing_by_external_id: dict[str, Document] = {}
        for document in existing_documents:
            file_id = (document.doc_metadata or {}).get("drive_file_id")
            if isinstance(file_id, str):
                existing_by_external_id[file_id] = document

        files_by_id = {file.id: file for file in files}
        to_remove: list[Document] = []
        to_add: list[MockDriveFile] = []
        for file_id, document in existing_by_external_id.items():
            remote_file = files_by_id.get(file_id)
            if remote_file is None:
                to_remove.append(document)
                continue
            remote_hash = hashlib.sha256(remote_file.content.encode("utf-8")).hexdigest()
            if document.content_hash != remote_hash:
                to_remove.append(document)

        for remote_file in files:
            current = existing_by_external_id.get(remote_file.id)
            remote_hash = hashlib.sha256(remote_file.content.encode("utf-8")).hexdigest()
            if current is None or current.content_hash != remote_hash:
                to_add.append(remote_file)
            elif current.doc_metadata is not None:
                current.doc_metadata = {
                    **dict(current.doc_metadata),
                    "drive_modified_at": remote_file.modified_at,
                }

        await _cancel_pending_jobs_for_deletion(db, to_remove)

        current_count = int(await db.scalar(select(func.count(Document.id)).where(Document.user_id == user_id)) or 0)
        await subscription_service.check_document_entitlement(
            user_id,
            max(0, current_count - len(to_remove)),
            additional_docs=len(to_add),
            db=db,
        )
        added_sizes = sum(len(file.content.encode("utf-8")) for file in to_add)
        removed_sizes = sum(document.file_size_bytes for document in to_remove)
        for file in to_add:
            subscription_service.check_file_size_entitlement(len(file.content.encode("utf-8")))
        await subscription_service.check_storage_entitlement(user_id, added_sizes - removed_sizes, db)

        stored_files: list[tuple[MockDriveFile, str, str, int, str]] = []
        new_documents: list[Document] = []
        try:
            for file in to_add:
                upload = UploadFile(filename=file.name, file=BytesIO(file.content.encode("utf-8")))
                try:
                    filename, storage_path, file_size, content_hash = await storage_service.save_upload(upload)
                finally:
                    await upload.close()
                stored_files.append((file, filename, storage_path, file_size, content_hash))

            for document in to_remove:
                if document.core_doc_id:
                    await CoreApiClient().delete_document(document.core_doc_id)

            for file, filename, storage_path, file_size, content_hash in stored_files:
                document = Document(
                    user_id=user_id,
                    knowledge_source_id=source.id,
                    filename=filename,
                    mime_type=file.mime_type,
                    file_size_bytes=file_size,
                    content_hash=content_hash,
                    storage_path=storage_path,
                    status=SourceProcessingStatus.PENDING.value,
                    doc_metadata={
                        "provider": "google_drive",
                        "mock_provider": True,
                        "drive_file_id": file.id,
                        "drive_parent_id": file.parent_id,
                        "drive_modified_at": file.modified_at,
                    },
                )
                db.add(document)
                await db.flush()
                await enqueue_document_ingestion(db, document.id)
                new_documents.append(document)

            for document in to_remove:
                await db.delete(document)

            integration.config = {
                **config,
                "catalog_source_id": str(source.id),
                "selected_file_ids": selected_ids,
                "synced_file_count": len(files),
            }
            integration.sync_status = "completed"
            integration.last_error = None
            integration.last_synced_at = datetime.now(UTC)

            remaining_documents = [doc for doc in existing_documents if doc not in to_remove] + new_documents
            statuses = [doc.status for doc in remaining_documents]
            if any(
                state in {SourceProcessingStatus.PENDING.value, SourceProcessingStatus.PROCESSING.value}
                for state in statuses
            ):
                source.status = SourceProcessingStatus.PROCESSING.value
            elif any(state == SourceProcessingStatus.READY.value for state in statuses) or not statuses:
                source.status = SourceProcessingStatus.READY.value
            elif all(state == SourceProcessingStatus.FAILED.value for state in statuses):
                source.status = SourceProcessingStatus.FAILED.value
            else:
                source.status = SourceProcessingStatus.PENDING.value

            source.settings = {
                **dict(source.settings or {}),
                "integration_id": str(integration.id),
                "mock_provider": True,
                "synced_file_count": len(files),
            }
            await db.commit()
        except BaseException:
            await db.rollback()
            for _, _, storage_path, _, _ in stored_files:
                storage_service.delete_file(storage_path)
            raise

        for document in to_remove:
            storage_service.delete_file(document.storage_path)


async def _get_or_create_source(
    db: AsyncSession,
    integration: BusinessIntegration,
    user_id: uuid.UUID,
) -> KnowledgeSource:
    config = dict(integration.config or {})
    source_id_value = config.get("catalog_source_id")
    try:
        source_id = uuid.UUID(str(source_id_value)) if source_id_value else None
    except ValueError:
        source_id = None

    source = None
    if source_id:
        source = await db.scalar(
            select(KnowledgeSource)
            .where(
                KnowledgeSource.id == source_id,
                KnowledgeSource.user_id == user_id,
                KnowledgeSource.source_type == KnowledgeSourceType.GOOGLE_DRIVE.value,
            )
            .with_for_update()
        )
    if source is None:
        source = KnowledgeSource(
            user_id=user_id,
            name=f"Google Drive demo - {integration.display_name}",
            source_type=KnowledgeSourceType.GOOGLE_DRIVE.value,
            settings={
                "integration_id": str(integration.id),
                "mock_provider": True,
            },
        )
        db.add(source)
        await db.flush()
    return source


async def _cancel_pending_jobs_for_deletion(db: AsyncSession, documents: list[Document]) -> None:
    if not documents:
        return
    document_ids = [document.id for document in documents]
    jobs_result = await db.execute(
        select(ProcessingJob)
        .where(
            ProcessingJob.document_id.in_(document_ids),
            ProcessingJob.status.in_(("pending", "processing")),
        )
        .with_for_update()
    )
    jobs = jobs_result.scalars().all()
    if any(job.status == "processing" for job in jobs) or any(
        document.status == SourceProcessingStatus.PROCESSING.value for document in documents
    ):
        raise MockIntegrationError("Some files are still being prepared. Try syncing again shortly.")
    for job in jobs:
        cancelled_id = await db.scalar(
            update(ProcessingJob)
            .where(ProcessingJob.id == job.id, ProcessingJob.status == "pending")
            .values(status="cancelled")
            .returning(ProcessingJob.id)
        )
        if cancelled_id is None:
            raise MockIntegrationError("A file started processing. Try syncing again shortly.")


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
