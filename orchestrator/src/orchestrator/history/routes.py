from fastapi import APIRouter, HTTPException, Request, Response

from ..jobs.queue import JobQueue
from ..jobs.repo import JobRepo
from ..jobs.state import to_model as _job_to_model
from ..models import Generation, GenerationSummary, Job, PruneRequest, PruneResult
from .repo import GenerationRecord, HistoryRepo

router = APIRouter(tags=["history"])


def _repo(request: Request) -> HistoryRepo:
    return request.app.state.history_repo


def _jobs_repo(request: Request) -> JobRepo:
    return request.app.state.jobs_repo


def _queue(request: Request) -> JobQueue:
    return request.app.state.queue


def _to_summary(record: GenerationRecord) -> GenerationSummary:
    return GenerationSummary(
        id=record.id,
        job_id=record.job_id,
        project_id=record.project_id,
        parent_id=record.parent_id,
        prompt_id=record.prompt_id,
        created_at=record.created_at,
    )


def _to_detail(record: GenerationRecord) -> Generation:
    return Generation(
        **_to_summary(record).model_dump(),
        project_snapshot_hash=record.project_snapshot_hash,
        workflow=record.workflow,
        inputs=record.inputs,
        outputs=record.outputs,
        seeds=record.seeds,
        settings=record.settings,
        model_hashes=record.model_hashes,
        environment=record.environment,
    )


@router.get("/api/projects/{project_id}/history", response_model=list[GenerationSummary])
async def list_history(project_id: str, request: Request) -> list[GenerationSummary]:
    records = await _repo(request).list_for_project(project_id)
    return [_to_summary(record) for record in records]


@router.post("/api/projects/{project_id}/history/prune", response_model=PruneResult)
async def prune_history(project_id: str, body: PruneRequest, request: Request) -> PruneResult:
    deleted = await _repo(request).prune(project_id, body.keep)
    return PruneResult(deleted=deleted)


@router.get("/api/generations/{generation_id}", response_model=Generation)
async def get_generation(generation_id: str, request: Request) -> Generation:
    record = await _repo(request).get(generation_id)
    if record is None:
        raise HTTPException(status_code=404, detail="generation not found")
    return _to_detail(record)


@router.delete("/api/generations/{generation_id}", status_code=204)
async def delete_generation(generation_id: str, request: Request) -> Response:
    if not await _repo(request).delete(generation_id):
        raise HTTPException(status_code=404, detail="generation not found")
    return Response(status_code=204)


@router.get("/api/blobs/{digest}")
async def get_blob(digest: str, request: Request) -> Response:
    try:
        data = await _repo(request).blobs.get(digest)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="blob not found") from None
    return Response(content=data, media_type="application/octet-stream")


@router.post("/api/generations/{generation_id}/reproduce", response_model=Job, status_code=201)
async def reproduce_generation(generation_id: str, request: Request) -> Job:
    source = await _repo(request).get(generation_id)
    if source is None:
        raise HTTPException(status_code=404, detail="generation not found")
    spec = {"source_generation_id": source.id, "workflow": source.workflow}
    record = await _jobs_repo(request).create("reproduce", spec, source.project_id)
    await _queue(request).enqueue(record)
    return _job_to_model(record)
