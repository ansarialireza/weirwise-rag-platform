"""add is_verified to users and create email_verification_tokens table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-11-01 17:30:00.000000

"""

import uuid
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add is_verified column to users table (default False, but existing superusers / users marked True)
    op.add_column(
        "users",
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="false"),
    )

    # Set existing users (especially staff / admin) to verified
    op.execute(sa.text("UPDATE users SET is_verified = true"))

    # 2. Create email_verification_tokens table
    op.create_table(
        "email_verification_tokens",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "user_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("token_hash", sa.String(length=64), unique=True, nullable=False, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_used", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("email_verification_tokens")
    op.drop_column("users", "is_verified")
