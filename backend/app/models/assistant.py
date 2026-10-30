"""Assistant, Conversation, Message, and Deployment database models."""

import enum
import uuid

from backend.app.db.base import GUID, Base, CompatibleJSON, utc_now
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship


class AssistantStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class Assistant(Base):
    __tablename__ = "assistants"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    project_id = Column(GUID, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    # Mapping to Weirwise Core Assistant UUID if 1:1 mapped
    core_assistant_id = Column(GUID, nullable=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    system_instructions = Column(Text, nullable=True)
    model = Column(String(100), default="gpt-4o-mini", nullable=False)
    temperature = Column(Float, default=0.2, nullable=False)
    max_tokens = Column(Integer, default=1024, nullable=False)
    score_threshold = Column(Float, default=0.7, nullable=False)
    top_k = Column(Integer, default=4, nullable=False)
    status = Column(String(50), default=AssistantStatus.DRAFT.value, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    published_snapshot = Column(CompatibleJSON, nullable=True)  # Frozen immutable config snapshot on publish
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    project = relationship("Project", back_populates="assistants")
    source_links = relationship("AssistantKnowledgeSource", back_populates="assistant", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="assistant", cascade="all, delete-orphan")
    deployments = relationship("Deployment", back_populates="assistant", cascade="all, delete-orphan")


class AssistantKnowledgeSource(Base):
    __tablename__ = "assistant_knowledge_sources"

    assistant_id = Column(GUID, ForeignKey("assistants.id", ondelete="CASCADE"), primary_key=True)
    knowledge_source_id = Column(GUID, ForeignKey("knowledge_sources.id", ondelete="CASCADE"), primary_key=True)
    priority = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    assistant = relationship("Assistant", back_populates="source_links")
    knowledge_source = relationship("KnowledgeSource", back_populates="assistant_links")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    assistant_id = Column(GUID, ForeignKey("assistants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    session_token = Column(String(128), nullable=True, index=True)  # For widget / anonymous users
    title = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    assistant = relationship("Assistant", back_populates="conversations")
    messages = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    conversation_id = Column(GUID, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), nullable=False)  # "user", "assistant", "system"
    content = Column(Text, nullable=False)
    citations = Column(CompatibleJSON, default=list, nullable=False)
    latency_ms = Column(Integer, nullable=True)
    token_usage = Column(CompatibleJSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    conversation = relationship("Conversation", back_populates="messages")


class DeploymentType(str, enum.Enum):
    WIDGET = "widget"
    PUBLIC_API = "public_api"


class Deployment(Base):
    __tablename__ = "deployments"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    assistant_id = Column(GUID, ForeignKey("assistants.id", ondelete="CASCADE"), nullable=False, index=True)
    deployment_type = Column(String(50), default=DeploymentType.WIDGET.value, nullable=False)
    name = Column(String(255), nullable=False)
    public_key = Column(String(64), unique=True, nullable=False, index=True)  # Safe for embed script
    allowed_domains = Column(CompatibleJSON, default=list, nullable=False)
    theme_config = Column(CompatibleJSON, default=dict, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    assistant = relationship("Assistant", back_populates="deployments")
