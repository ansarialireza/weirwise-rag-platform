"""Pydantic schemas for KnowledgeSource and Document management."""

import uuid
from datetime import datetime
from typing import Any

from backend.app.models.project import KnowledgeSourceType, SourceProcessingStatus
from pydantic import BaseModel, ConfigDict, Field


class KnowledgeSourceCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    source_type: KnowledgeSourceType = KnowledgeSourceType.FILE_UPLOAD
    target_url: str | None = None
    settings: dict[str, Any] | None = None


class KnowledgeSourceUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=255)
    settings: dict[str, Any] | None = None


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    knowledge_source_id: uuid.UUID
    core_doc_id: uuid.UUID | None
    filename: str
    mime_type: str
    file_size_bytes: int
    content_hash: str
    status: SourceProcessingStatus
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class KnowledgeSourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    core_kb_id: uuid.UUID | None
    name: str
    source_type: KnowledgeSourceType
    status: SourceProcessingStatus
    target_url: str | None
    error_message: str | None
    settings: dict[str, Any]
    document_count: int | None = 0
    created_at: datetime
    updated_at: datetime


class DocumentUploadBatchResponse(BaseModel):
    source_id: uuid.UUID
    uploaded_documents: list[DocumentResponse]
