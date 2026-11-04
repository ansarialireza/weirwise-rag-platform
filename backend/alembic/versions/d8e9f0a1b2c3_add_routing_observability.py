"""add routing observability: credential timestamps, ledger provenance, routing events"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op
from backend.app.db.base import GUID

revision: str = "d8e9f0a1b2c3"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CREDENTIAL_TIMESTAMP_COLUMNS = ("last_success_at", "last_failure_at", "last_health_check_at")
LEDGER_COLUMNS = ("cost_source", "routing_id")


def _existing_columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return set()
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    credential_columns = _existing_columns("admin_provider_credentials")
    for column in CREDENTIAL_TIMESTAMP_COLUMNS:
        if column not in credential_columns:
            op.add_column(
                "admin_provider_credentials",
                sa.Column(column, sa.DateTime(timezone=True), nullable=True),
            )

    ledger_columns = _existing_columns("admin_token_cost_ledger")
    if "cost_source" not in ledger_columns:
        op.add_column(
            "admin_token_cost_ledger",
            sa.Column("cost_source", sa.String(length=20), nullable=False, server_default="estimated"),
        )
    if "routing_id" not in ledger_columns:
        op.add_column(
            "admin_token_cost_ledger",
            sa.Column("routing_id", GUID(), nullable=True),
        )
        op.create_index("ix_admin_token_cost_ledger_routing_id", "admin_token_cost_ledger", ["routing_id"])

    if not sa.inspect(op.get_bind()).has_table("admin_routing_events"):
        op.create_table(
            "admin_routing_events",
            sa.Column("id", GUID(), nullable=False),
            sa.Column("routing_id", GUID(), nullable=False),
            sa.Column("workspace_id", GUID(), nullable=True),
            sa.Column("provider_name", sa.String(length=50), nullable=False),
            sa.Column("model_name", sa.String(length=100), nullable=True),
            sa.Column("credential_id", GUID(), nullable=True),
            sa.Column("credential_label", sa.String(length=100), nullable=True),
            sa.Column("key_prefix", sa.String(length=32), nullable=True),
            sa.Column("routing_mode", sa.String(length=16), nullable=False),
            sa.Column("strategy", sa.String(length=50), nullable=False),
            sa.Column("decision_reason", sa.String(length=255), nullable=True),
            sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("is_failover", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("outcome", sa.String(length=20), nullable=False, server_default="selected"),
            sa.Column("error_category", sa.String(length=50), nullable=True),
            sa.Column("error_message", sa.String(length=500), nullable=True),
            sa.Column("retry_after_seconds", sa.Integer(), nullable=True),
            sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_admin_routing_events_routing_id", "admin_routing_events", ["routing_id"])
        op.create_index("ix_admin_routing_events_workspace_id", "admin_routing_events", ["workspace_id"])
        op.create_index("ix_admin_routing_events_provider_name", "admin_routing_events", ["provider_name"])
        op.create_index("ix_admin_routing_events_credential_id", "admin_routing_events", ["credential_id"])
        op.create_index("ix_admin_routing_events_outcome", "admin_routing_events", ["outcome"])
        op.create_index("ix_admin_routing_events_created_at", "admin_routing_events", ["created_at"])
        op.create_index("ix_routing_provider_time", "admin_routing_events", ["provider_name", "created_at"])
        op.create_index("ix_routing_credential_time", "admin_routing_events", ["credential_id", "created_at"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("admin_routing_events"):
        for index in (
            "ix_routing_credential_time",
            "ix_routing_provider_time",
            "ix_admin_routing_events_created_at",
            "ix_admin_routing_events_outcome",
            "ix_admin_routing_events_credential_id",
            "ix_admin_routing_events_provider_name",
            "ix_admin_routing_events_workspace_id",
            "ix_admin_routing_events_routing_id",
        ):
            op.drop_index(index, table_name="admin_routing_events")
        op.drop_table("admin_routing_events")

    ledger_columns = _existing_columns("admin_token_cost_ledger")
    if "routing_id" in ledger_columns:
        op.drop_index("ix_admin_token_cost_ledger_routing_id", table_name="admin_token_cost_ledger")
        op.drop_column("admin_token_cost_ledger", "routing_id")
    if "cost_source" in ledger_columns:
        op.drop_column("admin_token_cost_ledger", "cost_source")

    credential_columns = _existing_columns("admin_provider_credentials")
    for column in CREDENTIAL_TIMESTAMP_COLUMNS:
        if column in credential_columns:
            op.drop_column("admin_provider_credentials", column)
