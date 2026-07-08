from pydantic import BaseModel


class InsightGenerateRequest(BaseModel):
    title: str
    source_ids: list[str]
    prompt: str | None = None


class InsightResponse(BaseModel):
    id: str
    project_id: str
    title: str
    content: str
    sources: list[dict]

    model_config = {"from_attributes": True}
