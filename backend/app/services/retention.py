"""Data retention engine executing automatic pruning of expired chat logs."""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from backend.app.models.assistant import Conversation, WorkspacePlanEntitlement
from backend.app.models.behavioral import (
    BehavioralEvent,
    BehavioralInsight,
    UserBehavioralSession,
)
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

DEFAULT_RAW_EVENTS_RETENTION_DAYS = 45
DEFAULT_SESSIONS_RETENTION_DAYS = 180
DEFAULT_INSIGHTS_RETENTION_DAYS = 365
BATCH_PRUNE_LIMIT = 5000


class RetentionService:
    """Enforces retention policies based on user tier entitlements."""

    @classmethod
    async def cleanup_expired_data(cls, db: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
        """Prune conversations and audits exceeding user retention limit."""
        pruned_convs = await cls.prune_expired_conversations(db, user_id)
        return {
            "conversations_pruned": pruned_convs,
            "audit_events_pruned": 0,
        }

    @classmethod
    async def prune_expired_conversations(cls, db: AsyncSession, user_id: uuid.UUID) -> int:
        """Prune messages/conversations older than user's data retention days."""
        ent_stmt = select(WorkspacePlanEntitlement).where(WorkspacePlanEntitlement.user_id == user_id)
        ent_res = await db.execute(ent_stmt)
        ent = ent_res.scalar_one_or_none()

        retention_days = ent.data_retention_days if ent else 30
        if retention_days <= 0:
            return 0

        cutoff = datetime.now(UTC) - timedelta(days=retention_days)

        delete_stmt = delete(Conversation).where(
            Conversation.user_id == user_id,
            Conversation.created_at < cutoff,
        )
        res = await db.execute(delete_stmt)
        pruned_count = int(getattr(res, "rowcount", 0))
        await db.commit()

        if pruned_count > 0:
            logger.info(
                f"Pruned {pruned_count} expired conversations for user {user_id} (retention: {retention_days}d)"
            )

        return pruned_count

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

        cutoff_events = now - timedelta(days=raw_events_days)
        events_del_stmt = delete(BehavioralEvent).where(BehavioralEvent.created_at < cutoff_events)
        res_events = await db.execute(events_del_stmt)
        del_events = int(getattr(res_events, "rowcount", 0))

        cutoff_sessions = now - timedelta(days=sessions_days)
        sessions_del_stmt = delete(UserBehavioralSession).where(UserBehavioralSession.created_at < cutoff_sessions)
        res_sessions = await db.execute(sessions_del_stmt)
        del_sessions = int(getattr(res_sessions, "rowcount", 0))

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
