"""FastAPI dependencies for authentication, workspace tenancy, and RBAC."""

import uuid

from backend.app.core.security import decode_jwt_token, hash_token
from backend.app.db.session import get_db_session
from backend.app.models.assistant import Deployment
from backend.app.models.audit import ApiCredential
from backend.app.models.auth import Membership, User, Workspace, WorkspaceRole
from fastapi import Cookie, Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    access_token_cookie: str | None = Cookie(None, alias="access_token"),
    db: AsyncSession = Depends(get_db_session),
) -> User:
    """Resolve authenticated user from Bearer header or secure HttpOnly cookie."""
    token = None
    if credentials:
        token = credentials.credentials
    elif access_token_cookie:
        token = access_token_cookie

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_jwt_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = uuid.UUID(payload["sub"])
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token subject identifier.",
        )

    stmt = select(User).where(User.id == user_id, User.is_active.is_(True))
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive or does not exist.",
        )

    return user


class WorkspaceContext:
    """Encapsulates authenticated workspace membership and permissions."""

    def __init__(self, workspace: Workspace, membership: Membership, user: User):
        self.workspace = workspace
        self.membership = membership
        self.user = user

    @property
    def role(self) -> WorkspaceRole:
        return WorkspaceRole(self.membership.role)

    def require_role(self, allowed_roles: list[WorkspaceRole]) -> None:
        if self.role not in allowed_roles:
            roles_str = [r.value for r in allowed_roles]
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation requires one of roles: {roles_str}. Current role: {self.role.value}",
            )


def require_workspace(workspace_id_param: str = "workspace_id", allowed_roles: list[WorkspaceRole] | None = None):
    """Factory dependency enforcing workspace membership and RBAC role."""
    async def dependency(
        workspace_id: uuid.UUID,
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> WorkspaceContext:
        stmt = (
            select(Workspace, Membership)
            .join(Membership, Membership.workspace_id == Workspace.id)
            .where(
                Workspace.id == workspace_id,
                Membership.user_id == user.id,
                Workspace.is_active.is_(True),
            )
        )
        res = await db.execute(stmt)
        record = res.first()

        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found or you are not a member.",
            )

        ws, memb = record
        context = WorkspaceContext(ws, memb, user)

        if allowed_roles:
            context.require_role(allowed_roles)

        return context

    return dependency


async def get_api_credential_context(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db_session),
) -> ApiCredential:
    """Authenticate incoming request using a Platform-issued API Key."""
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header.",
        )

    key_hash = hash_token(x_api_key)
    stmt = (
        select(ApiCredential)
        .where(
            ApiCredential.key_hash == key_hash,
            ApiCredential.is_active.is_(True),
        )
    )
    res = await db.execute(stmt)
    credential = res.scalar_one_or_none()

    if not credential:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API Key.",
        )

    return credential


async def get_widget_deployment_context(
    x_public_key: str | None = Header(None, alias="X-Public-Key"),
    origin: str | None = Header(None, alias="Origin"),
    db: AsyncSession = Depends(get_db_session),
) -> Deployment:
    """Authenticate public embed widget requests by public key with domain origin checks."""
    if not x_public_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Public-Key header for widget access.",
        )

    stmt = select(Deployment).where(
        Deployment.public_key == x_public_key,
        Deployment.is_active.is_(True),
    )
    res = await db.execute(stmt)
    deployment = res.scalar_one_or_none()

    if not deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found or inactive.",
        )

    # Domain Origin Verification
    allowed = deployment.allowed_domains
    if allowed and "*" not in allowed:
        if not origin or origin not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Origin '{origin}' is not authorized for this widget deployment.",
            )

    return deployment
