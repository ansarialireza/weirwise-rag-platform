"""Pydantic schemas for Workspace, Membership, and Project management."""

import uuid
from datetime import datetime
from typing import Any

from backend.app.models.auth import WorkspaceRole
from backend.app.schemas.auth import EmailStrType
from pydantic import BaseModel, ConfigDict, Field


class WorkspaceCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    slug: str | None = Field(None, min_length=2, max_length=100)


class WorkspaceUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=255)
    settings: dict[str, Any] | None = None


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    plan_tier: str
    settings: dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class MembershipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    user_id: uuid.UUID
    role: WorkspaceRole
    user_email: str | None = None
    user_name: str | None = None
    created_at: datetime


class MemberInviteRequest(BaseModel):
    email: EmailStrType
    role: WorkspaceRole = WorkspaceRole.MEMBER


class MemberRoleUpdateRequest(BaseModel):
    role: WorkspaceRole


class ProjectCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    slug: str | None = Field(None, min_length=2, max_length=100)
    description: str | None = None


class ProjectUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=255)
    description: str | None = None
    is_active: bool | None = None


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    slug: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
