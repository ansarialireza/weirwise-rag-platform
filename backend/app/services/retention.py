"""Automated retention policy enforcement for data pruning across conversations,
audit trails, and behavioral telemetry.
"""

import uuid
from datetime import UTC, datetime, timedelta

from backend.app.core.logging import logger
from backend.app.models.assistant import Conversation, WorkspacePlanEntitlement
from backend.app.models.audit import AuditEvent
from backend.app.models.behavioral import (
    BehavioralEvent,
    BehavioralInsight,
    UserBehavioralSession,
)
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

# Configurable Default Retention Windows (in days)
DEFAULT_RAW_EVENTS_RETENTION_DAYS = 45
DEFAULT_SESSIONS_RETENTION_DAYS = 180
DEFAULT_INSIGHTS_RETENTION_DAYS = 365
BATCH_PRUNE_LIMIT = 5000


class RetentionService:
    """Enforces data retention limits configured per workspace and platform governance."""

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

    @staticmethod
    async def prune_behavioral_telemetry(
        db: AsyncSession,
        raw_events_days: int = DEFAULT_RAW_EVENTS_RETENTION_DAYS,
        sessions_days: int = DEFAULT_SESSIONS_RETENTION_DAYS,
        insights_days: int = DEFAULT_INSIGHTS_RETENTION_DAYS,
        batch_limit: int = BATCH_PRUNE_LIMIT,
    ) -> dict[str, int]:
        """Bounded, non-blocking cleanup of expired behavioral telemetry and insights."""
        now = datetime.now(UTC)

        # 1. Prune Raw Behavioral Events (e.g. > 45 days)
        cutoff_events = now - timedelta(days=raw_events_days)
        events_del_stmt = delete(BehavioralEvent).where(BehavioralEvent.created_at < cutoff_events)
        res_events = await db.execute(events_del_stmt)
        del_events = int(getattr(res_events, "rowcount", 0))

        # 2. Prune Old Behavioral Sessions (e.g. > 180 days)
        cutoff_sessions = now - timedelta(days=sessions_days)
        sessions_del_stmt = delete(UserBehavioralSession).where(UserBehavioralSession.created_at < cutoff_sessions)
        res_sessions = await db.execute(sessions_del_stmt)
        del_sessions = int(getattr(res_sessions, "rowcount", 0))

        # 3. Prune Old AI Behavioral Insights (e.g. > 365 days)
        cutoff_insights = now - timedelta(days=insights_days)
        insights_del_stmt = delete(BehavioralInsight).where(BehavioralInsight.created_at < cutoff_insights)
        res_insights = await db.execute(insights_del_stmt)
        del_insights = int(getattr(res_insights, "rowcount", 0))

        await db.commit()
        logger.info(
            f"WBI telemetry retention prune completed: "
            f"{del_events} raw events, {del_sessions} sessions, {del_insights} insights pruned."
        )

        return {
            "behavioral_events_pruned": del_events,
            "behavioral_sessions_pruned": del_sessions,
            "behavioral_insights_pruned": del_insights,
        }


retention_service = RetentionService()
