from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.memory import MemoryType


class MemoryCreate(BaseModel):
    memory_type: MemoryType
    content: str = Field(..., min_length=1)
    key: str | None = Field(None, max_length=500)
    importance: float | None = Field(None, ge=0.0, le=1.0)
    project_id: uuid.UUID | None = None
    thread_id: uuid.UUID | None = None
    meta: dict[str, Any] | None = None


class MemoryUpdate(BaseModel):
    content: str | None = Field(None, min_length=1)
    key: str | None = Field(None, max_length=500)
    importance: float | None = Field(None, ge=0.0, le=1.0)
    meta: dict[str, Any] | None = None


class MemoryRead(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    user_id: uuid.UUID
    project_id: uuid.UUID | None
    thread_id: uuid.UUID | None
    memory_type: MemoryType
    key: str | None
    content: str
    importance: str | None
    access_count: int
    meta: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
