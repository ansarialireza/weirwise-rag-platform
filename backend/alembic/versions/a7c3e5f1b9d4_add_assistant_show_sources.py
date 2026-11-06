"""add the per-assistant source display preference"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "a7c3e5f1b9d4"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return set()
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    if "show_sources" not in _existing_columns("assistants"):
        op.add_column(
            "assistants",
            sa.Column("show_sources", sa.Boolean(), nullable=False, server_default=sa.true()),
        )


def downgrade() -> None:
    if "show_sources" in _existing_columns("assistants"):
        op.drop_column("assistants", "show_sources")
