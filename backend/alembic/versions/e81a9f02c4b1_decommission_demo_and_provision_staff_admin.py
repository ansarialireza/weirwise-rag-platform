"""decommission_demo_and_provision_staff_admin

Revision ID: e81a9f02c4b1
Revises: c7b91e4f2081
Create Date: 2026-10-31 06:45:00.000000

"""

import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

from backend.app.core.config import settings
from backend.app.core.security import hash_password
from sqlalchemy.sql import text

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e81a9f02c4b1"
down_revision: Union[str, None] = "c7b91e4f2081"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.now(UTC)

    # 1. Decommission public demo account:
    # Completely remove public demo account and its associated demo workspace/project.
    demo_email = "admin@weirwise.local"
    demo_user = conn.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": demo_email},
    ).fetchone()

    if demo_user is not None:
        demo_user_id = demo_user[0]

        # Delete any conversations/messages attached to demo assistants
        conn.execute(
            text(
                """
                DELETE FROM messages
                WHERE conversation_id IN (
                    SELECT c.id FROM conversations c
                    JOIN assistants a ON a.id = c.assistant_id
                    JOIN projects p ON p.id = a.project_id
                    JOIN workspaces w ON w.id = p.workspace_id
                    JOIN memberships m ON m.workspace_id = w.id
                    WHERE m.user_id = :uid
                )
                """
            ),
            {"uid": demo_user_id},
        )
        conn.execute(
            text(
                """
                DELETE FROM conversations
                WHERE assistant_id IN (
                    SELECT a.id FROM assistants a
                    JOIN projects p ON p.id = a.project_id
                    JOIN workspaces w ON w.id = p.workspace_id
                    JOIN memberships m ON m.workspace_id = w.id
                    WHERE m.user_id = :uid
                )
                """
            ),
            {"uid": demo_user_id},
        )
        conn.execute(
            text(
                """
                DELETE FROM assistant_knowledge_sources
                WHERE assistant_id IN (
                    SELECT a.id FROM assistants a
                    JOIN projects p ON p.id = a.project_id
                    JOIN workspaces w ON w.id = p.workspace_id
                    JOIN memberships m ON m.workspace_id = w.id
                    WHERE m.user_id = :uid
                )
                """
            ),
            {"uid": demo_user_id},
        )
        conn.execute(
            text(
                """
                DELETE FROM assistants
                WHERE project_id IN (
                    SELECT p.id FROM projects p
                    JOIN workspaces w ON w.id = p.workspace_id
                    JOIN memberships m ON m.workspace_id = w.id
                    WHERE m.user_id = :uid
                )
                """
            ),
            {"uid": demo_user_id},
        )
        conn.execute(
            text(
                """
                DELETE FROM documents
                WHERE knowledge_source_id IN (
                    SELECT ks.id FROM knowledge_sources ks
                    JOIN projects p ON p.id = ks.project_id
                    JOIN workspaces w ON w.id = p.workspace_id
                    JOIN memberships m ON m.workspace_id = w.id
                    WHERE m.user_id = :uid
                )
                """
            ),
            {"uid": demo_user_id},
        )
        conn.execute(
            text(
                """
                DELETE FROM knowledge_sources
                WHERE project_id IN (
                    SELECT p.id FROM projects p
                    JOIN workspaces w ON w.id = p.workspace_id
                    JOIN memberships m ON m.workspace_id = w.id
                    WHERE m.user_id = :uid
                )
                """
            ),
            {"uid": demo_user_id},
        )
        conn.execute(
            text(
                """
                DELETE FROM projects
                WHERE workspace_id IN (
                    SELECT w.id FROM workspaces w
                    JOIN memberships m ON m.workspace_id = w.id
                    WHERE m.user_id = :uid
                )
                """
            ),
            {"uid": demo_user_id},
        )
        conn.execute(
            text("DELETE FROM user_sessions WHERE user_id = :uid"),
            {"uid": demo_user_id},
        )
        conn.execute(
            text("DELETE FROM audit_events WHERE user_id = :uid"),
            {"uid": demo_user_id},
        )
        conn.execute(
            text("DELETE FROM memberships WHERE user_id = :uid"),
            {"uid": demo_user_id},
        )
        conn.execute(
            text(
                """
                DELETE FROM workspaces
                WHERE slug = 'ws-admindemo'
                   OR name = 'Admin Demo Workspace'
                """
            )
        )
        conn.execute(
            text("DELETE FROM users WHERE id = :uid"),
            {"uid": demo_user_id},
        )

    # 2. Securely provision private staff administrator from protected environment config
    staff_email = settings.INITIAL_STAFF_ADMIN_EMAIL or "staff@weirwise.com"
    staff_pass = settings.INITIAL_STAFF_ADMIN_PASSWORD

    if staff_pass:
        existing_staff = conn.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": staff_email},
        ).fetchone()

        if existing_staff is None:
            staff_user_id = str(uuid.uuid4())
            staff_ws_id = str(uuid.uuid4())
            staff_mem_id = str(uuid.uuid4())
            staff_proj_id = str(uuid.uuid4())
            hashed = hash_password(staff_pass)

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
                    "id": staff_user_id,
                    "email": staff_email,
                    "hashed_password": hashed,
                    "full_name": "Platform Staff Admin",
                    "is_active": True,
                    "is_superuser": True,
                    "created_at": now,
                    "updated_at": now,
                },
            )

            conn.execute(
                text(
                    """
                    INSERT INTO workspaces (id, name, slug, plan_tier, settings, is_active, created_at, updated_at)
                    VALUES (:id, :name, :slug, :plan_tier, :settings, :is_active, :created_at, :updated_at)
                    """
                ),
                {
                    "id": staff_ws_id,
                    "name": "Weirwise Operations",
                    "slug": "ws-operations",
                    "plan_tier": "enterprise",
                    "settings": "{}",
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now,
                },
            )

            conn.execute(
                text(
                    """
                    INSERT INTO memberships (id, workspace_id, user_id, role, created_at, updated_at)
                    VALUES (:id, :workspace_id, :user_id, :role, :created_at, :updated_at)
                    """
                ),
                {
                    "id": staff_mem_id,
                    "workspace_id": staff_ws_id,
                    "user_id": staff_user_id,
                    "role": "owner",
                    "created_at": now,
                    "updated_at": now,
                },
            )

            conn.execute(
                text(
                    """
                    INSERT INTO projects (id, workspace_id, name, description, settings, created_at, updated_at)
                    VALUES (:id, :workspace_id, :name, :description, :settings, :created_at, :updated_at)
                    """
                ),
                {
                    "id": staff_proj_id,
                    "workspace_id": staff_ws_id,
                    "name": "Platform Operations",
                    "description": "Internal Platform Staff Operations Project",
                    "settings": "{}",
                    "created_at": now,
                    "updated_at": now,
                },
            )


def downgrade() -> None:
    pass
