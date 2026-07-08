import json
import uuid

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DB
from app.models.project import Project
from app.models.thread import Message, MessageRole, Thread
from app.models.workspace import WorkspaceMember
from app.schemas.thread import MessageCreate, MessageResponse, ThreadCreate, ThreadResponse
from app.services.ai import stream_response
from app.services.search import hybrid_search

router = APIRouter()


@router.get("/projects/{project_id}/threads", response_model=list[ThreadResponse])
async def list_threads(project_id: uuid.UUID, current_user: CurrentUser, db: DB) -> list:
    await _assert_project_access(project_id, current_user.id, db)
    result = await db.execute(
        select(Thread).where(Thread.project_id == project_id).order_by(Thread.updated_at.desc())
    )
    threads = result.scalars().all()
    return [await _enrich_thread(t, db) for t in threads]


@router.post("/projects/{project_id}/threads", response_model=ThreadResponse, status_code=status.HTTP_201_CREATED)
async def create_thread(
    project_id: uuid.UUID, body: ThreadCreate, current_user: CurrentUser, db: DB
) -> ThreadResponse:
    await _assert_project_access(project_id, current_user.id, db)
    thread = Thread(
        project_id=project_id,
        title=body.title or "New Thread",
        created_by=current_user.id,
    )
    db.add(thread)
    await db.flush()
    return await _enrich_thread(thread, db)


@router.get("/threads/{thread_id}", response_model=ThreadResponse)
async def get_thread(thread_id: uuid.UUID, current_user: CurrentUser, db: DB) -> ThreadResponse:
    thread = await _get_thread_or_403(thread_id, current_user.id, db)
    return await _enrich_thread(thread, db)


@router.get("/threads/{thread_id}/messages", response_model=list[MessageResponse])
async def list_messages(thread_id: uuid.UUID, current_user: CurrentUser, db: DB) -> list:
    thread = await _get_thread_or_403(thread_id, current_user.id, db)
    result = await db.execute(
        select(Message).where(Message.thread_id == thread_id).order_by(Message.created_at)
    )
    messages = result.scalars().all()
    return [MessageResponse.model_validate(m) for m in messages]


@router.post("/threads/{thread_id}/messages")
async def send_message(
    thread_id: uuid.UUID, body: MessageCreate, current_user: CurrentUser, db: DB
) -> StreamingResponse:
    thread = await _get_thread_or_403(thread_id, current_user.id, db)

    # Persist user message
    user_msg = Message(thread_id=thread_id, role=MessageRole.user, content=body.content)
    db.add(user_msg)
    await db.commit()

    # Load conversation history (last 10 turns for context window)
    history_result = await db.execute(
        select(Message)
        .where(Message.thread_id == thread_id, Message.id != user_msg.id)
        .order_by(Message.created_at.desc())
        .limit(10)
    )
    history = [
        {"role": m.role.value, "content": m.content}
        for m in reversed(history_result.scalars().all())
    ]

    # Retrieve relevant chunks
    collection_id = uuid.UUID(body.collection_id) if body.collection_id else None
    search_results = await hybrid_search(
        query=body.content,
        project_id=thread.project_id,
        db=db,
        collection_id=collection_id,
    )

    cited_sources = [
        {"source_id": r.source_id, "source_title": r.source_title, "chunk_id": r.chunk_id, "excerpt": r.content[:200]}
        for r in search_results
    ]

    async def generate():
        full_response = []
        async for token in stream_response(body.content, search_results, history):
            full_response.append(token)
            yield f"data: {json.dumps({'token': token})}\n\n"

        # Persist complete assistant message
        from app.db.session import AsyncSessionLocal
        async with AsyncSessionLocal() as persist_db:
            assistant_msg = Message(
                thread_id=thread_id,
                role=MessageRole.assistant,
                content="".join(full_response),
                sources_cited=cited_sources,
            )
            persist_db.add(assistant_msg)
            await persist_db.commit()

        yield f"data: {json.dumps({'done': True, 'sources': cited_sources})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


async def _assert_project_access(project_id: uuid.UUID, user_id: uuid.UUID, db: DB) -> None:
    result = await db.execute(
        select(Project)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Project.workspace_id)
        .where(Project.id == project_id, WorkspaceMember.user_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Project not found")


async def _get_thread_or_403(thread_id: uuid.UUID, user_id: uuid.UUID, db: DB) -> Thread:
    result = await db.execute(
        select(Thread)
        .join(Project, Project.id == Thread.project_id)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Project.workspace_id)
        .where(Thread.id == thread_id, WorkspaceMember.user_id == user_id)
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


async def _enrich_thread(thread: Thread, db: DB) -> ThreadResponse:
    count_result = await db.execute(
        select(func.count()).select_from(Message).where(Message.thread_id == thread.id)
    )
    data = ThreadResponse.model_validate(thread)
    data.message_count = count_result.scalar_one()
    return data
