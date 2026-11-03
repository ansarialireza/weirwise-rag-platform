"""add persisted admin operating mode and recovery policy

Revision ID: e6f7a8b9c0d1
Revises: d4e5f6a7b8c9
Create Date: 2026-11-02 12:00:00.000000
"""

from datetime import UTC, datetime
from typing import Sequence, Union

import backend.app.db.base
import sqlalchemy as sa

from alembic import op

revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_control_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("management_mode", sa.String(length=16), server_default="manual", nullable=False),
        sa.Column("emergency_stop", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("automatic_failover", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("auto_disable_unhealthy", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("auto_recover_credentials", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("rate_limit_cooldown_seconds", sa.Integer(), server_default="60", nullable=False),
        sa.Column("circuit_breaker_failure_threshold", sa.Integer(), server_default="3", nullable=False),
        sa.Column("circuit_breaker_cooldown_seconds", sa.Integer(), server_default="300", nullable=False),
        sa.Column("updated_by", backend.app.db.base.GUID(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("id = 1", name="ck_admin_control_settings_singleton"),
        sa.CheckConstraint("management_mode IN ('manual', 'automatic')", name="ck_admin_control_mode"),
        sa.CheckConstraint(
            "rate_limit_cooldown_seconds BETWEEN 10 AND 3600",
            name="ck_admin_control_rate_limit_cooldown",
        ),
        sa.CheckConstraint(
            "circuit_breaker_failure_threshold BETWEEN 1 AND 20",
            name="ck_admin_control_failure_threshold",
        ),
        sa.CheckConstraint(
            "circuit_breaker_cooldown_seconds BETWEEN 30 AND 86400",
            name="ck_admin_control_circuit_cooldown",
        ),
    )
    op.bulk_insert(
        sa.table(
            "admin_control_settings",
            sa.column("id", sa.Integer()),
            sa.column("management_mode", sa.String()),
            sa.column("emergency_stop", sa.Boolean()),
            sa.column("automatic_failover", sa.Boolean()),
            sa.column("auto_disable_unhealthy", sa.Boolean()),
            sa.column("auto_recover_credentials", sa.Boolean()),
            sa.column("rate_limit_cooldown_seconds", sa.Integer()),
            sa.column("circuit_breaker_failure_threshold", sa.Integer()),
            sa.column("circuit_breaker_cooldown_seconds", sa.Integer()),
            sa.column("updated_at", sa.DateTime(timezone=True)),
        ),
        [
            {
                "id": 1,
                "management_mode": "manual",
                "emergency_stop": False,
                "automatic_failover": True,
                "auto_disable_unhealthy": True,
                "auto_recover_credentials": True,
                "rate_limit_cooldown_seconds": 60,
                "circuit_breaker_failure_threshold": 3,
                "circuit_breaker_cooldown_seconds": 300,
                "updated_at": datetime.now(UTC),
            }
        ],
    )


def downgrade() -> None:
    op.drop_table("admin_control_settings")
