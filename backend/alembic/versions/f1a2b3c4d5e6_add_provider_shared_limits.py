"""add account-wide provider limits and per-token concurrency limits"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "d8e9f0a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PROVIDER_LIMIT_COLUMNS = (
    "account_rate_limit_rpm",
    "account_rate_limit_tpm",
    "account_max_concurrency",
)


def _existing_columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return set()
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    provider_columns = _existing_columns("admin_provider_accounts")
    for column in PROVIDER_LIMIT_COLUMNS:
        if column not in provider_columns:
            op.add_column(
                "admin_provider_accounts",
                sa.Column(column, sa.Integer(), nullable=False, server_default="0"),
            )

    credential_columns = _existing_columns("admin_provider_credentials")
    if "max_concurrency" not in credential_columns:
        op.add_column(
            "admin_provider_credentials",
            sa.Column("max_concurrency", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    credential_columns = _existing_columns("admin_provider_credentials")
    if "max_concurrency" in credential_columns:
        op.drop_column("admin_provider_credentials", "max_concurrency")

    provider_columns = _existing_columns("admin_provider_accounts")
    for column in PROVIDER_LIMIT_COLUMNS:
        if column in provider_columns:
            op.drop_column("admin_provider_accounts", column)
