from typing import Optional

from pydantic import BaseModel, ConfigDict


class WorkspaceBase(BaseModel):
    name: str = "Default Workspace"
    slug: Optional[str] = "default"


class WorkspaceCreate(WorkspaceBase):
    pass


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None


class WorkspaceResponse(WorkspaceBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class WorkspaceMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    user_id: str
    email: Optional[str] = None
    role: str = "owner"


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectResponse(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
