"""subscription tiers, workspace tier fk, and ai routing strategies

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-11-01 10:00:00.000000

"""

import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create subscription_tiers table
    op.create_table(
        "subscription_tiers",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("name", sa.String(length=100), unique=True, nullable=False, index=True),
        sa.Column("monthly_price", sa.Numeric(precision=10, scale=2), nullable=False, server_default="0.00"),
        sa.Column("max_assistants", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("max_monthly_messages", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("max_storage_mb", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 2. Create ai_routing_strategies table
    op.create_table(
        "ai_routing_strategies",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("ui_name", sa.String(length=50), unique=True, nullable=False, index=True),
        sa.Column("ui_description", sa.String(length=255), nullable=False),
        sa.Column("target_llm_model", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 3. Seed initial default subscription tiers
    free_tier_id = uuid.uuid4()
    pro_tier_id = uuid.uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()

    op.execute(
        sa.text(
            "INSERT INTO subscription_tiers "
            "(id, name, monthly_price, max_assistants, max_monthly_messages, max_storage_mb, created_at, updated_at) "
            f"VALUES ('{free_tier_id}', 'Free Trial', 0.00, 2, 100, 50, '{now_iso}', '{now_iso}')"
        )
    )
    op.execute(
        sa.text(
            "INSERT INTO subscription_tiers "
            "(id, name, monthly_price, max_assistants, max_monthly_messages, max_storage_mb, created_at, updated_at) "
            f"VALUES ('{pro_tier_id}', 'Pro', 49.00, 25, 10000, 5000, '{now_iso}', '{now_iso}')"
        )
    )

    # 4. Seed initial default AI routing strategies
    auto_id = uuid.uuid4()
    fast_id = uuid.uuid4()
    deep_id = uuid.uuid4()

    op.execute(
        sa.text(
            "INSERT INTO ai_routing_strategies "
            "(id, ui_name, ui_description, target_llm_model, is_active, created_at, updated_at) "
            f"VALUES ('{auto_id}', 'Auto', "
            "'Intelligent routing balancing speed, accuracy, and reasoning', 'gpt-4o-mini', true, "
            f"'{now_iso}', '{now_iso}')"
        )
    )
    op.execute(
        sa.text(
            "INSERT INTO ai_routing_strategies "
            "(id, ui_name, ui_description, target_llm_model, is_active, created_at, updated_at) "
            f"VALUES ('{fast_id}', 'Fast', "
            "'Optimized for lowest latency and rapid conversational responses', 'gpt-4o-mini', true, "
            f"'{now_iso}', '{now_iso}')"
        )
    )
    op.execute(
        sa.text(
            "INSERT INTO ai_routing_strategies "
            "(id, ui_name, ui_description, target_llm_model, is_active, created_at, updated_at) "
            f"VALUES ('{deep_id}', 'Deep Thinking', "
            "'High-parameter advanced reasoning and complex analysis', 'gpt-4o', true, "
            f"'{now_iso}', '{now_iso}')"
        )
    )

    # 5. Add subscription_tier_id foreign key column to workspaces table
    op.add_column(
        "workspaces",
        sa.Column("subscription_tier_id", sa.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_workspaces_subscription_tier_id",
        "workspaces",
        "subscription_tiers",
        ["subscription_tier_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_workspaces_subscription_tier_id", "workspaces", ["subscription_tier_id"])

    # Backfill existing workspaces with Free Trial tier
    op.execute(
        sa.text(f"UPDATE workspaces SET subscription_tier_id = '{free_tier_id}' WHERE subscription_tier_id IS NULL")
    )

    # 6. Drop promotional credit columns from workspaces and admin_token_cost_ledger if present
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    ws_cols = [c["name"] for c in inspector.get_columns("workspaces")]
    if "promotional_credit_balance" in ws_cols:
        op.drop_column("workspaces", "promotional_credit_balance")
    if "fiat_spend_balance" in ws_cols:
        op.drop_column("workspaces", "fiat_spend_balance")

    ledger_cols = [c["name"] for c in inspector.get_columns("admin_token_cost_ledger")]
    if "covered_by_promotional_credit" in ledger_cols:
        op.drop_column("admin_token_cost_ledger", "covered_by_promotional_credit")
    if "covered_by_fiat" in ledger_cols:
        op.drop_column("admin_token_cost_ledger", "covered_by_fiat")


def downgrade() -> None:
    # 1. Re-add promotional columns if needed
    op.add_column(
        "workspaces",
        sa.Column("promotional_credit_balance", sa.Numeric(12, 6), nullable=False, server_default="0.000000"),
    )
    op.add_column(
        "workspaces",
        sa.Column("fiat_spend_balance", sa.Numeric(12, 6), nullable=False, server_default="0.000000"),
    )
    op.add_column(
        "admin_token_cost_ledger",
        sa.Column("covered_by_promotional_credit", sa.Numeric(12, 6), nullable=False, server_default="0.000000"),
    )
    op.add_column(
        "admin_token_cost_ledger",
        sa.Column("covered_by_fiat", sa.Numeric(12, 6), nullable=False, server_default="0.000000"),
    )

    # 2. Drop subscription_tier_id from workspaces
    op.drop_constraint("fk_workspaces_subscription_tier_id", "workspaces", type_="foreignkey")
    op.drop_index("ix_workspaces_subscription_tier_id", table_name="workspaces")
    op.drop_column("workspaces", "subscription_tier_id")

    # 3. Drop tables
    op.drop_table("ai_routing_strategies")
    op.drop_table("subscription_tiers")
