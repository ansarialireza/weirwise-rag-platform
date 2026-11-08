"""Data retention engine executing automatic pruning of expired chat logs."""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from backend.app.models.assistant import Conversation, WorkspacePlanEntitlement
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class RetentionService:
    """Enforces retention policies based on user tier entitlements."""

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

        delete_stmt = (
            delete(Conversation)
            .where(
                Conversation.user_id == user_id,
                Conversation.created_at < cutoff,
            )
        )
        res = await db.execute(delete_stmt)
        pruned_count = res.rowcount
        await db.commit()

        if pruned_count > 0:
            logger.info(f"Pruned {pruned_count} expired conversations for user {user_id} (retention: {retention_days}d)")

        return pruned_count


retention_service = RetentionService()
