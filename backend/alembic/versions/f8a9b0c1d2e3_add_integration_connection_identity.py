"""Add user-owned integration connection identities.

Revision ID: f8a9b0c1d2e3
Revises: bf644be45567
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy import text

from alembic import op

revision: str = "f8a9b0c1d2e3"
down_revision: Union[str, None] = "bf644be45567"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("business_integrations") as batch_op:
        batch_op.add_column(
            sa.Column("connection_key", sa.String(length=255), server_default="default", nullable=False)
        )
        batch_op.drop_constraint("uq_user_integration_provider", type_="unique")
        batch_op.create_unique_constraint(
            "uq_user_integration_connection",
            ["user_id", "provider", "connection_key"],
        )


def downgrade() -> None:
    connection = op.get_bind()
    duplicate = connection.execute(
        text(
            "SELECT user_id, provider FROM business_integrations GROUP BY user_id, provider HAVING COUNT(*) > 1 LIMIT 1"
        )
    ).first()
    if duplicate:
        raise RuntimeError("Cannot restore one-connection-per-provider uniqueness while multiple connections exist.")

    with op.batch_alter_table("business_integrations") as batch_op:
        batch_op.drop_constraint("uq_user_integration_connection", type_="unique")
        batch_op.drop_column("connection_key")
        batch_op.create_unique_constraint(
            "uq_user_integration_provider",
            ["user_id", "provider"],
        )
