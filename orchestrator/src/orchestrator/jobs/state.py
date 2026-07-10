from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from ..comfy import ComfyClient
from ..errors import JobCancelled
from ..history.repo import GenerationRecord
from ..models import Job


class JobState(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    CANCELLED = "cancelled"
    FAILED = "failed"
    DONE = "done"


TERMINAL = {JobState.CANCELLED, JobState.FAILED, JobState.DONE}
RESUMABLE = {JobState.CANCELLED, JobState.FAILED}


@dataclass
class JobRecord:
    id: str
    project_id: str | None
    kind: str
    state: JobState
    spec: dict[str, Any]
    checkpoint: dict[str, Any]
    error: str | None
    created_at: str
    updated_at: str


def to_model(record: JobRecord) -> Job:
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


@dataclass(frozen=True)
class GenerationInputs:
    """What a handler hands back after a ComfyUI submission completes, mirroring
    the reproducibility fields the history schema stores verbatim. inputs/outputs
    are name -> blob hash (see JobContext.put_blob), never raw bytes.

    project_snapshot_hash is the handler's responsibility, not auto-derived: a
    fresh generation hashes the *current* project, while a reproduction must
    carry the *original* snapshot forward unchanged even if the project has
    since been edited.
    """

    prompt_id: str | None
    workflow: dict[str, Any]
    inputs: dict[str, str] = field(default_factory=dict[str, str])
    outputs: dict[str, str] = field(default_factory=dict[str, str])
    seeds: dict[str, Any] = field(default_factory=dict[str, Any])
    settings: dict[str, Any] = field(default_factory=dict[str, Any])
    model_hashes: dict[str, Any] = field(default_factory=dict[str, Any])
    environment: dict[str, Any] = field(default_factory=dict[str, Any])
    project_snapshot_hash: str | None = None
    parent_id: str | None = None


@dataclass
class JobContext:
    """What a handler is given: its inputs, a mutable checkpoint it must persist
    after every unit of work, the ComfyUI client, cooperative cancellation, and
    the history/blob primitives needed to record a reproducible generation."""

    job_id: str
    spec: dict[str, Any]
    checkpoint: dict[str, Any]
    comfy: ComfyClient
    emit: Callable[[dict[str, Any]], Awaitable[None]]
    save_checkpoint: Callable[[], Awaitable[None]]
    record_generation: Callable[[GenerationInputs], Awaitable[GenerationRecord]]
    put_blob: Callable[[bytes], Awaitable[str]]
    get_generation: Callable[[str], Awaitable[GenerationRecord | None]]
    is_cancelled: Callable[[], bool]

    def cancelled(self) -> bool:
        return self.is_cancelled()

    def check_cancelled(self) -> None:
        if self.is_cancelled():
            raise JobCancelled()
