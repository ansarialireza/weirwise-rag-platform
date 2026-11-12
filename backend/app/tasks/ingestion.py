"""Background task processor for document indexing, Core synchronization, and tiered storage migration."""

import asyncio
import os
import time
import uuid
from datetime import UTC, datetime, timedelta

from backend.app.adapters.core_client import CoreApiClient, CoreApiException
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.db.session import async_session_factory
from backend.app.models.audit import UsageEvent
from backend.app.models.project import (
    Document,
    KnowledgeSource,
    KnowledgeSourceType,
    ProcessingJob,
    SourceProcessingStatus,
)
from backend.app.services.storage import storage_service
from sqlalchemy import func, or_, select, update

_READY_STATES = {"completed", "ready"}
_FAILED_STATES = {"failed", "error"}

# Semaphore to bound concurrent background indexing tasks and prevent downstream pool exhaustion
_INGESTION_SEMAPHORE = asyncio.Semaphore(10)
_INGESTION_JOB_POLL_SECONDS = 2
_INGESTION_JOB_HEARTBEAT_SECONDS = 30
_INGESTION_JOB_STALE_AFTER = timedelta(minutes=5)
_INGESTION_WORKER_CONCURRENCY = 10


async def enqueue_document_ingestion(db, document_id: uuid.UUID) -> ProcessingJob:
    """Persist an ingestion request in the caller's document transaction."""
    active_job = await db.scalar(
        select(ProcessingJob)
        .where(
            ProcessingJob.document_id == document_id,
            ProcessingJob.status.in_(("pending", "processing")),
        )
        .order_by(ProcessingJob.created_at.desc())
        .limit(1)
    )
    if active_job is not None:
        return active_job

    job = ProcessingJob(
        document_id=document_id,
        status="pending",
        attempts=0,
        max_attempts=3,
    )
    db.add(job)
    await db.flush()
    return job


