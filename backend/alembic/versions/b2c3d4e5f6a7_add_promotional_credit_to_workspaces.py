"""add promotional credit to workspaces and token cost ledger

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-11-01 07:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("workspaces") as batch_op:
        batch_op.add_column(
            sa.Column(
                "promotional_credit_balance",
                sa.Numeric(precision=12, scale=6),
                nullable=False,
                server_default="0.000000",
            )
        )
        batch_op.add_column(
            sa.Column(
                "fiat_spend_balance",
                sa.Numeric(precision=12, scale=6),
                nullable=False,
                server_default="0.000000",
            )
        )

    with op.batch_alter_table("admin_token_cost_ledger") as batch_op:
        batch_op.add_column(
            sa.Column(
                "covered_by_promotional_credit",
                sa.Numeric(precision=12, scale=6),
                nullable=False,
                server_default="0.000000",
            )
        )
        batch_op.add_column(
            sa.Column(
                "covered_by_fiat",
                sa.Numeric(precision=12, scale=6),
                nullable=False,
                server_default="0.000000",
            )
        )


def downgrade() -> None:
    op.drop_column("admin_token_cost_ledger", "covered_by_fiat")
    op.drop_column("admin_token_cost_ledger", "covered_by_promotional_credit")
    op.drop_column("workspaces", "fiat_spend_balance")
    op.drop_column("workspaces", "promotional_credit_balance")
