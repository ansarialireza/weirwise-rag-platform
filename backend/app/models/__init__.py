"""Unified model registry for SQLAlchemy and Alembic."""

from backend.app.db.base import GUID, Base, CompatibleJSON, utc_now
from backend.app.models.assistant import (
    Assistant,
    AssistantKnowledgeSource,
    AssistantStatus,
    Conversation,
    Deployment,
    DeploymentType,
    Message,
)
from backend.app.models.audit import (
    ApiCredential,
    AuditEvent,
    UsageEvent,
)
from backend.app.models.auth import (
    Membership,
    PasswordResetToken,
    User,
    UserSession,
    Workspace,
    WorkspaceRole,
)
from backend.app.models.project import (
    Document,
    KnowledgeSource,
    KnowledgeSourceType,
    ProcessingJob,
    Project,
    SourceProcessingStatus,
)

__all__ = [
    "GUID",
    "ApiCredential",
    "Assistant",
    "AssistantKnowledgeSource",
    "AssistantStatus",
    "AuditEvent",
    "Base",
    "CompatibleJSON",
    "Conversation",
    "Deployment",
    "DeploymentType",
    "Document",
    "KnowledgeSource",
    "KnowledgeSourceType",
    "Membership",
    "Message",
    "PasswordResetToken",
    "ProcessingJob",
    "Project",
    "SourceProcessingStatus",
    "UsageEvent",
    "User",
    "UserSession",
    "Workspace",
    "WorkspaceRole",
    "utc_now",
]
