from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from ..comfy import ComfyClient
from ..errors import JobCancelled


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


@dataclass
class JobContext:
    """What a handler is given: its inputs, a mutable checkpoint it must persist
    after every unit of work, the ComfyUI client, and cooperative cancellation."""

    job_id: str
    spec: dict[str, Any]
    checkpoint: dict[str, Any]
    comfy: ComfyClient
    emit: Callable[[dict[str, Any]], Awaitable[None]]
    save_checkpoint: Callable[[], Awaitable[None]]
    record_generation: Callable[[str, dict[str, Any]], Awaitable[None]]
    is_cancelled: Callable[[], bool]

    def cancelled(self) -> bool:
        return self.is_cancelled()

    def check_cancelled(self) -> None:
        if self.is_cancelled():
            raise JobCancelled()
