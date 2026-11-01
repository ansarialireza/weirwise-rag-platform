"""alter finops spend precision to numeric(12, 6)

Revision ID: a1b2c3d4e5f6
Revises: 9f41b9e28d71
Create Date: 2026-10-31 19:38:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "9f41b9e28d71"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Alter current_month_spend_usd and monthly_budget_usd in admin_provider_accounts and admin_provider_credentials
    op.alter_column(
        "admin_provider_accounts",
        "current_month_spend_usd",
        type_=sa.Numeric(precision=12, scale=6),
        existing_type=sa.Numeric(precision=10, scale=2),
        existing_nullable=False,
    )
    op.alter_column(
        "admin_provider_accounts",
        "global_monthly_budget_usd",
        type_=sa.Numeric(precision=12, scale=6),
        existing_type=sa.Numeric(precision=10, scale=2),
        existing_nullable=False,
    )
    op.alter_column(
        "admin_provider_credentials",
        "current_month_spend_usd",
        type_=sa.Numeric(precision=12, scale=6),
        existing_type=sa.Numeric(precision=10, scale=2),
        existing_nullable=False,
    )
    op.alter_column(
        "admin_provider_credentials",
        "monthly_budget_usd",
        type_=sa.Numeric(precision=12, scale=6),
        existing_type=sa.Numeric(precision=10, scale=2),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "admin_provider_credentials",
        "monthly_budget_usd",
        type_=sa.Numeric(precision=10, scale=2),
        existing_type=sa.Numeric(precision=12, scale=6),
        existing_nullable=False,
    )
    op.alter_column(
        "admin_provider_credentials",
        "current_month_spend_usd",
        type_=sa.Numeric(precision=10, scale=2),
        existing_type=sa.Numeric(precision=12, scale=6),
        existing_nullable=False,
    )
    op.alter_column(
        "admin_provider_accounts",
        "global_monthly_budget_usd",
        type_=sa.Numeric(precision=10, scale=2),
        existing_type=sa.Numeric(precision=12, scale=6),
        existing_nullable=False,
    )
    op.alter_column(
        "admin_provider_accounts",
        "current_month_spend_usd",
        type_=sa.Numeric(precision=10, scale=2),
        existing_type=sa.Numeric(precision=12, scale=6),
        existing_nullable=False,
    )
