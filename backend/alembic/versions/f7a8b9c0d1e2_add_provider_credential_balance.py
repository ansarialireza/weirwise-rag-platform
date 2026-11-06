"""add remaining balance to provider credentials"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_cols = [c["name"] for c in inspector.get_columns("admin_provider_credentials")]
    if "remaining_balance" not in existing_cols:
        op.add_column(
            "admin_provider_credentials",
            sa.Column("remaining_balance", sa.String(length=100), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_cols = [c["name"] for c in inspector.get_columns("admin_provider_credentials")]
    if "remaining_balance" in existing_cols:
        op.drop_column("admin_provider_credentials", "remaining_balance")
