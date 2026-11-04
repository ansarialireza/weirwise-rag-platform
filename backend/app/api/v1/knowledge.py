"""Website Crawler, Sitemap Discovery, Page Selection, and Automatic Knowledge Ingestion."""

import os
import uuid

from backend.app.adapters.core_client import CoreApiClient, CoreApiException
from backend.app.api.dependencies import get_current_user
from backend.app.db.session import get_db_session
from backend.app.models.assistant import AssistantKnowledgeSource
from backend.app.models.auth import Membership, User, Workspace, WorkspaceRole
from backend.app.models.project import (
    Document,
    KnowledgeSource,
    KnowledgeSourceType,
    Project,
    SourceProcessingStatus,
)
from backend.app.schemas.knowledge import (
    DocumentResponse,
    DocumentUploadBatchResponse,
    KnowledgeSourceCreateRequest,
    KnowledgeSourceResponse,
)
from backend.app.services.scraper import crawler_engine, is_ssrf_safe_url
from backend.app.services.storage import storage_service
from backend.app.services.subscription import subscription_service
from backend.app.services.webhooks import webhook_dispatcher
from backend.app.tasks.ingestion import process_document_ingestion
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["Knowledge Sources, Crawler & Ingestion"])


class CrawlDiscoveryRequest(BaseModel):
    url: str = Field(..., min_length=4, max_length=1024)
    max_pages: int = Field(25, ge=1, le=100)


class DiscoveredPageItem(BaseModel):
    url: str
    title: str
    word_count: int


class CrawlDiscoveryResponse(BaseModel):
    root_url: str
    total_discovered: int
    sitemaps_found: list[str]
    pages: list[DiscoveredPageItem]


class IngestDiscoveredPagesRequest(BaseModel):
    source_name: str = Field(..., min_length=2, max_length=255)
    selected_pages: list[DiscoveredPageItem]


async def verify_project_membership(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
    min_roles: list[WorkspaceRole] = [WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER],
) -> Project:
    stmt = (
        select(Project, Membership.role)
        .join(Membership, Membership.workspace_id == Project.workspace_id)
        .where(Project.id == project_id, Membership.user_id == user_id)
    )
    res = await db.execute(stmt)
    record = res.first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found or access denied.")
    proj, role_str = record
    if WorkspaceRole(role_str) not in min_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient workspace permissions for this project.",
        )
    return proj


# --- Sitemap & Web Crawler Discovery Endpoints ---


