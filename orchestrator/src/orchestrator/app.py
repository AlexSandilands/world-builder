from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from .comfy import ComfyClient
from .config import Settings, load_settings
from .db import connect
from .jobs import handlers
from .jobs.events import EventBus
from .jobs.queue import JobQueue
from .jobs.repo import JobRepo
from .jobs.routes import router as jobs_router
from .projects.repo import ProjectRepo
from .projects.routes import router as projects_router

health_router = APIRouter()


@health_router.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings: Settings = app.state.settings
    conn = await connect(settings.db_path)
    comfy: ComfyClient = app.state.comfy_override or ComfyClient(
        settings.comfy_url, settings.comfy_ws_url
    )
    events = EventBus()
    jobs_repo = JobRepo(conn)
    queue = JobQueue(jobs_repo, events, comfy)

    app.state.db = conn
    app.state.comfy = comfy
    app.state.events = events
    app.state.projects_repo = ProjectRepo(conn)
    app.state.jobs_repo = jobs_repo
    app.state.queue = queue

    await queue.start()
    try:
        yield
    finally:
        await queue.stop()
        await comfy.aclose()
        await conn.close()


def create_app(settings: Settings | None = None, comfy: ComfyClient | None = None) -> FastAPI:
    _ = handlers  # importing registers the built-in job kinds
    app = FastAPI(title="World Builder orchestrator", lifespan=lifespan)
    app.state.settings = settings or load_settings()
    app.state.comfy_override = comfy
    app.include_router(health_router)
    app.include_router(projects_router)
    app.include_router(jobs_router)
    return app


app = create_app()
