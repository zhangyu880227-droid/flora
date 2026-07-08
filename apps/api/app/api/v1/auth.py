import re
import uuid as _uuid_module

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DB
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse, WorkspaceInfo

router = APIRouter()

COOKIE_OPTS = dict(httponly=True, samesite="lax", secure=False)  # secure=True in prod


def _make_slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "workspace"
    return f"{base}-{_uuid_module.uuid4().hex[:6]}"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, response: Response, db: DB) -> TokenResponse:
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        name=body.name,
    )
    db.add(user)
    await db.flush()

    # Auto-create personal workspace so the app is immediately usable
    workspace = Workspace(
        name=f"{body.name}'s Workspace",
        slug=_make_slug(body.name),
        owner_id=user.id,
    )
    db.add(workspace)
    await db.flush()

    db.add(WorkspaceMember(
        workspace_id=workspace.id,
        user_id=user.id,
        role=WorkspaceRole.owner,
    ))

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))

    response.set_cookie("access_token", access_token, max_age=30 * 60, **COOKIE_OPTS)
    response.set_cookie("refresh_token", refresh_token, max_age=30 * 24 * 3600, **COOKIE_OPTS)

    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
        workspace=WorkspaceInfo.model_validate(workspace),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, response: Response, db: DB) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))

    response.set_cookie("access_token", access_token, max_age=30 * 60, **COOKIE_OPTS)
    response.set_cookie("refresh_token", refresh_token, max_age=30 * 24 * 3600, **COOKIE_OPTS)

    # Return first workspace to initialize frontend state without an extra round-trip
    ws_result = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
        .limit(1)
    )
    first_workspace = ws_result.scalar_one_or_none()

    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
        workspace=WorkspaceInfo.model_validate(first_workspace) if first_workspace else None,
    )


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
async def me(current_user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(current_user)
