"""Workspace and Project domain API endpoints."""

import re
import uuid

from backend.app.api.dependencies import WorkspaceContext, get_current_user, require_workspace
from backend.app.db.session import get_db_session
from backend.app.models.audit import AuditEvent
from backend.app.models.auth import Membership, User, Workspace, WorkspaceRole
from backend.app.models.project import Project
from backend.app.schemas.workspace import (
    MemberInviteRequest,
    MemberRoleUpdateRequest,
    MembershipResponse,
    ProjectCreateRequest,
    ProjectResponse,
    WorkspaceCreateRequest,
    WorkspaceResponse,
    WorkspaceUpdateRequest,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["Workspaces & Projects"])


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower()).strip()
    return re.sub(r"[-\s]+", "-", slug)


# --- Workspace Routes ---


@router.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    payload: WorkspaceCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> WorkspaceResponse:
    """Create a new Workspace with the caller assigned as OWNER."""
    base_slug = payload.slug or slugify(payload.name)
    slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"

    workspace = Workspace(name=payload.name, slug=slug)
    db.add(workspace)
    await db.flush()

    membership = Membership(
        workspace_id=workspace.id,
        user_id=current_user.id,
        role=WorkspaceRole.OWNER.value,
    )
    db.add(membership)

    audit = AuditEvent(
        workspace_id=workspace.id,
        user_id=current_user.id,
        action="workspace.create",
        resource_type="workspace",
        resource_id=workspace.id,
    )
    db.add(audit)
    await db.commit()
    await db.refresh(workspace)

    return WorkspaceResponse.model_validate(workspace)


@router.get("/workspaces", response_model=list[WorkspaceResponse])
async def list_user_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[WorkspaceResponse]:
    """List all workspaces where the current user holds membership."""
    stmt = (
        select(Workspace)
        .join(Membership, Membership.workspace_id == Workspace.id)
        .where(Membership.user_id == current_user.id, Workspace.is_active.is_(True))
        .order_by(Workspace.created_at.desc())
    )
    res = await db.execute(stmt)
    return [WorkspaceResponse.model_validate(ws) for ws in res.scalars().all()]


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: uuid.UUID,
    context: WorkspaceContext = Depends(
        require_workspace(
            allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.VIEWER]
        )
    ),
) -> WorkspaceResponse:
    """Get details of a specific workspace."""
    return WorkspaceResponse.model_validate(context.workspace)


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: uuid.UUID,
    payload: WorkspaceUpdateRequest,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN])),
    db: AsyncSession = Depends(get_db_session),
) -> WorkspaceResponse:
    """Update workspace name or settings (Requires OWNER or ADMIN)."""
    ws = context.workspace
    if payload.name is not None:
        ws.name = payload.name
    if payload.settings is not None:
        ws.settings = payload.settings

    audit = AuditEvent(
        workspace_id=ws.id,
        user_id=context.user.id,
        action="workspace.update",
        resource_type="workspace",
        resource_id=ws.id,
    )
    db.add(audit)
    await db.commit()
    await db.refresh(ws)
    return WorkspaceResponse.model_validate(ws)


# --- Membership & RBAC Routes ---


@router.get("/workspaces/{workspace_id}/members", response_model=list[MembershipResponse])
async def list_workspace_members(
    workspace_id: uuid.UUID,
    context: WorkspaceContext = Depends(require_workspace()),
    db: AsyncSession = Depends(get_db_session),
) -> list[MembershipResponse]:
    """List all members and roles in a workspace."""
    stmt = (
        select(Membership, User.email, User.full_name)
        .join(User, User.id == Membership.user_id)
        .where(Membership.workspace_id == workspace_id)
        .order_by(Membership.created_at.asc())
    )
    res = await db.execute(stmt)
    out = []
    for memb, email, name in res.all():
        resp = MembershipResponse(
            id=memb.id,
            workspace_id=memb.workspace_id,
            user_id=memb.user_id,
            role=WorkspaceRole(memb.role),
            user_email=email,
            user_name=name,
            created_at=memb.created_at,
        )
        out.append(resp)
    return out


