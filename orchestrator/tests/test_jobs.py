import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import websockets

from orchestrator.app import create_app
from orchestrator.comfy import ComfyClient
from orchestrator.config import Settings
from orchestrator.db import connect
from orchestrator.jobs import handlers
from orchestrator.jobs.events import EventBus
from orchestrator.jobs.queue import JobQueue
from orchestrator.jobs.repo import JobRepo
from orchestrator.jobs.state import JobContext, JobState

from .fake_comfy import make_fake_comfy
from .harness import serve


def _settings(db_path: str, comfy_port: int) -> Settings:
    return Settings(
        db_path=db_path,
        comfy_url=f"http://127.0.0.1:{comfy_port}",
        comfy_ws_url=f"ws://127.0.0.1:{comfy_port}",
    )


async def _wait_state(
    http: httpx.AsyncClient, job_id: str, targets: set[str], timeout: float = 5.0
) -> dict[str, Any]:
    deadline = asyncio.get_event_loop().time() + timeout
    while True:
        body = (await http.get(f"/api/jobs/{job_id}")).json()
        if body["state"] in targets:
            return body
        if asyncio.get_event_loop().time() > deadline:
            raise AssertionError(f"state {body['state']} never reached {targets}")
        await asyncio.sleep(0.02)


async def test_enqueue_progress_cancel_resume(tmp_path: Path) -> None:
    fake, recorder = make_fake_comfy(steps_per_prompt=3, delay=0.03)
    async with serve(fake) as comfy_port:
        app = create_app(settings=_settings(str(tmp_path / "jobs.db"), comfy_port))
        async with serve(app) as orch_port:
            base = f"http://127.0.0.1:{orch_port}"
            ws_base = f"ws://127.0.0.1:{orch_port}"
            async with httpx.AsyncClient(base_url=base) as http:
                created = await http.post("/api/jobs", json={"kind": "demo", "spec": {"steps": 5}})
                assert created.status_code == 201
                job_id = created.json()["id"]

                progress_seen = False
                async with websockets.connect(f"{ws_base}/api/jobs/{job_id}/events") as ws:
                    snapshot = json.loads(await ws.recv())
                    assert snapshot["type"] == "snapshot"
                    assert snapshot["job"]["id"] == job_id
                    while True:
                        event = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                        if event["type"] == "progress":
                            progress_seen = True
                        if event["type"] == "step":
                            break
                    assert progress_seen
                    cancel = await http.post(f"/api/jobs/{job_id}/cancel")
                    assert cancel.status_code == 200

                cancelled = await _wait_state(http, job_id, {"cancelled"})
                done_before = cancelled["checkpoint"]["completed"]
                assert 1 <= done_before < 5

                resumed = await http.post(f"/api/jobs/{job_id}/resume")
                assert resumed.status_code == 200

                finished = await _wait_state(http, job_id, {"done"})
                assert finished["checkpoint"]["completed"] == 5

                steps = recorder.submitted_steps
                assert set(steps) == {0, 1, 2, 3, 4}
                # Resuming continued from the checkpoint; earlier steps were not redone.
                assert steps.count(0) == 1


async def test_crash_recovery_resumes_from_checkpoint(tmp_path: Path) -> None:
    db_path = str(tmp_path / "recover.db")
    conn = await connect(db_path)
    repo = JobRepo(conn)
    record = await repo.create("demo", {"steps": 4}, None)
    await repo.set_state(record.id, JobState.RUNNING)
    await repo.save_checkpoint(record.id, {"completed": 2})
    await conn.close()

    fake, recorder = make_fake_comfy(steps_per_prompt=1, delay=0.0)
    async with serve(fake) as comfy_port:
        app = create_app(settings=_settings(db_path, comfy_port))
        async with serve(app) as orch_port:
            async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{orch_port}") as http:
                finished = await _wait_state(http, record.id, {"done"})
                assert finished["checkpoint"]["completed"] == 4

    # Only the two unfinished steps ran; the checkpointed prefix was not repeated.
    assert recorder.submitted_steps == [2, 3]


async def test_cancel_while_queued_then_resume_runs_once(tmp_path: Path) -> None:
    # Regression: a job cancelled while queued leaves a stale id in _pending;
    # resuming re-enqueues it (and _recover adds a third entry on start). Only
    # one of those entries may execute the handler — a DONE job must never
    # re-enter RUNNING off a stale entry.
    conn = await connect(str(tmp_path / "requeue.db"))
    repo = JobRepo(conn)
    comfy = ComfyClient("http://127.0.0.1:1", "ws://127.0.0.1:1")
    queue = JobQueue(repo, EventBus(), comfy)

    executions: list[str] = []

    async def counting_handler(ctx: JobContext) -> None:
        executions.append(ctx.job_id)

    handlers.register("counting-test", counting_handler)
    try:
        record = await repo.create("counting-test", {}, None)
        await queue.enqueue(record)
        cancelled = await queue.request_cancel(record.id)
        assert cancelled is not None and cancelled.state == JobState.CANCELLED
        await queue.resume(record)
        await queue.start()

        deadline = asyncio.get_event_loop().time() + 5
        while True:
            current = await repo.get(record.id)
            assert current is not None
            if current.state == JobState.DONE and queue.idle:
                break
            assert asyncio.get_event_loop().time() < deadline, current.state
            await asyncio.sleep(0.02)

        assert executions == [record.id]
        final = await repo.get(record.id)
        assert final is not None and final.state == JobState.DONE
    finally:
        await queue.stop()
        await comfy.aclose()
        await conn.close()


async def test_unknown_kind_fails(tmp_path: Path) -> None:
    fake, _ = make_fake_comfy()
    async with serve(fake) as comfy_port:
        app = create_app(settings=_settings(str(tmp_path / "unknown.db"), comfy_port))
        async with serve(app) as orch_port:
            async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{orch_port}") as http:
                created = await http.post("/api/jobs", json={"kind": "nope", "spec": {}})
                job_id = created.json()["id"]
                failed = await _wait_state(http, job_id, {"failed"})
                assert "unknown job kind" in failed["error"]
