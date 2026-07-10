from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.agent import AgentExecutionStatus, AgentJobStatus


class AgentJobCreate(BaseModel):
    agent_type: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=500)
    goal: str = Field(..., min_length=1)
    input_data: dict[str, Any] = Field(default_factory=dict)


class AgentJobRead(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    user_id: uuid.UUID | None
    agent_type: str
    name: str
    goal: str
    input_data: dict[str, Any]
    status: AgentJobStatus
    result: dict[str, Any] | None
    error_message: str | None
    celery_task_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentExecutionRead(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    workspace_id: uuid.UUID
    status: AgentExecutionStatus
    attempt: int
    celery_task_id: str | None
    steps: list[dict[str, Any]]
    output: dict[str, Any] | None
    error_message: str | None
    duration_ms: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
