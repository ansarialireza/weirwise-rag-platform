"""System Configuration Model for Platform-Wide & Copilot Settings."""

import uuid

from backend.app.db.base import GUID, Base, CompatibleJSON, utc_now
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    String,
)


class SystemConfig(Base):
    """Singleton system-level configuration managed exclusively by Super Admins."""

    __tablename__ = "system_configs"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    key = Column(String(64), unique=True, nullable=False, index=True)  # e.g. "copilot_settings"
    config = Column(CompatibleJSON, default=dict, nullable=False)
    encrypted_secrets = Column(CompatibleJSON, default=dict, nullable=False)  # Encrypted provider/voice API keys
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
