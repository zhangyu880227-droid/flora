import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DB
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.models.user import User
from app.schemas.workspace import (
    InviteMemberRequest,
    WorkspaceCreate,
    WorkspaceMemberResponse,
    WorkspaceResponse,
    WorkspaceUpdate,
)

router = APIRouter()


@router.get("", response_model=list[WorkspaceResponse])
async def list_workspaces(current_user: CurrentUser, db: DB) -> list[WorkspaceResponse]:
    result = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == current_user.id)
    )
    workspaces = result.scalars().all()
    return [WorkspaceResponse.model_validate(w) for w in workspaces]


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(body: WorkspaceCreate, current_user: CurrentUser, db: DB) -> WorkspaceResponse:
    existing = await db.execute(select(Workspace).where(Workspace.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug already taken")

    workspace = Workspace(name=body.name, slug=body.slug, owner_id=current_user.id)
    db.add(workspace)
    await db.flush()

    member = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=current_user.id,
        role=WorkspaceRole.owner,
    )
    db.add(member)
    return WorkspaceResponse.model_validate(workspace)


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(workspace_id: uuid.UUID, current_user: CurrentUser, db: DB) -> WorkspaceResponse:
    workspace = await _get_workspace_or_404(workspace_id, current_user.id, db)
    return WorkspaceResponse.model_validate(workspace)


@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: uuid.UUID, body: WorkspaceUpdate, current_user: CurrentUser, db: DB
) -> WorkspaceResponse:
    workspace = await _get_workspace_or_404(workspace_id, current_user.id, db, min_role=WorkspaceRole.owner)
    if body.name is not None:
        workspace.name = body.name
    return WorkspaceResponse.model_validate(workspace)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(workspace_id: uuid.UUID, current_user: CurrentUser, db: DB) -> None:
    workspace = await _get_workspace_or_404(workspace_id, current_user.id, db, min_role=WorkspaceRole.owner)
    await db.delete(workspace)


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberResponse])
async def list_members(workspace_id: uuid.UUID, current_user: CurrentUser, db: DB) -> list:
    await _get_workspace_or_404(workspace_id, current_user.id, db)
    result = await db.execute(
        select(WorkspaceMember)
        .options(selectinload(WorkspaceMember.user))
        .where(WorkspaceMember.workspace_id == workspace_id)
    )
    members = result.scalars().all()
    return [
        {
            "user_id": str(m.user_id),
            "workspace_id": str(m.workspace_id),
            "role": m.role,
            "user": {
                "id": str(m.user.id),
                "name": m.user.name,
                "email": m.user.email,
                "avatar_url": m.user.avatar_url,
            },
        }
        for m in members
    ]


@router.post("/{workspace_id}/invitations", status_code=status.HTTP_201_CREATED)
async def invite_member(
    workspace_id: uuid.UUID, body: InviteMemberRequest, current_user: CurrentUser, db: DB
) -> dict:
    await _get_workspace_or_404(workspace_id, current_user.id, db, min_role=WorkspaceRole.owner)

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User is already a member")

    db.add(WorkspaceMember(workspace_id=workspace_id, user_id=user.id, role=body.role))
    return {"ok": True}


async def _get_workspace_or_404(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    db: DB,
    min_role: WorkspaceRole = WorkspaceRole.viewer,
) -> Workspace:
    result = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(Workspace.id == workspace_id, WorkspaceMember.user_id == user_id)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace
