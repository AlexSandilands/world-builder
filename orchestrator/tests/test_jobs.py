import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import websockets

from orchestrator.app import create_app
from orchestrator.config import Settings
from orchestrator.db import connect
from orchestrator.jobs.repo import JobRepo
from orchestrator.jobs.state import JobState

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
                assert resumed.status_code == 201 or resumed.status_code == 200

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
