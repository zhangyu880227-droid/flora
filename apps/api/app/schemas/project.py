from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: str | None
    created_by: str | None
    source_count: int = 0

    model_config = {"from_attributes": True}
