"""Migrate billing and core models to user account ownership and decouple workspace.

Revision ID: d1e2f3a4b5c6
Revises: b3a4c5d6e7f8
Create Date: 2026-11-08 10:50:00.000000

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "b3a4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add user_id to billing_subscriptions
    op.add_column("billing_subscriptions", sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True))
    op.create_index("ix_billing_subscriptions_user_id", "billing_subscriptions", ["user_id"])
    op.alter_column("billing_subscriptions", "workspace_id", nullable=True)

    # 2. Add user_id to billing_invoices
    op.add_column("billing_invoices", sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True))
    op.create_index("ix_billing_invoices_user_id", "billing_invoices", ["user_id"])
    op.alter_column("billing_invoices", "workspace_id", nullable=True)

    # 3. Add user_id to workspace_plan_entitlements
    op.add_column("workspace_plan_entitlements", sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True))
    op.create_index("ix_workspace_plan_entitlements_user_id", "workspace_plan_entitlements", ["user_id"])
    op.alter_column("workspace_plan_entitlements", "workspace_id", nullable=True)

    # 4. Add user_id to usage_events
    op.add_column("usage_events", sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_usage_events_user_id", "usage_events", ["user_id"])
    op.alter_column("usage_events", "workspace_id", nullable=True)

    # 5. Drop NOT NULL on billing_orders workspace_id
    op.alter_column("billing_orders", "workspace_id", nullable=True)

    # 6. Drop NOT NULL on webhook_subscriptions and business_integrations
    op.add_column("webhook_subscriptions", sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True))
    op.alter_column("webhook_subscriptions", "workspace_id", nullable=True)

    op.add_column("business_integrations", sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True))
    op.alter_column("business_integrations", "workspace_id", nullable=True)


def downgrade() -> None:
    pass
