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


class GenerationSummary(BaseModel):
    id: str
    job_id: str | None
    project_id: str | None
    parent_id: str | None
    prompt_id: str | None
    created_at: str


class Generation(GenerationSummary):
    project_snapshot_hash: str | None
    workflow: dict[str, Any]
    inputs: dict[str, str]
    outputs: dict[str, str]
    seeds: dict[str, Any]
    settings: dict[str, Any]
    model_hashes: dict[str, Any]
    environment: dict[str, Any]


class PruneRequest(BaseModel):
    keep: int = Field(ge=0)


class PruneResult(BaseModel):
    deleted: list[str]
