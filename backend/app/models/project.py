"""Project, KnowledgeSource, Document, and Processing Job database models."""

import enum
import uuid

from backend.app.db.base import GUID, Base, CompatibleJSON, utc_now
from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship


class KnowledgeSourceType(str, enum.Enum):
    FILE_UPLOAD = "file_upload"
    WEBSITE_CRAWL = "website_crawl"


class SourceProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"
    DELETING = "deleting"


class Project(Base):
    __tablename__ = "projects"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    workspace_id = Column(GUID, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    workspace = relationship("Workspace", back_populates="projects")
    knowledge_sources = relationship("KnowledgeSource", back_populates="project", cascade="all, delete-orphan")
    assistants = relationship("Assistant", back_populates="project", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("workspace_id", "slug", name="uq_workspace_project_slug"),)


class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    project_id = Column(GUID, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
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

    project = relationship("Project", back_populates="knowledge_sources")
    documents = relationship("Document", back_populates="knowledge_source", cascade="all, delete-orphan")
    assistant_links = relationship(
        "AssistantKnowledgeSource", back_populates="knowledge_source", cascade="all, delete-orphan"
    )


class Document(Base):
    __tablename__ = "documents"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
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
