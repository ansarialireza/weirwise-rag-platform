"""ApiCredential, AuditEvent, and UsageEvent database models."""

import uuid

from backend.app.db.base import GUID, Base, CompatibleJSON, utc_now
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import relationship


class ApiCredential(Base):
    __tablename__ = "api_credentials"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    key_prefix = Column(String(32), nullable=False)  # e.g., "wwp_live_"
    key_hash = Column(String(64), unique=True, nullable=False, index=True)
    scopes = Column(CompatibleJSON, default=lambda: ["assistants:read", "assistants:chat"], nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("User")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(50), nullable=False)  # "user", "source", "assistant", "billing"
    resource_id = Column(GUID, nullable=True, index=True)
    details = Column(CompatibleJSON, default=dict, nullable=False)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("User")


class UsageEvent(Base):
    __tablename__ = "usage_events"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    assistant_id = Column(GUID, nullable=True, index=True)
    event_type = Column(String(100), nullable=False)  # "chat_turn", "document_indexed"
    quantity = Column(Integer, default=1, nullable=False)
    metadata_info = Column("metadata", CompatibleJSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("User")

    __table_args__ = (
        Index("ix_usage_user_event", "user_id", "event_type"),
    )
