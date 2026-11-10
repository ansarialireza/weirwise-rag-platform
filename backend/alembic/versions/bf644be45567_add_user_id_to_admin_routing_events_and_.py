"""add_user_id_to_admin_routing_events_and_ledger

Revision ID: bf644be45567
Revises: ebe95bc87fd0
Create Date: 2026-11-08 19:10:24.419954

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "bf644be45567"
down_revision: Union[str, None] = "ebe95bc87fd0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add user_id column to admin_routing_events
    op.add_column(
        "admin_routing_events",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_admin_routing_events_user_id", "admin_routing_events", ["user_id"])

    # Add user_id column to admin_token_cost_ledger
    op.add_column(
        "admin_token_cost_ledger",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_admin_token_cost_ledger_user_id", "admin_token_cost_ledger", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_admin_token_cost_ledger_user_id", table_name="admin_token_cost_ledger")
    op.drop_column("admin_token_cost_ledger", "user_id")
    op.drop_index("ix_admin_routing_events_user_id", table_name="admin_routing_events")
    op.drop_column("admin_routing_events", "user_id")
