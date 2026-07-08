import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DB
from app.models.project import Project
from app.models.source import Source
from app.models.workspace import WorkspaceMember
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate

router = APIRouter()


@router.get("/workspaces/{workspace_id}/projects", response_model=list[ProjectResponse])
async def list_projects(workspace_id: uuid.UUID, current_user: CurrentUser, db: DB) -> list:
    await _assert_member(workspace_id, current_user.id, db)
    result = await db.execute(
        select(Project).where(Project.workspace_id == workspace_id).order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()
    return [await _enrich(p, db) for p in projects]


@router.post(
    "/workspaces/{workspace_id}/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project(
    workspace_id: uuid.UUID, body: ProjectCreate, current_user: CurrentUser, db: DB
) -> ProjectResponse:
    await _assert_member(workspace_id, current_user.id, db)
    project = Project(
        workspace_id=workspace_id,
        name=body.name,
        description=body.description,
        created_by=current_user.id,
    )
    db.add(project)
    await db.flush()
    return await _enrich(project, db)


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: uuid.UUID, current_user: CurrentUser, db: DB) -> ProjectResponse:
    project = await _get_project_or_404(project_id, current_user.id, db)
    return await _enrich(project, db)


@router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID, body: ProjectUpdate, current_user: CurrentUser, db: DB
) -> ProjectResponse:
    project = await _get_project_or_404(project_id, current_user.id, db)
    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    return await _enrich(project, db)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: uuid.UUID, current_user: CurrentUser, db: DB) -> None:
    project = await _get_project_or_404(project_id, current_user.id, db)
    await db.delete(project)


async def _get_project_or_404(project_id: uuid.UUID, user_id: uuid.UUID, db: DB) -> Project:
    result = await db.execute(
        select(Project)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Project.workspace_id)
        .where(Project.id == project_id, WorkspaceMember.user_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _assert_member(workspace_id: uuid.UUID, user_id: uuid.UUID, db: DB) -> None:
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a workspace member")


async def _enrich(project: Project, db: DB) -> ProjectResponse:
    count_result = await db.execute(
        select(func.count()).select_from(Source).where(Source.project_id == project.id)
    )
    count = count_result.scalar_one()
    data = ProjectResponse.model_validate(project)
    data.source_count = count
    return data
