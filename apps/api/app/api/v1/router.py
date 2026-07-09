from fastapi import APIRouter

from app.api.v1 import auth, workspaces, projects, sources, collections, search, threads, insights, engine, knowledge

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(projects.router, prefix="", tags=["projects"])
api_router.include_router(sources.router, prefix="", tags=["sources"])
api_router.include_router(collections.router, prefix="", tags=["collections"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(threads.router, prefix="", tags=["threads"])
api_router.include_router(insights.router, prefix="", tags=["insights"])
api_router.include_router(engine.router, prefix="/engine", tags=["engine"])
api_router.include_router(knowledge.router, prefix="", tags=["knowledge"])
