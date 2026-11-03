"""Website Crawler, Sitemap Discovery, Page Selection, and Automatic Knowledge Ingestion."""

import os
import uuid

from backend.app.api.dependencies import get_current_user
from backend.app.db.session import get_db_session
from backend.app.models.auth import User
from backend.app.models.project import (
    Document,
    KnowledgeSource,
    KnowledgeSourceType,
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
from backend.app.tasks.ingestion import process_document_ingestion
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
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


@router.post("/crawler/discover", response_model=CrawlDiscoveryResponse)
async def discover_website_pages(
    payload: CrawlDiscoveryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> CrawlDiscoveryResponse:
    """Discover crawlable HTML pages and sitemaps from target URL."""
    if not is_ssrf_safe_url(payload.url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Forbidden URL target. Localhost and private cloud IP addresses are blocked.",
        )

    discovered = await crawler_engine.discover_sitemap_and_links(payload.url, max_pages=payload.max_pages)

    return CrawlDiscoveryResponse(
        root_url=payload.url,
        total_discovered=len(discovered["pages"]),
        sitemaps_found=discovered["sitemaps"],
        pages=[
            DiscoveredPageItem(
                url=p["url"],
                title=p["title"],
                word_count=p["word_count"],
            )
            for p in discovered["pages"]
        ],
    )


@router.post(
    "/crawler/ingest",
    response_model=KnowledgeSourceResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def ingest_crawled_pages(
    payload: IngestDiscoveredPagesRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> KnowledgeSourceResponse:
    """Ingest selected discovered web pages into a KnowledgeSource."""
    source = KnowledgeSource(
        user_id=current_user.id,
        name=payload.source_name,
        source_type=KnowledgeSourceType.WEBSITE_CRAWL.value,
        status=SourceProcessingStatus.PROCESSING.value,
    )
    db.add(source)
    await db.flush()

    upload_dir = os.path.join("/tmp", "weirwise_crawls", str(source.id))
    os.makedirs(upload_dir, exist_ok=True)

    for p in payload.selected_pages:
        html_clean = await crawler_engine.fetch_page_content(p.url)
        if not html_clean:
            continue

        filename = f"{uuid.uuid4().hex[:8]}_{p.title[:30].strip().replace(' ', '_')}.txt"
        file_path = os.path.join(upload_dir, filename)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(f"Source URL: {p.url}\nTitle: {p.title}\n\n{html_clean}")

        file_size = os.path.getsize(file_path)

        doc = Document(
            knowledge_source_id=source.id,
            filename=filename,
            mime_type="text/plain",
            file_size_bytes=file_size,
            content_hash=uuid.uuid4().hex,
            storage_path=file_path,
            status=SourceProcessingStatus.PENDING.value,
            doc_metadata={"source_url": p.url, "title": p.title},
        )
        db.add(doc)
        await db.flush()

        background_tasks.add_task(process_document_ingestion, str(doc.id))

    await db.commit()
    await db.refresh(source)
    return KnowledgeSourceResponse.model_validate(source)


@router.post(
    "/sources",
    response_model=KnowledgeSourceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_knowledge_source(
    payload: KnowledgeSourceCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> KnowledgeSourceResponse:
    """Create a new Knowledge Base Source."""
    source = KnowledgeSource(
        user_id=current_user.id,
        name=payload.name,
        source_type=payload.source_type.value,
        target_url=payload.target_url,
        settings=payload.settings,
        status=SourceProcessingStatus.READY.value,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)

    return KnowledgeSourceResponse.model_validate(source)


@router.get("/sources", response_model=list[KnowledgeSourceResponse])
async def list_knowledge_sources(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[KnowledgeSourceResponse]:
    """List all Knowledge Sources for the authenticated user."""
    stmt = (
        select(KnowledgeSource)
        .where(KnowledgeSource.user_id == current_user.id)
        .order_by(KnowledgeSource.created_at.desc())
    )
    res = await db.execute(stmt)
    sources = res.scalars().all()

    responses = []
    for s in sources:
        doc_count_res = await db.execute(select(func.count(Document.id)).where(Document.knowledge_source_id == s.id))
        doc_count = doc_count_res.scalar() or 0
        resp_item = KnowledgeSourceResponse.model_validate(s)
        resp_item.document_count = doc_count
        responses.append(resp_item)

    return responses


@router.post(
    "/sources/{source_id}/documents",
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
    """Upload documents into a Knowledge Source for asynchronous chunking and vector embedding."""
    s_res = await db.execute(select(KnowledgeSource).where(KnowledgeSource.id == source_id))
    source = s_res.scalar_one_or_none()

    if not source or source.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge Source not found or access denied.",
        )

    uploaded_docs: list[DocumentResponse] = []

    for file in files:
        safe_name, path, size, chash = await storage_service.save_upload(file)

        doc = Document(
            knowledge_source_id=source.id,
            filename=file.filename or safe_name,
            mime_type=file.content_type or "application/octet-stream",
            file_size_bytes=size,
            content_hash=chash,
            storage_path=path,
            status=SourceProcessingStatus.PENDING.value,
        )
        db.add(doc)
        await db.flush()

        background_tasks.add_task(process_document_ingestion, str(doc.id))
        uploaded_docs.append(DocumentResponse.model_validate(doc))

    source.status = SourceProcessingStatus.READY.value
    await db.commit()

    return DocumentUploadBatchResponse(
        source_id=source.id,
        uploaded_count=len(uploaded_docs),
        documents=uploaded_docs,
    )


@router.get("/sources/{source_id}/documents", response_model=list[DocumentResponse])
async def list_source_documents(
    source_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[DocumentResponse]:
    """List all documents within a knowledge source."""
    s_res = await db.execute(select(KnowledgeSource).where(KnowledgeSource.id == source_id))
    source = s_res.scalar_one_or_none()

    if not source or source.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge Source not found or access denied.",
        )

    stmt = select(Document).where(Document.knowledge_source_id == source_id).order_by(Document.created_at.desc())
    res = await db.execute(stmt)
    docs = res.scalars().all()
    return [DocumentResponse.model_validate(d) for d in docs]


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a document and trigger cascade removal from vector stores."""
    d_res = await db.execute(select(Document).where(Document.id == document_id))
    doc = d_res.scalar_one_or_none()

    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    s_res = await db.execute(select(KnowledgeSource).where(KnowledgeSource.id == doc.knowledge_source_id))
    source = s_res.scalar_one()

    if source.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    await db.delete(doc)
    await db.commit()
