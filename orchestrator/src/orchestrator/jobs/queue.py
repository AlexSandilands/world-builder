import asyncio
import contextlib
import logging
from typing import Any

from ..comfy import ComfyClient
from ..errors import JobCancelled
from .events import EventBus
from .handlers import get_handler
from .repo import JobRepo
from .state import JobContext, JobRecord, JobState

logger = logging.getLogger(__name__)


class JobQueue:
    """Serial, single-GPU job runner.

    Exactly one job executes at a time. Jobs left RUNNING by a crash are
    re-queued on startup and resume from their last checkpoint. Cancellation is
    cooperative: a flag the running handler observes between units of work.
    """

    def __init__(self, repo: JobRepo, events: EventBus, comfy: ComfyClient) -> None:
        self._repo = repo
        self._events = events
        self._comfy = comfy
        self._pending: asyncio.Queue[str] = asyncio.Queue()
        self._cancel_requested: set[str] = set()
        self._current: str | None = None
        self._worker: asyncio.Task[None] | None = None

    @property
    def idle(self) -> bool:
        return self._current is None and self._pending.empty()

    async def start(self) -> None:
        await self._recover()
        self._worker = asyncio.create_task(self._run())

    async def stop(self) -> None:
        # A running job is deliberately left in RUNNING state so a restart resumes it.
        if self._worker is not None:
            self._worker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._worker
            self._worker = None

    async def enqueue(self, record: JobRecord) -> None:
        await self._pending.put(record.id)

    async def request_cancel(self, job_id: str) -> JobRecord | None:
        record = await self._repo.get(job_id)
        if record is None:
            return None
        # The _current check must come first: between _execute picking a job up
        # and persisting RUNNING, its record still reads QUEUED — treating that
        # window as queued would mark it CANCELLED under a live handler.
        if job_id == self._current or record.state == JobState.RUNNING:
            self._cancel_requested.add(job_id)
            return await self._repo.get(job_id)
        if record.state == JobState.QUEUED:
            await self._repo.set_state(job_id, JobState.CANCELLED)
            await self._emit_state(job_id, JobState.CANCELLED)
            return await self._repo.get(job_id)
        return record

    async def resume(self, record: JobRecord) -> JobRecord:
        self._cancel_requested.discard(record.id)
        await self._repo.set_state(record.id, JobState.QUEUED)
        await self._pending.put(record.id)
        resumed = await self._repo.get(record.id)
        assert resumed is not None
        return resumed

    async def _recover(self) -> None:
        stranded = await self._repo.list_by_states([JobState.RUNNING, JobState.QUEUED])
        for record in stranded:
            if record.state == JobState.RUNNING:
                await self._repo.set_state(record.id, JobState.QUEUED)
            await self._pending.put(record.id)

    async def _run(self) -> None:
        while True:
            job_id = await self._pending.get()
            try:
                await self._execute(job_id)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("job %s crashed the worker loop", job_id)
            finally:
                self._pending.task_done()

    async def _execute(self, job_id: str) -> None:
        record = await self._repo.get(job_id)
        if record is None:
            return
        # Only QUEUED records may run. _pending can hold stale ids — a job
        # cancelled while queued, or one re-enqueued by resume and already
        # executed by an earlier entry — and none of those may re-enter RUNNING.
        if record.state != JobState.QUEUED:
            self._cancel_requested.discard(job_id)
            return
        if job_id in self._cancel_requested:
            self._cancel_requested.discard(job_id)
            await self._repo.set_state(job_id, JobState.CANCELLED)
            await self._emit_state(job_id, JobState.CANCELLED)
            return

        handler = get_handler(record.kind)
        if handler is None:
            await self._fail(job_id, f"unknown job kind: {record.kind}")
            return

        self._current = job_id
        await self._repo.set_state(job_id, JobState.RUNNING)
        await self._emit_state(job_id, JobState.RUNNING)
        try:
            await handler(self._make_context(record))
        except JobCancelled:
            await self._repo.set_state(job_id, JobState.CANCELLED)
            await self._emit_state(job_id, JobState.CANCELLED)
        except Exception as exc:
            await self._fail(job_id, str(exc))
        else:
            await self._repo.set_state(job_id, JobState.DONE)
            await self._emit_state(job_id, JobState.DONE)
        finally:
            self._cancel_requested.discard(job_id)
            self._current = None

    def _make_context(self, record: JobRecord) -> JobContext:
        async def save_checkpoint() -> None:
            await self._repo.save_checkpoint(record.id, record.checkpoint)

        async def record_generation(prompt_id: str, outputs: dict[str, Any]) -> None:
            await self._repo.add_generation(record.id, prompt_id, outputs)

        async def emit(event: dict[str, Any]) -> None:
            await self._events.publish(record.id, event)

        return JobContext(
            job_id=record.id,
            spec=record.spec,
            checkpoint=record.checkpoint,
            comfy=self._comfy,
            emit=emit,
            save_checkpoint=save_checkpoint,
            record_generation=record_generation,
            is_cancelled=lambda: record.id in self._cancel_requested,
        )

    async def _fail(self, job_id: str, error: str) -> None:
        await self._repo.set_state(job_id, JobState.FAILED, error=error)
        await self._emit_state(job_id, JobState.FAILED, error=error)

    async def _emit_state(self, job_id: str, state: JobState, *, error: str | None = None) -> None:
        await self._events.publish(job_id, {"type": "state", "state": state.value, "error": error})
