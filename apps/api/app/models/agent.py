"""Agent Framework models — Jobs, Executions, and registered Tools."""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class AgentJobStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class AgentExecutionStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    retrying = "retrying"


class AgentJob(Base, UUIDMixin, TimestampMixin):
    """A high-level agent job created by a user or the system.

    One job may spawn multiple executions (retries or parallel sub-tasks).
    """
    __tablename__ = "agent_jobs"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Agent type: research | summarize | extract_entities | kg_build | custom
    agent_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # Human-readable job name
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    # Freeform goal / instruction for the agent
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    # Input data / context (project_ids, source_ids, query string, etc.)
    input_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    status: Mapped[AgentJobStatus] = mapped_column(
        String(20), nullable=False, default=AgentJobStatus.pending, index=True
    )
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Celery task ID of the most recent execution
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    executions: Mapped[list["AgentExecution"]] = relationship(
        "AgentExecution", back_populates="job", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"AgentJob(id={self.id}, type={self.agent_type}, status={self.status})"


class AgentExecution(Base, UUIDMixin, TimestampMixin):
    """A single execution attempt of an AgentJob.

    Stores the step-by-step execution log (tool calls, LLM outputs, etc.)
    """
    __tablename__ = "agent_executions"

    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[AgentExecutionStatus] = mapped_column(
        String(20), nullable=False, default=AgentExecutionStatus.queued, index=True
    )
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Structured execution log: list of {"step", "tool", "input", "output", "ts"}
    steps: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # Final output of this execution attempt
    output: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    job: Mapped["AgentJob"] = relationship("AgentJob", back_populates="executions")

    def __repr__(self) -> str:
        return (
            f"AgentExecution(id={self.id}, job={self.job_id}, "
            f"attempt={self.attempt}, status={self.status})"
        )
