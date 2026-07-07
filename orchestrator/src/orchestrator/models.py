from typing import Any

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str
    data: dict[str, Any] = Field(default_factory=dict)


class ProjectUpdate(BaseModel):
    name: str | None = None
    data: dict[str, Any] | None = None


class ProjectSummary(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str


class Project(ProjectSummary):
    data: dict[str, Any]


class JobCreate(BaseModel):
    kind: str
    spec: dict[str, Any] = Field(default_factory=dict)
    project_id: str | None = None


class Job(BaseModel):
    id: str
    project_id: str | None
    kind: str
    state: str
    spec: dict[str, Any]
    checkpoint: dict[str, Any]
    error: str | None
    created_at: str
    updated_at: str
