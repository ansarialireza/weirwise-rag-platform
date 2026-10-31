"""Automated retention policy enforcement for data pruning across conversations and audit trails."""

import uuid
from datetime import UTC, datetime, timedelta

from backend.app.core.logging import logger
from backend.app.models.assistant import Conversation, WorkspacePlanEntitlement
from backend.app.models.audit import AuditEvent
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession


class RetentionService:
    """Enforces data retention limits configured per workspace plan tier."""

    @staticmethod
    async def cleanup_expired_data(db: AsyncSession, workspace_id: uuid.UUID) -> dict[str, int]:
        """Prune conversations and events exceeding workspace retention limit."""
        ent_stmt = select(WorkspacePlanEntitlement).where(WorkspacePlanEntitlement.workspace_id == workspace_id)
        ent_res = await db.execute(ent_stmt)
        ent = ent_res.scalar_one_or_none()

        retention_days = ent.data_retention_days if ent else 30
        cutoff = datetime.now(UTC) - timedelta(days=retention_days)

        # 1. Prune expired conversations for this workspace's assistants
        from backend.app.models.assistant import Assistant
        from backend.app.models.project import Project

        conv_del_stmt = delete(Conversation).where(
            Conversation.assistant_id.in_(
                select(Assistant.id)
                .join(Project, Project.id == Assistant.project_id)
                .where(Project.workspace_id == workspace_id)
            ),
            Conversation.created_at < cutoff,
        )
        res_convs = await db.execute(conv_del_stmt)
        del_convs = int(getattr(res_convs, "rowcount", 0))

        # 2. Prune old audit events
        audit_del_stmt = delete(AuditEvent).where(
            AuditEvent.workspace_id == workspace_id,
            AuditEvent.created_at < cutoff,
        )
        res_audits = await db.execute(audit_del_stmt)
        del_audits = int(getattr(res_audits, "rowcount", 0))

        await db.commit()
        logger.info(
            f"Retention cleanup for workspace {workspace_id} (retention: {retention_days}d): "
            f"pruned {del_convs} conversations, {del_audits} audit logs."
        )

        return {
            "conversations_pruned": del_convs or 0,
            "audit_events_pruned": del_audits or 0,
        }


retention_service = RetentionService()
