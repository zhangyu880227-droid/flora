import uuid

from pydantic import BaseModel

from app.models.workspace import WorkspaceRole


class WorkspaceCreate(BaseModel):
    name: str
    slug: str


class WorkspaceUpdate(BaseModel):
    name: str | None = None


class WorkspaceResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    owner_id: uuid.UUID

    model_config = {"from_attributes": True}


class WorkspaceMemberResponse(BaseModel):
    user_id: str
    workspace_id: str
    role: WorkspaceRole
    user: dict

    model_config = {"from_attributes": True}


class InviteMemberRequest(BaseModel):
    email: str
    role: WorkspaceRole = WorkspaceRole.viewer
