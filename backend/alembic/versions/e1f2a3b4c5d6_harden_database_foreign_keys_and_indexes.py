"""harden database foreign keys and indexes

Revision ID: e1f2a3b4c5d6
Revises: a7c3e5f1b9d4
Create Date: 2026-11-07 22:30:00.000000

Fixes critical schema integrity, foreign keys, cascade deletes, and missing indexes:
1. Fix api_credentials schema mismatch:
   - Restores workspace_id column referencing workspaces(id) ON DELETE CASCADE
   - Backfills workspace_id from memberships based on existing user_id
   - Adds indexes on workspace_id and user_id
2. Cleans orphaned records and restores foreign key constraints with ON DELETE CASCADE:
   - workspace_plan_entitlements (fk to workspaces.id)
   - workspace_byok_credentials (fk to workspaces.id)
   - webhook_subscriptions (fk to workspaces.id)
   - business_integrations (fk to workspaces.id)
3. Adds missing performance indexes on unindexed foreign keys:
   - knowledge_sources(project_id)
   - knowledge_sources(user_id)
   - assistants(project_id)
   - assistants(user_id)
   - admin_control_settings(updated_by)
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "a7c3e5f1b9d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. api_credentials: add workspace_id, backfill, add FK and indexes
    # -------------------------------------------------------------------------
    op.execute("""
        DO $$
        BEGIN
            -- Add workspace_id if missing
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'api_credentials' AND column_name = 'workspace_id'
            ) THEN
                ALTER TABLE api_credentials ADD COLUMN workspace_id UUID;
            END IF;

            -- Backfill workspace_id from user's membership if user_id is present
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'api_credentials' AND column_name = 'user_id'
            ) THEN
                UPDATE api_credentials ac
                SET workspace_id = m.workspace_id
                FROM memberships m
                WHERE ac.user_id = m.user_id
                  AND ac.workspace_id IS NULL;
            END IF;

            -- If any records still have NULL workspace_id, assign to default workspace
            UPDATE api_credentials
            SET workspace_id = (SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1)
            WHERE workspace_id IS NULL;

            -- Make workspace_id NOT NULL if workspaces exist
            IF EXISTS (SELECT 1 FROM workspaces) THEN
                ALTER TABLE api_credentials ALTER COLUMN workspace_id SET NOT NULL;
            END IF;

            -- Add foreign key constraint to workspaces(id) ON DELETE CASCADE
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_api_credentials_workspace_id'
            ) THEN
                ALTER TABLE api_credentials
                ADD CONSTRAINT fk_api_credentials_workspace_id
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
            END IF;
        END $$;
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_api_credentials_workspace_id ON api_credentials (workspace_id);")
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'api_credentials' AND column_name = 'user_id'
            ) THEN
                CREATE INDEX IF NOT EXISTS ix_api_credentials_user_id ON api_credentials (user_id);
            END IF;
        END $$;
    """)

    # -------------------------------------------------------------------------
    # 2. Clean orphaned records and enforce ON DELETE CASCADE constraints
    # -------------------------------------------------------------------------
    op.execute("""
        DO $$
        BEGIN
            -- Clean orphans in workspace_plan_entitlements
            DELETE FROM workspace_plan_entitlements
            WHERE workspace_id NOT IN (SELECT id FROM workspaces);

            -- Add FK if missing
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_wpe_workspace_id'
            ) THEN
                ALTER TABLE workspace_plan_entitlements
                ADD CONSTRAINT fk_wpe_workspace_id
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
            END IF;

            -- Clean orphans in workspace_byok_credentials
            DELETE FROM workspace_byok_credentials
            WHERE workspace_id NOT IN (SELECT id FROM workspaces);

            -- Add FK if missing
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_byok_workspace_id'
            ) THEN
                ALTER TABLE workspace_byok_credentials
                ADD CONSTRAINT fk_byok_workspace_id
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
            END IF;

            -- Clean orphans in webhook_subscriptions
            DELETE FROM webhook_subscriptions
            WHERE workspace_id NOT IN (SELECT id FROM workspaces);

            -- Add FK if missing
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_webhooks_workspace_id'
            ) THEN
                ALTER TABLE webhook_subscriptions
                ADD CONSTRAINT fk_webhooks_workspace_id
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
            END IF;

            -- Clean orphans in business_integrations
            DELETE FROM business_integrations
            WHERE workspace_id NOT IN (SELECT id FROM workspaces);

            -- Add FK if missing
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_integrations_workspace_id'
            ) THEN
                ALTER TABLE business_integrations
                ADD CONSTRAINT fk_integrations_workspace_id
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
            END IF;
        END $$;
    """)

    # -------------------------------------------------------------------------
    # 3. Add missing performance indexes on foreign keys
    # -------------------------------------------------------------------------
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'knowledge_sources' AND column_name = 'project_id'
            ) THEN
                CREATE INDEX IF NOT EXISTS ix_knowledge_sources_project_id ON knowledge_sources (project_id);
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'knowledge_sources' AND column_name = 'user_id'
            ) THEN
                CREATE INDEX IF NOT EXISTS ix_knowledge_sources_user_id ON knowledge_sources (user_id);
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'assistants' AND column_name = 'project_id'
            ) THEN
                CREATE INDEX IF NOT EXISTS ix_assistants_project_id ON assistants (project_id);
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'assistants' AND column_name = 'user_id'
            ) THEN
                CREATE INDEX IF NOT EXISTS ix_assistants_user_id ON assistants (user_id);
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'admin_control_settings' AND column_name = 'updated_by'
            ) THEN
                CREATE INDEX IF NOT EXISTS ix_admin_control_settings_updated_by ON admin_control_settings (updated_by);
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_admin_control_settings_updated_by;")
    op.execute("DROP INDEX IF EXISTS ix_assistants_user_id;")
    op.execute("DROP INDEX IF EXISTS ix_assistants_project_id;")
    op.execute("DROP INDEX IF EXISTS ix_knowledge_sources_user_id;")
    op.execute("DROP INDEX IF EXISTS ix_knowledge_sources_project_id;")
    op.execute("DROP INDEX IF EXISTS ix_api_credentials_user_id;")
    op.execute("DROP INDEX IF EXISTS ix_api_credentials_workspace_id;")

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_integrations_workspace_id') THEN
                ALTER TABLE business_integrations DROP CONSTRAINT fk_integrations_workspace_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_webhooks_workspace_id') THEN
                ALTER TABLE webhook_subscriptions DROP CONSTRAINT fk_webhooks_workspace_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_byok_workspace_id') THEN
                ALTER TABLE workspace_byok_credentials DROP CONSTRAINT fk_byok_workspace_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_wpe_workspace_id') THEN
                ALTER TABLE workspace_plan_entitlements DROP CONSTRAINT fk_wpe_workspace_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_api_credentials_workspace_id') THEN
                ALTER TABLE api_credentials DROP CONSTRAINT fk_api_credentials_workspace_id;
            END IF;
        END $$;
    """)
