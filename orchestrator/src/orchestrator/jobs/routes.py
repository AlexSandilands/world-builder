import contextlib

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect

from ..models import Job, JobCreate
from .events import EventBus
from .queue import JobQueue
from .repo import JobRepo
from .state import RESUMABLE, TERMINAL, JobRecord

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

_TERMINAL_VALUES = {state.value for state in TERMINAL}


def _repo(request: Request) -> JobRepo:
    return request.app.state.jobs_repo


def _queue(request: Request) -> JobQueue:
    return request.app.state.queue


def _to_model(record: JobRecord) -> Job:
    return Job(
        id=record.id,
        project_id=record.project_id,
        kind=record.kind,
        state=record.state.value,
        spec=record.spec,
        checkpoint=record.checkpoint,
        error=record.error,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.post("", response_model=Job, status_code=201)
async def create_job(body: JobCreate, request: Request) -> Job:
    record = await _repo(request).create(body.kind, body.spec, body.project_id)
    await _queue(request).enqueue(record)
    return _to_model(record)


@router.get("", response_model=list[Job])
async def list_jobs(request: Request) -> list[Job]:
    return [_to_model(record) for record in await _repo(request).list()]


@router.get("/{job_id}", response_model=Job)
async def get_job(job_id: str, request: Request) -> Job:
    record = await _repo(request).get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="job not found")
    return _to_model(record)


@router.post("/{job_id}/cancel", response_model=Job)
async def cancel_job(job_id: str, request: Request) -> Job:
    record = await _queue(request).request_cancel(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="job not found")
    return _to_model(record)


@router.post("/{job_id}/resume", response_model=Job)
async def resume_job(job_id: str, request: Request) -> Job:
    record = await _repo(request).get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="job not found")
    if record.state not in RESUMABLE:
        raise HTTPException(
            status_code=409, detail=f"job in state {record.state.value} is not resumable"
        )
    return _to_model(await _queue(request).resume(record))


@router.websocket("/{job_id}/events")
async def job_events(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()
    repo: JobRepo = websocket.app.state.jobs_repo
    events: EventBus = websocket.app.state.events

    record = await repo.get(job_id)
    if record is None:
        await websocket.send_json({"type": "error", "message": "job not found"})
        await websocket.close()
        return

    queue = events.subscribe(job_id)
    try:
        await websocket.send_json({"type": "snapshot", "job": _to_model(record).model_dump()})
        if record.state in TERMINAL:
            await websocket.send_json({"type": "state", "state": record.state.value})
            return
        while True:
            event = await queue.get()
            await websocket.send_json(event)
            if event.get("type") == "state" and event.get("state") in _TERMINAL_VALUES:
                return
    except WebSocketDisconnect:
        pass
    finally:
        events.unsubscribe(job_id, queue)
        with contextlib.suppress(RuntimeError):
            await websocket.close()
