"""add_comprehensive_billing_and_payment_system

Revision ID: b3a4c5d6e7f8
Revises: e1f2a3b4c5d6
Create Date: 2026-11-08 10:20:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from backend.app.db.base import GUID, CompatibleJSON

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3a4c5d6e7f8"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. billing_plans table
    op.create_table(
        "billing_plans",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("monthly_price", sa.Numeric(precision=10, scale=2), nullable=False, server_default="0.00"),
        sa.Column("yearly_price", sa.Numeric(precision=10, scale=2), nullable=False, server_default="0.00"),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_recommended", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_assistants", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("max_documents", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("max_chat_turns_monthly", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("max_storage_mb", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("max_file_size_mb", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("max_knowledge_sources", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("allowed_models", CompatibleJSON(), nullable=False, server_default='["Auto", "Fast"]'),
        sa.Column("features", CompatibleJSON(), nullable=False, server_default="[]"),
        sa.Column("allow_custom_branding", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("allow_api_access", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("allow_overage", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("overage_rate_cents", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_billing_plans_code"), "billing_plans", ["code"], unique=True)

    # 2. billing_subscriptions table
    op.create_table(
        "billing_subscriptions",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("workspace_id", GUID(), nullable=False),
        sa.Column("plan_id", GUID(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="active"),
        sa.Column("billing_cycle", sa.String(length=20), nullable=False, server_default="monthly"),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["plan_id"], ["billing_plans.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_billing_subscriptions_plan_id"), "billing_subscriptions", ["plan_id"], unique=False)
    op.create_index(op.f("ix_billing_subscriptions_status"), "billing_subscriptions", ["status"], unique=False)
    op.create_index(
        op.f("ix_billing_subscriptions_workspace_id"), "billing_subscriptions", ["workspace_id"], unique=False
    )

    # 3. billing_orders table
    op.create_table(
        "billing_orders",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("order_number", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", GUID(), nullable=False),
        sa.Column("user_id", GUID(), nullable=True),
        sa.Column("plan_id", GUID(), nullable=False),
        sa.Column("subscription_id", GUID(), nullable=True),
        sa.Column("billing_cycle", sa.String(length=20), nullable=False, server_default="monthly"),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["plan_id"], ["billing_plans.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["subscription_id"], ["billing_subscriptions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_billing_orders_order_number"), "billing_orders", ["order_number"], unique=True)
    op.create_index(op.f("ix_billing_orders_status"), "billing_orders", ["status"], unique=False)
    op.create_index(op.f("ix_billing_orders_workspace_id"), "billing_orders", ["workspace_id"], unique=False)

    # 4. billing_payments table
    op.create_table(
        "billing_payments",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("order_id", GUID(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False, server_default="rampex"),
        sa.Column("provider_payment_id", sa.String(length=255), nullable=True),
        sa.Column("provider_session_id", sa.String(length=255), nullable=True),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("received_amount", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("received_currency", sa.String(length=20), nullable=True),
        sa.Column("payout_amount", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("payout_currency", sa.String(length=20), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="waiting_for_payment"),
        sa.Column("payment_url", sa.String(length=1024), nullable=True),
        sa.Column("payment_address", sa.String(length=255), nullable=True),
        sa.Column("qr_code_svg", sa.Text(), nullable=True),
        sa.Column("blockchain_txid", sa.String(length=255), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_response", CompatibleJSON(), nullable=False, server_default="{}"),
        sa.Column("review_reason", sa.String(length=255), nullable=True),
        sa.Column("resolved_by", GUID(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["order_id"], ["billing_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resolved_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_billing_payments_blockchain_txid"), "billing_payments", ["blockchain_txid"], unique=False)
    op.create_index(op.f("ix_billing_payments_order_id"), "billing_payments", ["order_id"], unique=False)
    op.create_index(op.f("ix_billing_payments_provider"), "billing_payments", ["provider"], unique=False)
    op.create_index(
        op.f("ix_billing_payments_provider_payment_id"), "billing_payments", ["provider_payment_id"], unique=False
    )
    op.create_index(op.f("ix_billing_payments_status"), "billing_payments", ["status"], unique=False)

    # 5. billing_payment_events table
    op.create_table(
        "billing_payment_events",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("payment_id", GUID(), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=False, server_default="rampex"),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("event_id", sa.String(length=255), nullable=True),
        sa.Column("payload", CompatibleJSON(), nullable=False, server_default="{}"),
        sa.Column("signature", sa.String(length=255), nullable=True),
        sa.Column("is_valid", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("processed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("processing_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["payment_id"], ["billing_payments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_billing_payment_events_event_id"), "billing_payment_events", ["event_id"], unique=True)
    op.create_index(
        op.f("ix_billing_payment_events_event_type"), "billing_payment_events", ["event_type"], unique=False
    )
    op.create_index(
        op.f("ix_billing_payment_events_payment_id"), "billing_payment_events", ["payment_id"], unique=False
    )

    # 6. billing_invoices table
    op.create_table(
        "billing_invoices",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("invoice_number", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", GUID(), nullable=False),
        sa.Column("subscription_id", GUID(), nullable=True),
        sa.Column("order_id", GUID(), nullable=True),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="paid"),
        sa.Column("billing_period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("billing_period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("line_items", CompatibleJSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["order_id"], ["billing_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["subscription_id"], ["billing_subscriptions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_billing_invoices_invoice_number"), "billing_invoices", ["invoice_number"], unique=True)
    op.create_index(op.f("ix_billing_invoices_status"), "billing_invoices", ["status"], unique=False)
    op.create_index(op.f("ix_billing_invoices_workspace_id"), "billing_invoices", ["workspace_id"], unique=False)

    # 7. payment_provider_configs table
    op.create_table(
        "payment_provider_configs",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("provider_name", sa.String(length=50), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("api_base_url", sa.String(length=255), nullable=False, server_default="https://api.rampex.io"),
        sa.Column("encrypted_api_key", sa.Text(), nullable=True),
        sa.Column("encrypted_webhook_secret", sa.Text(), nullable=True),
        sa.Column("key_prefix", sa.String(length=32), nullable=True),
        sa.Column("supported_currencies", CompatibleJSON(), nullable=False, server_default='["USD", "EUR", "GBP"]'),
        sa.Column("extra_settings", CompatibleJSON(), nullable=False, server_default="{}"),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verification_status", sa.String(length=50), nullable=False, server_default="untested"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_payment_provider_configs_provider_name"), "payment_provider_configs", ["provider_name"], unique=True
    )


def downgrade() -> None:
    op.drop_table("payment_provider_configs")
    op.drop_table("billing_invoices")
    op.drop_table("billing_payment_events")
    op.drop_table("billing_payments")
    op.drop_table("billing_orders")
    op.drop_table("billing_subscriptions")
    op.drop_table("billing_plans")
