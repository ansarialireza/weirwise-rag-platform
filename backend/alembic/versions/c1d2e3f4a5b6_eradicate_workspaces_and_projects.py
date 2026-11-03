"""eradicate workspaces and projects tables and reparent to user

Revision ID: c1d2e3f4a5b6
Revises: 1a2b3c4d5e6f
Create Date: 2026-11-03 17:48:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from backend.app.db.base import GUID

from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "1a2b3c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add user_id columns safely
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'assistants' AND column_name = 'user_id'
            ) THEN
                ALTER TABLE assistants ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
                UPDATE assistants SET user_id = (SELECT id FROM users LIMIT 1) WHERE user_id IS NULL;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'knowledge_sources' AND column_name = 'user_id'
            ) THEN
                ALTER TABLE knowledge_sources ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
                UPDATE knowledge_sources SET user_id = (SELECT id FROM users LIMIT 1) WHERE user_id IS NULL;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'api_credentials' AND column_name = 'user_id'
            ) THEN
                ALTER TABLE api_credentials ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
                UPDATE api_credentials SET user_id = (SELECT id FROM users LIMIT 1) WHERE user_id IS NULL;
            END IF;

            -- Drop old foreign key constraints and columns if present
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'assistants' AND column_name = 'project_id'
            ) THEN
                ALTER TABLE assistants DROP COLUMN project_id CASCADE;
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'knowledge_sources' AND column_name = 'project_id'
            ) THEN
                ALTER TABLE knowledge_sources DROP COLUMN project_id CASCADE;
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'api_credentials' AND column_name = 'workspace_id'
            ) THEN
                ALTER TABLE api_credentials DROP COLUMN workspace_id CASCADE;
            END IF;

            -- Drop projects, memberships, workspaces
            DROP TABLE IF EXISTS projects CASCADE;
            DROP TABLE IF EXISTS memberships CASCADE;
            DROP TABLE IF EXISTS workspaces CASCADE;
        END $$;
    """)


def downgrade() -> None:
    pass
