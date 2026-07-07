from fastapi import APIRouter, HTTPException, Request, Response

from ..models import Project, ProjectCreate, ProjectSummary, ProjectUpdate
from .repo import ProjectRepo

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _repo(request: Request) -> ProjectRepo:
    return request.app.state.projects_repo


@router.post("", response_model=Project, status_code=201)
async def create_project(body: ProjectCreate, request: Request) -> Project:
    record = await _repo(request).create(body.name, body.data)
    return Project(**record)


@router.get("", response_model=list[ProjectSummary])
async def list_projects(request: Request) -> list[ProjectSummary]:
    return [ProjectSummary(**row) for row in await _repo(request).list()]


@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: str, request: Request) -> Project:
    record = await _repo(request).get(project_id)
    if record is None:
        raise HTTPException(status_code=404, detail="project not found")
    return Project(**record)


@router.put("/{project_id}", response_model=Project)
async def update_project(project_id: str, body: ProjectUpdate, request: Request) -> Project:
    record = await _repo(request).update(project_id, body.name, body.data)
    if record is None:
        raise HTTPException(status_code=404, detail="project not found")
    return Project(**record)


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, request: Request) -> Response:
    if not await _repo(request).delete(project_id):
        raise HTTPException(status_code=404, detail="project not found")
    return Response(status_code=204)
