"""Background task processor for document indexing and Core synchronization."""

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
    """Asynchronous worker task: Ingest document into Core RAG engine.
    Transitions Document through PENDING -> PROCESSING -> READY / FAILED.
    """
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

            # 2. Read stored file bytes
            file_bytes = storage_service.read_file_bytes(document.storage_path)

            # 3. Post to Core ingestion API
            upload_resp = await core_client.upload_document(
                kb_id=source.core_kb_id,
                filename=document.filename,
                content=file_bytes,
                mime_type=document.mime_type,
            )

            # 4. Save Core document ID (Core returns {"document": {"id": ...}, "job_id": ...})
            doc_data = upload_resp.get("document", upload_resp)
            core_doc_id = uuid.UUID(str(doc_data["id"]))
            document.core_doc_id = core_doc_id

            # In v1.0.0, if Core responds with status completed or pending:
            core_status = doc_data.get("status", "completed")
            if core_status in ("completed", "ready"):
                document.status = SourceProcessingStatus.READY.value
                source.status = SourceProcessingStatus.READY.value
            else:
                document.status = SourceProcessingStatus.READY.value
                source.status = SourceProcessingStatus.READY.value

            document.error_message = None
            await db.commit()
            logger.info(f"Document {document.id} successfully ingested into Core (doc_id={core_doc_id}).")

        except CoreApiException as e:
            logger.error(f"Core API error while ingesting doc {document.id}: {e!s}")
            document.status = SourceProcessingStatus.FAILED.value
            document.error_message = f"Core ingestion failed: {e!s}"
            source.status = SourceProcessingStatus.FAILED.value
            source.error_message = document.error_message
            await db.commit()

        except Exception as e:
            logger.exception(f"Unexpected error while ingesting doc {document.id}: {e!s}")
            document.status = SourceProcessingStatus.FAILED.value
            document.error_message = f"Processing error: {e!s}"
            source.status = SourceProcessingStatus.FAILED.value
            source.error_message = document.error_message
            await db.commit()
