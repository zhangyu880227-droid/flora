import uuid

from fastapi import APIRouter, HTTPException

from app.core.deps import CurrentUser, DB
from app.models.project import Project
from app.models.workspace import WorkspaceMember
from app.schemas.search import SearchRequest, SearchResponse
from app.services.search import hybrid_search
from sqlalchemy import select

router = APIRouter()


@router.post("", response_model=SearchResponse)
async def search(body: SearchRequest, current_user: CurrentUser, db: DB) -> SearchResponse:
    project_id = uuid.UUID(body.project_id)
    result = await db.execute(
        select(Project)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Project.workspace_id)
        .where(Project.id == project_id, WorkspaceMember.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Project not found or access denied")

    collection_id = uuid.UUID(body.collection_id) if body.collection_id else None
    results = await hybrid_search(
        query=body.query,
        project_id=project_id,
        db=db,
        collection_id=collection_id,
        limit=body.limit,
    )
    return SearchResponse(results=results, query=body.query, total_results=len(results))
