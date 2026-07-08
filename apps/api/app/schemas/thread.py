from pydantic import BaseModel

from app.models.thread import MessageRole


class ThreadCreate(BaseModel):
    title: str | None = None


class ThreadResponse(BaseModel):
    id: str
    project_id: str
    title: str
    created_by: str | None
    message_count: int = 0

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    content: str
    collection_id: str | None = None


class CitedSource(BaseModel):
    source_id: str
    source_title: str
    chunk_id: str
    excerpt: str


class MessageResponse(BaseModel):
    id: str
    thread_id: str
    role: MessageRole
    content: str
    sources_cited: list[CitedSource]

    model_config = {"from_attributes": True}
