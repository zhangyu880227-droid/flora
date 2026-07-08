from typing import Annotated
from uuid import UUID

from fastapi import Cookie, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User
from app.models.workspace import WorkspaceMember, WorkspaceRole


async def get_current_user(
    access_token: Annotated[str | None, Cookie()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )
    if not access_token:
        raise credentials_exception
    try:
        payload = decode_token(access_token)
        if payload.get("type") != "access":
            raise credentials_exception
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await db.get(User, UUID(user_id))
    if user is None:
        raise credentials_exception
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


async def require_workspace_member(
    workspace_id: UUID,
    current_user: CurrentUser,
    db: DB,
    minimum_role: WorkspaceRole = WorkspaceRole.viewer,
) -> WorkspaceMember:
    from sqlalchemy import select

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a workspace member")

    role_order = {
        WorkspaceRole.viewer: 0,
        WorkspaceRole.editor: 1,
        WorkspaceRole.owner: 2,
    }
    if role_order[member.role] < role_order[minimum_role]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return member