@router.post("/projects/{project_id}/crawler/discover", response_model=CrawlDiscoveryResponse)
async def discover_website_pages(
    project_id: uuid.UUID,
    payload: CrawlDiscoveryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> CrawlDiscoveryResponse:
    """Discover website pages via sitemaps and safe crawling before ingestion."""
    await verify_project_membership(project_id, current_user.id, db)

    if not is_ssrf_safe_url(payload.url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The target URL is invalid, unsafe, or resolves to a private network address.",
        )

    crawl_result = await crawler_engine.crawl_site(payload.url, limit=payload.max_pages)

    pages = [DiscoveredPageItem(url=p.url, title=p.title, word_count=p.word_count) for p in crawl_result.pages]

    return CrawlDiscoveryResponse(
        root_url=crawl_result.root_url,
        total_discovered=len(pages),
        sitemaps_found=crawl_result.sitemaps_found,
        pages=pages,
    )


@router.post(
    "/projects/{project_id}/crawler/ingest",
    response_model=KnowledgeSourceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def ingest_selected_pages(
    project_id: uuid.UUID,
    payload: IngestDiscoveredPagesRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> KnowledgeSourceResponse:
    """Automatically ingest selected website pages into a dedicated KnowledgeSource."""
    project = await verify_project_membership(project_id, current_user.id, db)

    source = KnowledgeSource(
        project_id=project_id,
        name=payload.source_name,
        source_type=KnowledgeSourceType.WEBSITE_CRAWL.value,
        settings={"pages_count": len(payload.selected_pages)},
    )
    db.add(source)
    await db.flush()

    # Re-crawl or fetch selected page content safely and store as synthetic markdown documents
    for page in payload.selected_pages:
        if not is_ssrf_safe_url(page.url):
            continue

        # Single page safe fetch
        from backend.app.services.scraper import fetch_webpage_content

        try:
            content = await fetch_webpage_content(page.url)
        except Exception:
            continue

        filename = f"{uuid.uuid4().hex[:8]}_{page.title[:30].replace(' ', '_')}.md"
        storage_path = os.path.join(storage_service.base_dir, filename)
        with open(storage_path, "w", encoding="utf-8") as f:
            f.write(f"# {page.title}\nSource: {page.url}\n\n{content}")

        doc = Document(
            knowledge_source_id=source.id,
            filename=filename,
            mime_type="text/markdown",
            file_size_bytes=len(content.encode("utf-8")),
            content_hash=uuid.uuid4().hex,
            storage_path=storage_path,
            status=SourceProcessingStatus.PENDING.value,
            doc_metadata={"source_url": page.url, "title": page.title},
        )
        db.add(doc)
        await db.flush()
        background_tasks.add_task(process_document_ingestion, doc.id)

    # Webhook dispatch: knowledge.sync.completed
    await webhook_dispatcher.dispatch_event(
        db=db,
        workspace_id=project.workspace_id,
        event_type="knowledge.sync.completed",
        payload_data={"source_id": str(source.id), "name": source.name, "pages_synced": len(payload.selected_pages)},
    )

    await db.commit()
    await db.refresh(source)
    return KnowledgeSourceResponse.model_validate(source)


# --- Standard Knowledge Source Management ---


@router.post(
    "/projects/{project_id}/sources",
    response_model=KnowledgeSourceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_knowledge_source(
    project_id: uuid.UUID,
    payload: KnowledgeSourceCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> KnowledgeSourceResponse:
    """Create a new KnowledgeSource (File Collection or Website Crawl)."""
    await verify_project_membership(project_id, current_user.id, db)

    source = KnowledgeSource(
        project_id=project_id,
        name=payload.name,
        source_type=payload.source_type.value,
        target_url=payload.target_url,
        settings=payload.settings or {},
    )
    db.add(source)
    await db.flush()

    # If single Website Crawl target_url provided
    if payload.source_type == KnowledgeSourceType.WEBSITE_CRAWL and payload.target_url:
        from backend.app.services.scraper import fetch_webpage_content

        page_text = await fetch_webpage_content(payload.target_url)
        filename = f"crawl_{uuid.uuid4().hex[:8]}.md"
        storage_path = os.path.join(storage_service.base_dir, filename)
        with open(storage_path, "w", encoding="utf-8") as f:
            f.write(page_text)

        doc = Document(
            knowledge_source_id=source.id,
            filename=filename,
            mime_type="text/markdown",
            file_size_bytes=len(page_text.encode("utf-8")),
            content_hash=uuid.uuid4().hex,
            storage_path=storage_path,
            status=SourceProcessingStatus.PENDING.value,
            doc_metadata={"source_url": payload.target_url},
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        background_tasks.add_task(process_document_ingestion, doc.id)

    await db.commit()
    await db.refresh(source)
    return KnowledgeSourceResponse.model_validate(source)


@router.get("/projects/{project_id}/sources", response_model=list[KnowledgeSourceResponse])
async def list_knowledge_sources(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[KnowledgeSourceResponse]:
    """List all knowledge sources in a project."""
    await verify_project_membership(
        project_id,
        current_user.id,
        db,
        min_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.VIEWER],
    )

    stmt = (
        select(KnowledgeSource, func.count(Document.id).label("doc_count"))
        .outerjoin(Document, Document.knowledge_source_id == KnowledgeSource.id)
        .where(KnowledgeSource.project_id == project_id)
        .group_by(KnowledgeSource.id)
        .order_by(KnowledgeSource.created_at.desc())
    )
    res = await db.execute(stmt)
    results = []
    for ks, count in res.all():
        resp = KnowledgeSourceResponse.model_validate(ks)
        resp.document_count = count
        results.append(resp)
    return results


@router.post(
    "/sources/{source_id}/documents/upload",
    response_model=DocumentUploadBatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_documents(
    source_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> DocumentUploadBatchResponse:
    """Upload documents to a KnowledgeSource and schedule asynchronous Core vector indexing."""
    ks_res = await db.execute(select(KnowledgeSource).where(KnowledgeSource.id == source_id))
    source = ks_res.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KnowledgeSource not found.")

    project = await verify_project_membership(source.project_id, current_user.id, db)

    # Entitlement check
    ws_res = await db.execute(select(Workspace).where(Workspace.id == project.workspace_id))
    workspace = ws_res.scalar_one_or_none()
    if workspace:
        doc_count_stmt = (
            select(func.count(Document.id))
            .join(KnowledgeSource, KnowledgeSource.id == Document.knowledge_source_id)
            .join(Project, Project.id == KnowledgeSource.project_id)
            .where(Project.workspace_id == workspace.id)
        )
        current_docs = (await db.execute(doc_count_stmt)).scalar() or 0
        await subscription_service.check_document_upload_entitlement(
            workspace, current_docs, additional_docs=len(files), db=db
        )

    uploaded_records: list[Document] = []

    for file in files:
        safe_name, path, size, chash = await storage_service.save_upload(file)

        if workspace:
            subscription_service.check_file_size_entitlement(workspace, size)
            await subscription_service.check_storage_entitlement(workspace, size, db)

        doc = Document(
            knowledge_source_id=source.id,
            filename=safe_name,
            mime_type=file.content_type or "application/octet-stream",
            file_size_bytes=size,
            content_hash=chash,
            storage_path=path,
            status=SourceProcessingStatus.PENDING.value,
        )
        db.add(doc)
        uploaded_records.append(doc)

    await db.commit()

    for doc in uploaded_records:
        await db.refresh(doc)
        background_tasks.add_task(process_document_ingestion, doc.id)

    return DocumentUploadBatchResponse(
        source_id=source.id,
        uploaded_documents=[DocumentResponse.model_validate(d) for d in uploaded_records],
    )


@router.get("/sources/{source_id}/documents", response_model=list[DocumentResponse])
async def list_source_documents(
    source_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[DocumentResponse]:
    """List documents and processing states under a KnowledgeSource."""
    ks_res = await db.execute(select(KnowledgeSource).where(KnowledgeSource.id == source_id))
    source = ks_res.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KnowledgeSource not found.")

    await verify_project_membership(
        source.project_id,
        current_user.id,
        db,
        min_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.VIEWER],
    )

    stmt = select(Document).where(Document.knowledge_source_id == source_id).order_by(Document.created_at.desc())
    res = await db.execute(stmt)
    return [DocumentResponse.model_validate(d) for d in res.scalars().all()]


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a document and trigger vector chunk purge."""
    doc_res = await db.execute(select(Document).where(Document.id == document_id))
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    ks_res = await db.execute(select(KnowledgeSource).where(KnowledgeSource.id == doc.knowledge_source_id))
    source = ks_res.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KnowledgeSource not found.")

    await verify_project_membership(
        source.project_id,
        current_user.id,
        db,
        min_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER],
    )

    # Purge vectors in Core before removing the only pointer to them.
    if doc.core_doc_id:
        try:
            await CoreApiClient().delete_document(doc.core_doc_id)
        except CoreApiException as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not remove the document from the search index: {e!s}",
            ) from e

    # Delete physical file from storage (both hot or cold vault)
    storage_service.delete_file(doc.storage_path)

    await db.delete(doc)
    await db.commit()


@router.post("/documents/{document_id}/retry", response_model=DocumentResponse)
async def retry_document_ingestion(
    document_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> DocumentResponse:
    """Re-run ingestion for a document that previously failed processing."""
    doc_res = await db.execute(select(Document).where(Document.id == document_id))
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    ks_res = await db.execute(select(KnowledgeSource).where(KnowledgeSource.id == doc.knowledge_source_id))
    source = ks_res.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KnowledgeSource not found.")

    await verify_project_membership(
        source.project_id,
        current_user.id,
        db,
        min_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER],
    )

    if doc.status != SourceProcessingStatus.FAILED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only documents that failed processing can be retried.",
        )

    doc.status = SourceProcessingStatus.PENDING.value
    doc.error_message = None
    source.status = SourceProcessingStatus.PENDING.value
    source.error_message = None
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(process_document_ingestion, doc.id)
    return DocumentResponse.model_validate(doc)


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge_source(
    source_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a knowledge source, its documents, physical files, and Core vectors."""
    ks_res = await db.execute(select(KnowledgeSource).where(KnowledgeSource.id == source_id))
    source = ks_res.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KnowledgeSource not found.")

    await verify_project_membership(
        source.project_id,
        current_user.id,
        db,
        min_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER],
    )

    if source.core_kb_id:
        try:
            await CoreApiClient().delete_knowledge_base(source.core_kb_id)
        except CoreApiException as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not remove the knowledge base from the search index: {e!s}",
            ) from e

    docs_res = await db.execute(select(Document).where(Document.knowledge_source_id == source.id))
    for doc in docs_res.scalars().all():
        storage_service.delete_file(doc.storage_path)

    await db.execute(delete(Document).where(Document.knowledge_source_id == source.id))
    await db.execute(delete(AssistantKnowledgeSource).where(AssistantKnowledgeSource.knowledge_source_id == source.id))
    await db.delete(source)
    await db.commit()


@router.get("/documents/{document_id}/download")
async def download_document_stream(
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> StreamingResponse:
    """Streamed Network Retrieval:
    Stream document from cold tier (15TB Google Drive mount) using chunked async streaming.
    Never loads massive files entirely into RAM.
    """
    doc_res = await db.execute(select(Document).where(Document.id == document_id))
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    ks_res = await db.execute(select(KnowledgeSource).where(KnowledgeSource.id == doc.knowledge_source_id))
    source = ks_res.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KnowledgeSource not found.")

    await verify_project_membership(
        source.project_id,
        current_user.id,
        db,
        min_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.VIEWER],
    )

    try:
        stream_gen = storage_service.stream_file_chunks(doc.storage_path)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Physical document file not found in storage.",
        )

    headers = {
        "Content-Disposition": f'attachment; filename="{doc.filename}"',
        "Content-Length": str(doc.file_size_bytes) if doc.file_size_bytes else "",
    }
    return StreamingResponse(
        stream_gen,
        media_type=doc.mime_type or "application/octet-stream",
        headers=headers,
    )
