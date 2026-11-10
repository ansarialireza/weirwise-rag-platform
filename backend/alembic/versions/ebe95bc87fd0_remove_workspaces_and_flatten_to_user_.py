"""remove_workspaces_and_flatten_to_user_ownership

Revision ID: ebe95bc87fd0
Revises: d1e2f3a4b5c6
Create Date: 2026-11-08 15:05:03.988375

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ebe95bc87fd0"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Step 1: Add user_id to documents
    op.add_column(
        "documents",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_documents_user_id", "documents", ["user_id"])

    # Step 1b: Add user_id to workspace_byok_credentials
    op.add_column(
        "workspace_byok_credentials",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_workspace_byok_credentials_user_id", "workspace_byok_credentials", ["user_id"])

    # Step 2: Backfill missing user_ids on knowledge_sources and assistants from project memberships
    conn.execute(
        sa.text("""
        UPDATE knowledge_sources ks
        SET user_id = m.user_id
        FROM projects p
        JOIN memberships m ON m.workspace_id = p.workspace_id
        WHERE ks.user_id IS NULL AND ks.project_id = p.id;
    """)
    )

    conn.execute(
        sa.text("""
        UPDATE assistants a
        SET user_id = m.user_id
        FROM projects p
        JOIN memberships m ON m.workspace_id = p.workspace_id
        WHERE a.user_id IS NULL AND a.project_id = p.id;
    """)
    )

    # Step 3: Backfill documents.user_id from parent knowledge_source.user_id
    conn.execute(
        sa.text("""
        UPDATE documents d
        SET user_id = ks.user_id
        FROM knowledge_sources ks
        WHERE d.knowledge_source_id = ks.id AND d.user_id IS NULL;
    """)
    )

    # Step 4: Backfill user_id on workspace_plan_entitlements
    conn.execute(
        sa.text("""
        UPDATE workspace_plan_entitlements wpe
        SET user_id = m.user_id
        FROM memberships m
        WHERE wpe.user_id IS NULL AND wpe.workspace_id = m.workspace_id;
    """)
    )

    # Deduplicate entitlements if any user has duplicate rows
    conn.execute(
        sa.text("""
        DELETE FROM workspace_plan_entitlements a
        USING workspace_plan_entitlements b
        WHERE a.user_id IS NOT NULL
          AND a.user_id = b.user_id
          AND a.created_at < b.created_at;
    """)
    )

    # Step 5: Backfill usage_events.user_id
    conn.execute(
        sa.text("""
        UPDATE usage_events ue
        SET user_id = m.user_id
        FROM memberships m
        WHERE ue.user_id IS NULL AND ue.workspace_id = m.workspace_id;
    """)
    )

    conn.execute(
        sa.text("""
        UPDATE usage_events ue
        SET user_id = m.user_id
        FROM projects p
        JOIN memberships m ON m.workspace_id = p.workspace_id
        WHERE ue.user_id IS NULL AND ue.project_id = p.id;
    """)
    )

    # Step 6: Make user_id NOT NULL on customer-owned resources
    op.alter_column("knowledge_sources", "user_id", nullable=False)
    op.alter_column("assistants", "user_id", nullable=False)
    op.alter_column("documents", "user_id", nullable=False)

    # Step 7: Make users.full_name nullable (allowing direct email+password accounts)
    op.alter_column("users", "full_name", nullable=True)

    # Step 8: Drop unique constraints referencing workspace_id
    op.drop_constraint("uq_workspace_integration_provider", "business_integrations", type_="unique")
    op.drop_constraint("uq_workspace_byok_provider", "workspace_byok_credentials", type_="unique")

    # Step 9: Drop foreign keys referencing workspaces and projects
    op.drop_constraint("billing_subscriptions_workspace_id_fkey", "billing_subscriptions", type_="foreignkey")
    op.drop_constraint("billing_orders_workspace_id_fkey", "billing_orders", type_="foreignkey")
    op.drop_constraint("billing_invoices_workspace_id_fkey", "billing_invoices", type_="foreignkey")
    op.drop_constraint("fk_api_credentials_workspace_id", "api_credentials", type_="foreignkey")
    op.drop_constraint("fk_wpe_workspace_id", "workspace_plan_entitlements", type_="foreignkey")
    op.drop_constraint("fk_byok_workspace_id", "workspace_byok_credentials", type_="foreignkey")
    op.drop_constraint("fk_webhooks_workspace_id", "webhook_subscriptions", type_="foreignkey")
    op.drop_constraint("fk_integrations_workspace_id", "business_integrations", type_="foreignkey")
    op.drop_constraint("knowledge_sources_project_id_fkey", "knowledge_sources", type_="foreignkey")
    op.drop_constraint("assistants_project_id_fkey", "assistants", type_="foreignkey")

    # Step 10: Drop workspace and project columns from customer tables
    op.drop_column("knowledge_sources", "project_id")
    op.drop_column("assistants", "project_id")
    op.drop_column("billing_subscriptions", "workspace_id")
    op.drop_column("billing_orders", "workspace_id")
    op.drop_column("billing_invoices", "workspace_id")
    op.drop_column("api_credentials", "workspace_id")
    op.drop_column("audit_events", "workspace_id")
    op.drop_column("usage_events", "workspace_id")
    op.drop_column("usage_events", "project_id")
    op.drop_column("workspace_plan_entitlements", "workspace_id")
    op.drop_column("workspace_byok_credentials", "workspace_id")
    op.drop_column("webhook_subscriptions", "workspace_id")
    op.drop_column("business_integrations", "workspace_id")
    op.drop_column("user_behavioral_sessions", "workspace_id")
    op.drop_column("behavioral_events", "workspace_id")
    op.drop_column("user_behavioral_profiles", "workspace_id")
    op.drop_column("admin_token_cost_ledger", "workspace_id")
    op.drop_column("admin_routing_events", "workspace_id")
    op.drop_column("admin_financial_invoices", "workspace_id")

    # Step 11: Add user unique constraints
    op.create_unique_constraint("uq_user_integration_provider", "business_integrations", ["user_id", "provider"])
    op.create_unique_constraint("uq_user_byok_provider", "workspace_byok_credentials", ["user_id", "provider_name"])

    # Step 12: Drop obsolete tables: memberships, projects, workspaces
    op.drop_table("memberships")
    op.drop_table("projects")
    op.drop_table("workspaces")


def downgrade() -> None:
    pass
