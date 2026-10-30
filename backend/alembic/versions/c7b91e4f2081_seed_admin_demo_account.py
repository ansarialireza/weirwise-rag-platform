"""seed_admin_demo_account

Revision ID: c7b91e4f2081
Revises: 8eccae917ab4
Create Date: 2026-10-30 22:00:00.000000

"""

import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

from backend.app.core.security import hash_password
from sqlalchemy.sql import text

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7b91e4f2081"
down_revision: Union[str, None] = "8eccae917ab4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEMO_EMAIL = "admin@weirwise.local"
DEMO_PASS = "SecretPassword123!"


def upgrade() -> None:
    conn = op.get_bind()
    res = conn.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": DEMO_EMAIL},
    ).fetchone()

    if res is None:
        user_id = str(uuid.uuid4())
        ws_id = str(uuid.uuid4())
        mem_id = str(uuid.uuid4())
        proj_id = str(uuid.uuid4())
        now = datetime.now(UTC)
        hashed = hash_password(DEMO_PASS)

        # 1. Insert admin demo user
        conn.execute(
            text(
                """
                INSERT INTO users (
                    id, email, hashed_password, full_name,
                    is_active, is_superuser, created_at, updated_at
                )
                VALUES (
                    :id, :email, :hashed_password, :full_name,
                    :is_active, :is_superuser, :created_at, :updated_at
                )
                """
            ),
            {
                "id": user_id,
                "email": DEMO_EMAIL,
                "hashed_password": hashed,
                "full_name": "Admin Demo",
                "is_active": True,
                "is_superuser": True,
                "created_at": now,
                "updated_at": now,
            },
        )

        # 2. Insert primary workspace
        conn.execute(
            text(
                """
                INSERT INTO workspaces (id, name, slug, plan_tier, settings, is_active, created_at, updated_at)
                VALUES (:id, :name, :slug, :plan_tier, :settings, :is_active, :created_at, :updated_at)
                """
            ),
            {
                "id": ws_id,
                "name": "Admin Demo Workspace",
                "slug": "ws-admindemo",
                "plan_tier": "enterprise",
                "settings": "{}",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            },
        )

        # 3. Insert membership
        conn.execute(
            text(
                """
                INSERT INTO memberships (id, workspace_id, user_id, role, created_at, updated_at)
                VALUES (:id, :workspace_id, :user_id, :role, :created_at, :updated_at)
                """
            ),
            {
                "id": mem_id,
                "workspace_id": ws_id,
                "user_id": user_id,
                "role": "owner",
                "created_at": now,
                "updated_at": now,
            },
        )

        # 4. Insert default demo project
        conn.execute(
            text(
                """
                INSERT INTO projects (id, workspace_id, name, slug, description, is_active, created_at, updated_at)
                VALUES (:id, :workspace_id, :name, :slug, :description, :is_active, :created_at, :updated_at)
                """
            ),
            {
                "id": proj_id,
                "workspace_id": ws_id,
                "name": "Demo Project",
                "slug": "demo-project",
                "description": "Default demonstration project with enterprise RAG capabilities",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            },
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        text("DELETE FROM users WHERE email = :email"),
        {"email": DEMO_EMAIL},
    )
