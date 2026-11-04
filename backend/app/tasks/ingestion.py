"""Background task processor for document indexing, Core synchronization, and tiered storage migration."""

import os
import uuid

from backend.app.adapters.core_client import CoreApiClient, CoreApiException
from backend.app.core.logging import logger
from backend.app.db.session import async_session_factory
from backend.app.models.project import (
    Document,
    KnowledgeSource,
    SourceProcessingStatus,
)
from backend.app.services.storage import storage_service
from sqlalchemy import select


async def process_document_ingestion(document_id: uuid.UUID) -> None:
    """Enterprise Tiered Storage & Zero-Blocking Async Ingestion Pipeline:
    - Step 1: Upload was spooled to volatile local /tmp (hot tier) and HTTP 202 returned instantly.
    - Step 2: Background worker reads local temp file, extracts/indexes vectors in local pgvector DB.
    - Step 3: Cold Transfer moves the raw file to /mnt/gdrive vault (the permanent cold tier).
    - Step 4: Failsafe Deletion strictly ensures local temp file is deleted in a finally block.
    """
    initial_temp_path = None
    async with async_session_factory() as db:
        # Load document with knowledge source
        doc_stmt = select(Document).where(Document.id == document_id)
        res = await db.execute(doc_stmt)
        document = res.scalar_one_or_none()

        if not document:
            logger.error(f"Ingestion job failed: document {document_id} not found.")
            return

        ks_stmt = select(KnowledgeSource).where(KnowledgeSource.id == document.knowledge_source_id)
        ks_res = await db.execute(ks_stmt)
        source = ks_res.scalar_one_or_none()

        if not source:
            logger.error(f"Ingestion job failed: KnowledgeSource for doc {document_id} not found.")
            return

        initial_temp_path = document.storage_path

        # Mark document as processing
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

            # 2. Local Compute: Read stored temporary file bytes from fast local SSD hot tier
            file_bytes = storage_service.read_file_bytes(document.storage_path)

            # 3. Post to Core ingestion API (indexes vectors into Core pgvector DB)
            upload_resp = await core_client.upload_document(
                kb_id=source.core_kb_id,
                filename=document.filename,
                content=file_bytes,
                mime_type=document.mime_type,
            )

            # 4. Save Core document ID
            doc_data = upload_resp.get("document", upload_resp)
            core_doc_id = uuid.UUID(str(doc_data["id"]))
            document.core_doc_id = core_doc_id

            # 5. Cold Transfer: Asynchronously move raw document to Cold Tier (/mnt/gdrive vault)
            if os.path.exists(document.storage_path):
                cold_path = storage_service.move_to_cold_storage(document.storage_path)
                document.storage_path = cold_path

            core_status = doc_data.get("status", "completed")
            if core_status in ("completed", "ready"):
                document.status = SourceProcessingStatus.READY.value
                source.status = SourceProcessingStatus.READY.value
            else:
                document.status = SourceProcessingStatus.READY.value
                source.status = SourceProcessingStatus.READY.value

            document.error_message = None
            await db.commit()
            logger.info(
                f"Document {document.id} successfully ingested into Core and moved to "
                f"cold tier vault ({document.storage_path})."
            )

        except CoreApiException as e:
            logger.error(f"Core API error while ingesting doc {document.id}: {e!s}")
            document.status = SourceProcessingStatus.FAILED.value
            document.error_message = f"Core ingestion failed: {e!s}"
            source.status = SourceProcessingStatus.FAILED.value
            source.error_message = document.error_message
            _retain_source_file(document, initial_temp_path)
            await db.commit()

        except Exception as e:
            logger.exception(f"Unexpected error while ingesting doc {document.id}: {e!s}")
            document.status = SourceProcessingStatus.FAILED.value
            document.error_message = f"Processing error: {e!s}"
            source.status = SourceProcessingStatus.FAILED.value
            source.error_message = document.error_message
            _retain_source_file(document, initial_temp_path)
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
