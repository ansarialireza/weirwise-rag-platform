"""KnowledgeSource, Document, and Processing Job database models."""

import enum
import uuid

from backend.app.db.base import GUID, Base, CompatibleJSON, utc_now
from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship, synonym


class KnowledgeSourceType(str, enum.Enum):
    FILE_UPLOAD = "file_upload"
    WEBSITE_CRAWL = "website_crawl"


class SourceProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"
    DELETING = "deleting"


class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = synonym("user_id")
    # Mapping to Weirwise Core Knowledge Base UUID
    core_kb_id = Column(GUID, nullable=True, index=True)
    name = Column(String(255), nullable=False)
    source_type = Column(String(50), default=KnowledgeSourceType.FILE_UPLOAD.value, nullable=False)
    status = Column(String(50), default=SourceProcessingStatus.PENDING.value, nullable=False)
    target_url = Column(String(1024), nullable=True)  # Populated for website crawls
    error_message = Column(Text, nullable=True)
    settings = Column(CompatibleJSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User")
    documents = relationship("Document", back_populates="knowledge_source", cascade="all, delete-orphan")
    assistant_links = relationship(
        "AssistantKnowledgeSource", back_populates="knowledge_source", cascade="all, delete-orphan"
    )


class Document(Base):
    __tablename__ = "documents"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    project_id = synonym("user_id")
    knowledge_source_id = Column(
        GUID, ForeignKey("knowledge_sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Mapping to Weirwise Core Document UUID once ingested
    core_doc_id = Column(GUID, nullable=True, index=True)
    filename = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    content_hash = Column(String(64), nullable=False)
    storage_path = Column(String(1024), nullable=False)
    status = Column(String(50), default=SourceProcessingStatus.PENDING.value, nullable=False)
    error_message = Column(Text, nullable=True)
    doc_metadata = Column("metadata", CompatibleJSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User")
    knowledge_source = relationship("KnowledgeSource", back_populates="documents")
    processing_jobs = relationship("ProcessingJob", back_populates="document", cascade="all, delete-orphan")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    document_id = Column(GUID, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(50), default=SourceProcessingStatus.PENDING.value, nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    max_attempts = Column(Integer, default=3, nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    document = relationship("Document", back_populates="processing_jobs")


# Legacy compatibility shim for models
class Workspace:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id") or uuid.uuid4()
        self.name = kwargs.get("name", "Legacy WS")
        self.slug = kwargs.get("slug", "legacy-ws")
        for k, v in kwargs.items():
            setattr(self, k, v)


class Project:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id") or uuid.uuid4()
        self.name = kwargs.get("name", "Legacy Project")
        self.workspace_id = kwargs.get("workspace_id") or uuid.uuid4()
        for k, v in kwargs.items():
            setattr(self, k, v)
