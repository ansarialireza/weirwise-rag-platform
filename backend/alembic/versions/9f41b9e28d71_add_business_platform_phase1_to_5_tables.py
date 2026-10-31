"""add_business_platform_phase1_to_5_tables

Revision ID: 9f41b9e28d71
Revises: e81a9f02c4b1
Create Date: 2026-10-31 08:30:00.000000

"""

from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "9f41b9e28d71"
down_revision: Union[str, None] = "e81a9f02c4b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    is_pg = conn.dialect.name == "postgresql"

    # Add columns to assistants if not exist
    try:
        op.add_column("assistants", sa.Column("language", sa.String(20), server_default="en", nullable=False))
    except Exception:
        pass
    try:
        op.add_column("assistants", sa.Column("tone", sa.String(50), server_default="professional", nullable=False))
    except Exception:
        pass
    try:
        op.add_column("assistants", sa.Column("fallback_message", sa.Text(), server_default="I am sorry, but I do not have enough verified information to answer that accurately.", nullable=False))
    except Exception:
        pass
    try:
        op.add_column("assistants", sa.Column("escalation_email", sa.String(255), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("assistants", sa.Column("last_published_at", sa.DateTime(timezone=True), nullable=True))
    except Exception:
        pass

    # Add columns to conversations
    try:
        op.add_column("conversations", sa.Column("is_escalated", sa.Boolean(), server_default="0", nullable=False))
    except Exception:
        pass
    try:
        op.add_column("conversations", sa.Column("escalation_reason", sa.String(255), nullable=True))
    except Exception:
        pass
    try:
        op.add_column("conversations", sa.Column("escalation_contact", sa.String(255), nullable=True))
    except Exception:
        pass

    # Add columns to messages
    try:
        op.add_column("messages", sa.Column("is_grounded", sa.Boolean(), server_default="1", nullable=False))
    except Exception:
        pass

    # GUID and JSON types
    guid_type = postgresql.UUID(as_uuid=True) if is_pg else sa.CHAR(36)
    json_type = postgresql.JSONB() if is_pg else sa.JSON()

    # Create answer_feedback
    op.create_table(
        "answer_feedback",
        sa.Column("id", guid_type, primary_key=True),
        sa.Column("assistant_id", guid_type, sa.ForeignKey("assistants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("conversation_id", guid_type, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("message_id", guid_type, sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("rating", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(100), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Create unanswered_queries
    op.create_table(
        "unanswered_queries",
        sa.Column("id", guid_type, primary_key=True),
        sa.Column("assistant_id", guid_type, sa.ForeignKey("assistants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("conversation_id", guid_type, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("query_text", sa.Text(), nullable=False),
        sa.Column("fallback_reason", sa.String(100), server_default="insufficient_grounding_evidence", nullable=False),
        sa.Column("frequency_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("status", sa.String(50), server_default="unresolved", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Create evaluation_cases
    op.create_table(
        "evaluation_cases",
        sa.Column("id", guid_type, primary_key=True),
        sa.Column("assistant_id", guid_type, sa.ForeignKey("assistants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("expected_answer", sa.Text(), nullable=False),
        sa.Column("expected_facts", json_type, nullable=False),
        sa.Column("last_run_score", sa.Float(), nullable=True),
        sa.Column("last_run_result", json_type, nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Create human_handoff_requests
    op.create_table(
        "human_handoff_requests",
        sa.Column("id", guid_type, primary_key=True),
        sa.Column("conversation_id", guid_type, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("customer_email", sa.String(255), nullable=True),
        sa.Column("customer_name", sa.String(255), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), server_default="pending", nullable=False),
        sa.Column("external_ticket_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Create business_integrations
    op.create_table(
        "business_integrations",
        sa.Column("id", guid_type, primary_key=True),
        sa.Column("workspace_id", guid_type, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("provider", sa.String(50), nullable=False, index=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="1", nullable=False),
        sa.Column("encrypted_credentials", sa.Text(), nullable=False),
        sa.Column("config", json_type, nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sync_status", sa.String(50), server_default="idle", nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "provider", name="uq_workspace_integration_provider"),
    )

    # Create webhook_subscriptions
    op.create_table(
        "webhook_subscriptions",
        sa.Column("id", guid_type, primary_key=True),
        sa.Column("workspace_id", guid_type, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("target_url", sa.String(1024), nullable=False),
        sa.Column("secret_key", sa.String(128), nullable=False),
        sa.Column("events", json_type, nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="1", nullable=False),
        sa.Column("failure_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Create webhook_deliveries
    op.create_table(
        "webhook_deliveries",
        sa.Column("id", guid_type, primary_key=True),
        sa.Column("subscription_id", guid_type, sa.ForeignKey("webhook_subscriptions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("payload", json_type, nullable=False),
        sa.Column("response_code", sa.Integer(), nullable=True),
        sa.Column("response_body", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), server_default="1", nullable=False),
        sa.Column("status", sa.String(50), server_default="delivered", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Create workspace_plan_entitlements
    op.create_table(
        "workspace_plan_entitlements",
        sa.Column("id", guid_type, primary_key=True),
        sa.Column("workspace_id", guid_type, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
        sa.Column("plan_tier", sa.String(50), server_default="free", nullable=False),
        sa.Column("max_assistants", sa.Integer(), server_default="1", nullable=False),
        sa.Column("max_knowledge_sources", sa.Integer(), server_default="3", nullable=False),
        sa.Column("monthly_chat_turns_limit", sa.Integer(), server_default="100", nullable=False),
        sa.Column("max_storage_mb", sa.Integer(), server_default="50", nullable=False),
        sa.Column("allow_custom_branding", sa.Boolean(), server_default="0", nullable=False),
        sa.Column("allow_overage", sa.Boolean(), server_default="0", nullable=False),
        sa.Column("overage_rate_cents", sa.Integer(), server_default="5", nullable=False),
        sa.Column("data_retention_days", sa.Integer(), server_default="30", nullable=False),
        sa.Column("current_period_chat_turns", sa.Integer(), server_default="0", nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Create workspace_byok_credentials
    op.create_table(
        "workspace_byok_credentials",
        sa.Column("id", guid_type, primary_key=True),
        sa.Column("workspace_id", guid_type, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("provider_name", sa.String(50), nullable=False),
        sa.Column("api_endpoint", sa.String(512), nullable=True),
        sa.Column("deployment_id", sa.String(255), nullable=True),
        sa.Column("api_version", sa.String(50), nullable=True),
        sa.Column("key_prefix", sa.String(32), nullable=False),
        sa.Column("encrypted_key", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "provider_name", name="uq_workspace_byok_provider"),
    )


def downgrade() -> None:
    pass
