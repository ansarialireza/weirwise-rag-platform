"""FastAPI dependencies for Super Admin and RBAC authorization."""

from backend.app.api.dependencies import get_current_user
from backend.app.db.session import get_db_session
from backend.app.models.admin import AdminRole, AdminUserRole
from backend.app.models.auth import User
from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def require_admin_user(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> User:
    """Ensures user is an authorized platform staff member (Superuser or AdminUserRole)."""
    if current_user.is_superuser:
        return current_user

    stmt = select(AdminUserRole).where(AdminUserRole.user_id == current_user.id)
    res = await db.execute(stmt)
    role_assignment = res.scalar_one_or_none()

    if not role_assignment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Super Admin or Platform Staff privileges required.",
        )

    return current_user


def require_admin_role(required_roles: list[AdminRole]):
    """Enforces specific RBAC roles (e.g. Finance Admin, Super Admin)."""

    async def _role_checker(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> User:
        if current_user.is_superuser:
            return current_user

        stmt = select(AdminUserRole).where(AdminUserRole.user_id == current_user.id)
        res = await db.execute(stmt)
        assignment = res.scalar_one_or_none()

        if not assignment or assignment.role not in [r.value for r in required_roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of: {[r.value for r in required_roles]}",
            )
        return current_user

    return _role_checker
