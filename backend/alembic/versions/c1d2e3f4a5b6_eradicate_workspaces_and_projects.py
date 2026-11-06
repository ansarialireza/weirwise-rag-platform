"""neutralized: workspaces and projects remain the tenancy model

Revision ID: c1d2e3f4a5b6
Revises: 1a2b3c4d5e6f
Create Date: 2026-11-03 17:48:00.000000

This revision originally dropped `projects`, `memberships`, and `workspaces`,
which the application still requires. It is kept as a no-op so databases that
already applied it and databases that have not can share one linear history.

"""

from typing import Sequence, Union

revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "1a2b3c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Intentionally empty: the tenancy tables are required by the current schema.
    pass


def downgrade() -> None:
    pass
