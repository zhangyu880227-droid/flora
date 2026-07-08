from pydantic import BaseModel

from app.models.source import SourceStatus, SourceType


class SourceCreate(BaseModel):
    type: SourceType
    url: str | None = None
    title: str | None = None


class SourceResponse(BaseModel):
    id: str
    project_id: str
    type: SourceType
    title: str
    url: str | None
    file_path: str | None
    status: SourceStatus
    error_message: str | None
    created_by: str | None
    chunk_count: int = 0

    model_config = {"from_attributes": True}


class CollectionCreate(BaseModel):
    name: str
    description: str | None = None


class CollectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class CollectionResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: str | None
    source_count: int = 0

    model_config = {"from_attributes": True}


class AddSourceToCollectionRequest(BaseModel):
    source_id: str
