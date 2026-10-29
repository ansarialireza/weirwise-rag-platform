"""KnowledgeSource and Document management endpoints."""

import os
import uuid

from backend.app.api.dependencies import get_current_user
from backend.app.db.session import get_db_session
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
from backend.app.services.scraper import fetch_webpage_content
from backend.app.services.storage import storage_service
from backend.app.services.subscription import subscription_service
from backend.app.tasks.ingestion import process_document_ingestion
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["Knowledge Sources & Ingestion"])


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

    # If Website Crawl, extract content immediately and save as synthetic markdown document
    if payload.source_type == KnowledgeSourceType.WEBSITE_CRAWL and payload.target_url:
        page_text = await fetch_webpage_content(payload.target_url)
        # Store as markdown file in storage
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
    await verify_project_membership(project_id, current_user.id, db, min_roles=[
        WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.VIEWER
    ])

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

    # Entitlement check: verify document count limit under current workspace plan
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
            workspace, current_docs, additional_docs=len(files)
        )

    uploaded_records: list[Document] = []

    for file in files:
        safe_name, path, size, chash = await storage_service.save_upload(file)

        # Enforce plan file size limit
        if workspace:
            subscription_service.check_file_size_entitlement(workspace, size)

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

    # Enqueue background ingestion tasks
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

    await verify_project_membership(source.project_id, current_user.id, db, min_roles=[
        WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.VIEWER
    ])

    stmt = select(Document).where(Document.knowledge_source_id == source_id).order_by(Document.created_at.desc())
    res = await db.execute(stmt)
    return [DocumentResponse.model_validate(d) for d in res.scalars().all()]