@router.post(
    "/workspaces/{workspace_id}/members",
    response_model=MembershipResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_workspace_member(
    workspace_id: uuid.UUID,
    payload: MemberInviteRequest,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN])),
    db: AsyncSession = Depends(get_db_session),
) -> MembershipResponse:
    """Add or invite an existing registered user to the workspace."""
    u_res = await db.execute(select(User).where(User.email == payload.email.lower()))
    target_user = u_res.scalar_one_or_none()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with email '{payload.email}' is not yet registered.",
        )

    # Check existing membership
    m_res = await db.execute(
        select(Membership).where(
            Membership.workspace_id == workspace_id,
            Membership.user_id == target_user.id,
        )
    )
    if m_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this workspace.",
        )

    membership = Membership(
        workspace_id=workspace_id,
        user_id=target_user.id,
        role=payload.role.value,
    )
    db.add(membership)

    audit = AuditEvent(
        workspace_id=workspace_id,
        user_id=context.user.id,
        action="member.add",
        resource_type="membership",
        details={"target_user_id": str(target_user.id), "role": payload.role.value},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(membership)

    return MembershipResponse(
        id=membership.id,
        workspace_id=membership.workspace_id,
        user_id=membership.user_id,
        role=payload.role,
        user_email=target_user.email,
        user_name=target_user.full_name,
        created_at=membership.created_at,
    )


@router.patch("/workspaces/{workspace_id}/members/{member_id}", response_model=MembershipResponse)
async def update_member_role(
    workspace_id: uuid.UUID,
    member_id: uuid.UUID,
    payload: MemberRoleUpdateRequest,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER])),
    db: AsyncSession = Depends(get_db_session),
) -> MembershipResponse:
    """Change a member's role (Strictly OWNER required). Protects against demoting the last owner."""
    res = await db.execute(
        select(Membership).where(Membership.id == member_id, Membership.workspace_id == workspace_id)
    )
    membership = res.scalar_one_or_none()

    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership record not found.")

    # Guard against demoting the last owner
    if membership.role == WorkspaceRole.OWNER.value and payload.role != WorkspaceRole.OWNER:
        owner_count_res = await db.execute(
            select(func.count())
            .select_from(Membership)
            .where(
                Membership.workspace_id == workspace_id,
                Membership.role == WorkspaceRole.OWNER.value,
            )
        )
        owner_count = owner_count_res.scalar() or 0
        if owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the last remaining Owner of the workspace. Transfer ownership first.",
            )

    membership.role = payload.role.value
    await db.commit()
    await db.refresh(membership)

    u_res = await db.execute(select(User).where(User.id == membership.user_id))
    user = u_res.scalar_one()

    return MembershipResponse(
        id=membership.id,
        workspace_id=membership.workspace_id,
        user_id=membership.user_id,
        role=WorkspaceRole(membership.role),
        user_email=user.email,
        user_name=user.full_name,
        created_at=membership.created_at,
    )


# --- Project Routes ---


@router.post("/workspaces/{workspace_id}/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    workspace_id: uuid.UUID,
    payload: ProjectCreateRequest,
    context: WorkspaceContext = Depends(
        require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])
    ),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectResponse:
    """Create a new Project within the workspace."""
    base_slug = payload.slug or slugify(payload.name)
    slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"

    project = Project(
        workspace_id=workspace_id,
        name=payload.name,
        slug=slug,
        description=payload.description,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    return ProjectResponse.model_validate(project)


@router.get("/workspaces/{workspace_id}/projects", response_model=list[ProjectResponse])
async def list_workspace_projects(
    workspace_id: uuid.UUID,
    context: WorkspaceContext = Depends(require_workspace()),
    db: AsyncSession = Depends(get_db_session),
) -> list[ProjectResponse]:
    """List all projects in the workspace."""
    stmt = (
        select(Project)
        .where(Project.workspace_id == workspace_id, Project.is_active.is_(True))
        .order_by(Project.created_at.desc())
    )
    res = await db.execute(stmt)
    return [ProjectResponse.model_validate(p) for p in res.scalars().all()]


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectResponse:
    """Get project details, validating workspace membership."""
    stmt = (
        select(Project)
        .join(Membership, Membership.workspace_id == Project.workspace_id)
        .where(Project.id == project_id, Membership.user_id == current_user.id)
    )
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or access denied.",
        )

    return ProjectResponse.model_validate(project)