async def document_ingestion_worker() -> None:
    """Process durable ingestion jobs and recover work interrupted by restarts."""
    last_recovery = 0.0
    active_tasks: set[asyncio.Task[None]] = set()
    while True:
        try:
            now = asyncio.get_running_loop().time()
            if now - last_recovery >= 60:
                await _recover_stale_ingestion_jobs()
                await _enqueue_orphaned_ingestion_jobs()
                last_recovery = now

            while len(active_tasks) < _INGESTION_WORKER_CONCURRENCY:
                job = await _claim_next_ingestion_job()
                if job is None:
                    break
                active_tasks.add(asyncio.create_task(_run_ingestion_job(*job)))

            if active_tasks:
                completed, _ = await asyncio.wait(
                    active_tasks,
                    timeout=_INGESTION_JOB_POLL_SECONDS,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in completed:
                    active_tasks.remove(task)
                    try:
                        task.result()
                    except Exception:
                        logger.exception("Document ingestion worker task failed")
            else:
                await asyncio.sleep(_INGESTION_JOB_POLL_SECONDS)
        except asyncio.CancelledError:
            for task in active_tasks:
                task.cancel()
            await asyncio.gather(*active_tasks, return_exceptions=True)
            raise
        except Exception:
            logger.exception("Document ingestion worker iteration failed")
            await asyncio.sleep(_INGESTION_JOB_POLL_SECONDS)


async def _enqueue_orphaned_ingestion_jobs() -> None:
    """Adopt older pending documents created before durable jobs were written."""
    cutoff = datetime.now(UTC) - _INGESTION_JOB_STALE_AFTER
    active_job = (
        select(ProcessingJob.id)
        .where(
            ProcessingJob.document_id == Document.id,
            ProcessingJob.status.in_(("pending", "processing")),
        )
        .exists()
    )
    async with async_session_factory() as db:
        result = await db.execute(
            select(Document)
            .join(KnowledgeSource, Document.knowledge_source_id == KnowledgeSource.id)
            .where(
                Document.status.in_((SourceProcessingStatus.PENDING.value, SourceProcessingStatus.PROCESSING.value)),
                Document.updated_at < cutoff,
                KnowledgeSource.source_type != KnowledgeSourceType.SHOPIFY_CATALOG.value,
                ~active_job,
            )
            .order_by(Document.updated_at)
            .limit(100)
            .with_for_update(skip_locked=True)
        )
        documents = result.scalars().all()
        for document in documents:
            if document.status == SourceProcessingStatus.PROCESSING.value:
                document.status = SourceProcessingStatus.PENDING.value
                document.error_message = None
            db.add(
                ProcessingJob(
                    document_id=document.id,
                    status="pending",
                    attempts=0,
                    max_attempts=3,
                )
            )
        await db.commit()


async def _claim_next_ingestion_job() -> tuple[uuid.UUID, uuid.UUID, uuid.UUID] | None:
    async with async_session_factory() as db:
        result = await db.execute(
            select(
                ProcessingJob.id,
                Document.id,
                func.coalesce(Document.user_id, KnowledgeSource.user_id),
            )
            .join(Document, ProcessingJob.document_id == Document.id)
            .join(KnowledgeSource, Document.knowledge_source_id == KnowledgeSource.id)
            .where(ProcessingJob.status == "pending")
            .order_by(ProcessingJob.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        row = result.one_or_none()
        if row is None:
            return None

        claimed = await db.execute(
            update(ProcessingJob)
            .where(
                ProcessingJob.id == row[0],
                ProcessingJob.status == "pending",
            )
            .values(
                status="processing",
                attempts=ProcessingJob.attempts + 1,
                updated_at=datetime.now(UTC),
            )
        )
        if claimed.rowcount != 1:
            await db.rollback()
            return None

        await db.commit()
        return row[0], row[1], row[2]


async def _run_ingestion_job(job_id: uuid.UUID, document_id: uuid.UUID, owner_user_id: uuid.UUID) -> None:
    heartbeat = asyncio.create_task(_heartbeat_ingestion_job(job_id))
    try:
        await process_document_ingestion(document_id, owner_user_id)
        await _finish_ingestion_job(job_id, document_id)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.exception("Document ingestion job %s raised an unexpected error", job_id)
        await _finish_ingestion_job(job_id, document_id, error_message=f"Ingestion worker error: {exc!s}")
    finally:
        heartbeat.cancel()
        try:
            await heartbeat
        except asyncio.CancelledError:
            pass


async def _heartbeat_ingestion_job(job_id: uuid.UUID) -> None:
    while True:
        await asyncio.sleep(_INGESTION_JOB_HEARTBEAT_SECONDS)
        try:
            async with async_session_factory() as db:
                await db.execute(
                    update(ProcessingJob)
                    .where(
                        ProcessingJob.id == job_id,
                        ProcessingJob.status == "processing",
                    )
                    .values(updated_at=datetime.now(UTC))
                )
                await db.commit()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Could not heartbeat document ingestion job %s", job_id)


async def _finish_ingestion_job(
    job_id: uuid.UUID,
    document_id: uuid.UUID,
    error_message: str | None = None,
) -> None:
    async with async_session_factory() as db:
        job = await db.get(ProcessingJob, job_id)
        document = await db.get(Document, document_id)
        if job is None or document is None or job.status != "processing":
            return

        if document.status == SourceProcessingStatus.READY.value:
            job.status = "completed"
            job.error_message = None
        else:
            message = error_message or document.error_message
            if document.status != SourceProcessingStatus.FAILED.value:
                message = message or "Ingestion finished without a terminal document status."
                document.status = SourceProcessingStatus.FAILED.value
                document.error_message = message
                source = await db.get(KnowledgeSource, document.knowledge_source_id)
                if source is not None:
                    await _recalculate_source_status(db, source)
            job.status = "failed"
            job.error_message = message

        job.updated_at = datetime.now(UTC)
        await db.commit()


async def _recover_stale_ingestion_jobs() -> None:
    cutoff = datetime.now(UTC) - _INGESTION_JOB_STALE_AFTER
    async with async_session_factory() as db:
        result = await db.execute(
            select(ProcessingJob)
            .where(
                ProcessingJob.status == "processing",
                ProcessingJob.updated_at < cutoff,
            )
            .with_for_update(skip_locked=True)
        )
        stale_jobs = result.scalars().all()
        for job in stale_jobs:
            document = await db.get(Document, job.document_id)
            if document is None:
                job.status = "failed"
                job.error_message = "The document for this ingestion job no longer exists."
                continue

            source = await db.get(KnowledgeSource, document.knowledge_source_id)
            if job.attempts < job.max_attempts:
                job.status = "pending"
                job.error_message = "An interrupted ingestion was queued to resume."
                if document.status == SourceProcessingStatus.PROCESSING.value:
                    document.status = SourceProcessingStatus.PENDING.value
                document.error_message = None
            else:
                job.status = "failed"
                job.error_message = "Ingestion stopped after the maximum number of interrupted attempts."
                document.status = SourceProcessingStatus.FAILED.value
                document.error_message = job.error_message

            job.updated_at = datetime.now(UTC)
            if source is not None:
                await _recalculate_source_status(db, source)

        await db.commit()


async def _wait_for_core_indexing(
    core_client: CoreApiClient, core_doc_id: uuid.UUID, initial_status: str | None
) -> tuple[str, str | None]:
    """Return the terminal Core status, polling while indexing is still in flight.

    The upload API is asynchronous in Core, so treating a 202 as "ready" would
    report indexed documents that are not queryable yet.
    """
    status = (initial_status or "pending").lower()
    if status in _READY_STATES or status in _FAILED_STATES:
        return status, None

    deadline = time.monotonic() + settings.CORE_INDEX_POLL_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        await asyncio.sleep(settings.CORE_INDEX_POLL_INTERVAL_SECONDS)
        try:
            data = await core_client.get_document_status(core_doc_id)
        except CoreApiException as exc:
            logger.warning(f"Core status poll failed for doc {core_doc_id}: {exc!s}")
            continue

        status = str(data.get("status") or "").lower()
        if status in _READY_STATES:
            return status, None
        if status in _FAILED_STATES:
            return status, data.get("error_message")

    logger.warning(f"Core indexing for doc {core_doc_id} did not finish within the polling window.")
    return "timeout", "Core indexing did not complete within the configured timeout."


async def _recalculate_source_status(db, source: KnowledgeSource) -> None:
    """Derive the source status from all of its documents instead of assuming success."""
    res = await db.execute(select(Document).where(Document.knowledge_source_id == source.id))
    documents = res.scalars().all()
    if not documents:
        source.status = SourceProcessingStatus.PENDING.value
        return

    statuses = [doc.status for doc in documents]
    if any(s in (SourceProcessingStatus.PENDING.value, SourceProcessingStatus.PROCESSING.value) for s in statuses):
        source.status = SourceProcessingStatus.PROCESSING.value
        return

    if any(s == SourceProcessingStatus.READY.value for s in statuses):
        source.status = SourceProcessingStatus.READY.value
        source.error_message = None
        return

    if all(s == SourceProcessingStatus.FAILED.value for s in statuses):
        source.status = SourceProcessingStatus.FAILED.value
        source.error_message = next((doc.error_message for doc in documents if doc.error_message), source.error_message)
        return

    source.status = SourceProcessingStatus.READY.value


async def process_document_ingestion(document_id: uuid.UUID, owner_user_id: uuid.UUID) -> None:
    """Enterprise Tiered Storage & Zero-Blocking Async Ingestion Pipeline:
    - Step 1: Upload was spooled to volatile local /tmp (hot tier) and HTTP 202 returned instantly.
    - Step 2: Background worker reads local temp file, extracts/indexes vectors in local pgvector DB.
    - Step 3: Cold Transfer moves the raw file to /mnt/gdrive vault (the permanent cold tier).
    - Step 4: Failsafe Deletion strictly ensures local temp file is deleted in a finally block.
    """
    async with _INGESTION_SEMAPHORE:
        await _process_document_ingestion_inner(document_id, owner_user_id)


async def _process_document_ingestion_inner(document_id: uuid.UUID, owner_user_id: uuid.UUID) -> None:
    initial_temp_path = None
    async with async_session_factory() as db:
        doc_stmt = (
            select(Document)
            .join(KnowledgeSource, Document.knowledge_source_id == KnowledgeSource.id)
            .where(
                Document.id == document_id,
                KnowledgeSource.user_id == owner_user_id,
                or_(Document.user_id == owner_user_id, Document.user_id.is_(None)),
            )
        )
        res = await db.execute(doc_stmt)
        document = res.scalar_one_or_none()

        if not document:
            logger.error(f"Ingestion job rejected: document {document_id} is not owned by user {owner_user_id}.")
            return

        if document.status == SourceProcessingStatus.READY.value:
            return

        ks_stmt = select(KnowledgeSource).where(
            KnowledgeSource.id == document.knowledge_source_id,
            KnowledgeSource.user_id == owner_user_id,
        )
        ks_res = await db.execute(ks_stmt)
        source = ks_res.scalar_one_or_none()

        if not source:
            logger.error(f"Ingestion job failed: KnowledgeSource for doc {document_id} not found.")
            return

        initial_temp_path = document.storage_path

        # Mark document as processing
        document.user_id = owner_user_id
        document.status = SourceProcessingStatus.PROCESSING.value
        source.status = SourceProcessingStatus.PROCESSING.value
        await db.commit()

        core_client = CoreApiClient()

        try:
            # 1. Ensure Knowledge Base exists in Core
            if not source.core_kb_id:
                kb_resp = await core_client.create_knowledge_base(
                    name=f"platform_{source.name}",
                    description=f"Managed by Weirwise Platform (Source ID: {source.id})",
                )
                source.core_kb_id = uuid.UUID(kb_resp["id"])
                await db.commit()

            if document.core_doc_id:
                try:
                    doc_data = await core_client.get_document_status(document.core_doc_id)
                except CoreApiException as exc:
                    if exc.status_code != 404:
                        raise
                    doc_data = {}

                if not doc_data or str(doc_data.get("status", "")).lower() in _FAILED_STATES:
                    file_bytes = storage_service.read_file_bytes(document.storage_path)
                    upload_resp = await core_client.upload_document(
                        kb_id=source.core_kb_id,
                        filename=document.filename,
                        content=file_bytes,
                        mime_type=document.mime_type,
                    )
                    doc_data = upload_resp.get("document", upload_resp)
                    document.core_doc_id = uuid.UUID(str(doc_data["id"]))
                    await db.commit()

                core_doc_id = document.core_doc_id
            else:
                # Read stored bytes and submit to Core. Core deduplicates by content hash
                # if a worker stopped after upload but before persisting the returned ID.
                file_bytes = storage_service.read_file_bytes(document.storage_path)
                upload_resp = await core_client.upload_document(
                    kb_id=source.core_kb_id,
                    filename=document.filename,
                    content=file_bytes,
                    mime_type=document.mime_type,
                )
                doc_data = upload_resp.get("document", upload_resp)
                core_doc_id = uuid.UUID(str(doc_data["id"]))
                document.core_doc_id = core_doc_id
                await db.commit()

            # 5. Cold Transfer: Asynchronously move raw document to Cold Tier (/mnt/gdrive vault)
            # Run in worker thread so sync disk I/O on FUSE mounts never blocks the asyncio event loop
            if os.path.exists(document.storage_path):
                cold_path = await asyncio.to_thread(storage_service.move_to_cold_storage, document.storage_path)
                document.storage_path = cold_path

            # 6. Wait for Core to finish indexing before reporting READY.
            core_status, core_error = await _wait_for_core_indexing(core_client, core_doc_id, doc_data.get("status"))
            if core_status in _READY_STATES:
                document.status = SourceProcessingStatus.READY.value
                document.error_message = None

                # Record auditable document_indexed UsageEvent for user billing
                db.add(
                    UsageEvent(
                        user_id=owner_user_id,
                        event_type="document_indexed",
                        quantity=1,
                        metadata_info={
                            "document_id": str(document.id),
                            "filename": document.filename,
                            "file_size_bytes": document.file_size_bytes,
                        },
                    )
                )
            elif core_status in _FAILED_STATES or core_status == "timeout":
                document.status = SourceProcessingStatus.FAILED.value
                document.error_message = core_error or f"Core indexing ended in state '{core_status}'."
            else:
                document.status = SourceProcessingStatus.PROCESSING.value

            await _recalculate_source_status(db, source)
            await db.commit()
            logger.info(
                f"Document {document.id} ingested with Core status '{core_status}' and stored at "
                f"{document.storage_path}."
            )

        except CoreApiException as e:
            logger.error(f"Core API error while ingesting doc {document.id}: {e!s}")
            document.status = SourceProcessingStatus.FAILED.value
            document.error_message = f"Core ingestion failed: {e!s}"
            _retain_source_file(document, initial_temp_path)
            await _recalculate_source_status(db, source)
            await db.commit()

        except Exception as e:
            logger.exception(f"Unexpected error while ingesting doc {document.id}: {e!s}")
            document.status = SourceProcessingStatus.FAILED.value
            document.error_message = f"Processing error: {e!s}"
            _retain_source_file(document, initial_temp_path)
            await _recalculate_source_status(db, source)
            await db.commit()

        finally:
            # Remove the hot-tier spool copy only after the file has a durable location.
            if (
                initial_temp_path
                and document.storage_path
                and document.storage_path != initial_temp_path
                and os.path.exists(initial_temp_path)
            ):
                try:
                    os.remove(initial_temp_path)
                    logger.info(f"Failsafe deletion: purged volatile local temp file {initial_temp_path}")
                except Exception as del_err:
                    logger.warning(f"Failsafe deletion failed for {initial_temp_path}: {del_err}")


def _retain_source_file(document: Document, initial_temp_path: str | None) -> None:
    """Move a failed upload to durable storage so ingestion can be retried."""
    if not initial_temp_path or not os.path.exists(initial_temp_path):
        return
    try:
        document.storage_path = storage_service.move_to_cold_storage(initial_temp_path)
    except Exception as exc:
        logger.warning(f"Could not retain source file {initial_temp_path} for retry: {exc!s}")
