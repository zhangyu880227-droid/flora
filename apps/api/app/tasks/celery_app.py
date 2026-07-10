from celery import Celery
from celery.schedules import schedule

from app.core.config import settings

celery_app = Celery(
    "flora",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.tasks.ingestion",
        "app.tasks.engine_task",
        "app.tasks.knowledge_tasks",
        "app.tasks.memory_tasks",
        "app.tasks.agent_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,          # tasks survive worker restart
    worker_prefetch_multiplier=1,
    beat_schedule={
        # Self-Improvement Engine: scan codebase every 30 minutes
        "flora-self-improvement-engine": {
            "task": "app.tasks.engine_task.run_engine",
            "schedule": schedule(run_every=1800),
            "options": {"expires": 1700},
        },
        # Self-Improvement Loop: collect → graph → gaps → atlas every 30 minutes
        # Replaces the old run_knowledge_pipeline beat entry.
        "flora-self-improvement-loop": {
            "task": "app.tasks.knowledge_tasks.run_self_improvement_loop",
            "schedule": schedule(run_every=1800),
            "options": {"expires": 1700},
        },
        # Memory Engine: consolidate + prune + tag every 2 hours
        "flora-memory-engine": {
            "task": "app.tasks.memory_tasks.run_memory_engine",
            "schedule": schedule(run_every=7200),
            "options": {"expires": 7100},
        },
    },
)
