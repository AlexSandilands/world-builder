import asyncio
import json
from pathlib import Path
from typing import Any

import httpx

from orchestrator.app import create_app
from orchestrator.config import Settings
from orchestrator.db import connect
from orchestrator.history.blobs import BlobStore
from orchestrator.history.repo import HistoryRepo
from orchestrator.projects.repo import ProjectRepo
from orchestrator.util import sha256_json

from .fake_comfy import make_fake_comfy
from .harness import serve


def test_sha256_json_is_stable_across_key_order() -> None:
    # A project snapshot hash must not change just because a dict was rebuilt
    # with keys in a different order — same semantic content, same hash.
    a = {"regions": [{"id": "r1"}], "canvas": {"w": 100, "h": 200}}
    b = {"canvas": {"h": 200, "w": 100}, "regions": [{"id": "r1"}]}
    assert sha256_json(a) == sha256_json(b)
    assert sha256_json(a) != sha256_json({"regions": [], "canvas": {"w": 100, "h": 200}})


def _settings(db_path: str, comfy_port: int) -> Settings:
    return Settings(
        db_path=db_path,
        comfy_url=f"http://127.0.0.1:{comfy_port}",
        comfy_ws_url=f"ws://127.0.0.1:{comfy_port}",
        blob_root=str(Path(db_path).parent / "blobs"),
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


async def test_blob_store_dedupes_identical_content(tmp_path: Path) -> None:
    store = BlobStore(tmp_path / "blobs")
    first = await store.put(b"same bytes")
    second = await store.put(b"same bytes")
    assert first == second
    assert await store.list_digests() == [first]
    assert await store.get(first) == b"same bytes"


async def test_prune_keeps_recent_and_reclaims_orphaned_blobs(tmp_path: Path) -> None:
    conn = await connect(str(tmp_path / "history.db"))
    blobs = BlobStore(tmp_path / "blobs")
    history = HistoryRepo(conn, blobs)
    projects = ProjectRepo(conn)
    project = await projects.create("Old Town", {})
    project_id = project["id"]

    shared_hash = await blobs.put(b"shared-mask")
    old_only_hash = await blobs.put(b"old-only-output")
    assert len(await blobs.list_digests()) == 2

    old = await history.create(
        job_id=None,
        project_id=project_id,
        parent_id=None,
        prompt_id="p1",
        project_snapshot_hash=None,
        workflow={"step": 0},
        inputs={"mask": shared_hash},
        outputs={"result": old_only_hash},
        seeds={},
        settings={},
        model_hashes={},
        environment={},
    )
    await asyncio.sleep(0.01)  # force a distinct created_at so prune ordering is unambiguous
    kept = await history.create(
        job_id=None,
        project_id=project_id,
        parent_id=None,
        prompt_id="p2",
        project_snapshot_hash=None,
        workflow={"step": 1},
        inputs={"mask": shared_hash},
        outputs={},
        seeds={},
        settings={},
        model_hashes={},
        environment={},
    )

    deleted_ids = await history.prune(project_id, keep=1)
    assert deleted_ids == [old.id]
    assert await history.get(old.id) is None
    assert await history.get(kept.id) is not None

    remaining = set(await blobs.list_digests())
    assert old_only_hash not in remaining  # only the pruned row referenced it
    assert shared_hash in remaining  # the kept row still references it

    await conn.close()


async def test_delete_generation_reclaims_its_only_blob(tmp_path: Path) -> None:
    conn = await connect(str(tmp_path / "history.db"))
    blobs = BlobStore(tmp_path / "blobs")
    history = HistoryRepo(conn, blobs)
    projects = ProjectRepo(conn)
    project = await projects.create("Old Town", {})

    output_hash = await blobs.put(b"solo-output")
    record = await history.create(
        job_id=None,
        project_id=project["id"],
        parent_id=None,
        prompt_id="p1",
        project_snapshot_hash=None,
        workflow={"step": 0},
        inputs={},
        outputs={"result": output_hash},
        seeds={},
        settings={},
        model_hashes={},
        environment={},
    )

    assert await history.delete(record.id) is True
    assert await history.delete(record.id) is False  # already gone
    assert output_hash not in set(await blobs.list_digests())

    await conn.close()


async def test_reproduce_is_byte_identical_and_branches(tmp_path: Path) -> None:
    fake, recorder = make_fake_comfy(steps_per_prompt=1, delay=0.0)
    async with serve(fake) as comfy_port:
        app = create_app(settings=_settings(str(tmp_path / "history.db"), comfy_port))
        async with serve(app) as orch_port:
            async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{orch_port}") as http:
                project = await http.post(
                    "/api/projects", json={"name": "Old Town", "data": {"regions": []}}
                )
                project_id = project.json()["id"]

                created = await http.post(
                    "/api/jobs",
                    json={"kind": "demo", "spec": {"steps": 2}, "project_id": project_id},
                )
                await _wait_state(http, created.json()["id"], {"done"})

                history = (await http.get(f"/api/projects/{project_id}/history")).json()
                assert len(history) == 2
                source_id = history[0]["id"]
                source = (await http.get(f"/api/generations/{source_id}")).json()
                assert source["workflow"] == {"step": 0}

                # Two independent reproductions of the same source: a branch, not a chain.
                reproduce_1 = await http.post(f"/api/generations/{source_id}/reproduce")
                assert reproduce_1.status_code == 201
                await _wait_state(http, reproduce_1.json()["id"], {"done"})

                reproduce_2 = await http.post(f"/api/generations/{source_id}/reproduce")
                assert reproduce_2.status_code == 201
                await _wait_state(http, reproduce_2.json()["id"], {"done"})

                history_after = (await http.get(f"/api/projects/{project_id}/history")).json()
                assert len(history_after) == 4
                children = [g for g in history_after if g["parent_id"] == source_id]
                assert len(children) == 2
                assert {g["id"] for g in children}.isdisjoint({source_id})

                for child in children:
                    detail = (await http.get(f"/api/generations/{child['id']}")).json()
                    assert json.dumps(detail["workflow"], sort_keys=True) == json.dumps(
                        source["workflow"], sort_keys=True
                    )
                    assert detail["inputs"] == source["inputs"]
                    assert detail["project_snapshot_hash"] == source["project_snapshot_hash"]

                # The fake ComfyUI's /prompt body is the ground truth for "byte-identical
                # submission": the original step-0 workflow was resubmitted verbatim twice.
                step0_submissions = [w for w in recorder.submissions if w == {"step": 0}]
                assert len(step0_submissions) == 3

                missing = await http.post("/api/generations/does-not-exist/reproduce")
                assert missing.status_code == 404


async def test_delete_and_blob_endpoints(tmp_path: Path) -> None:
    fake, _ = make_fake_comfy(steps_per_prompt=1, delay=0.0)
    async with serve(fake) as comfy_port:
        app = create_app(settings=_settings(str(tmp_path / "history.db"), comfy_port))
        async with serve(app) as orch_port:
            async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{orch_port}") as http:
                project = await http.post("/api/projects", json={"name": "Old Town", "data": {}})
                project_id = project.json()["id"]
                created = await http.post(
                    "/api/jobs",
                    json={"kind": "demo", "spec": {"steps": 1}, "project_id": project_id},
                )
                await _wait_state(http, created.json()["id"], {"done"})

                history = (await http.get(f"/api/projects/{project_id}/history")).json()
                generation_id = history[0]["id"]
                detail = (await http.get(f"/api/generations/{generation_id}")).json()
                output_hash = detail["outputs"]["result"]

                blob = await http.get(f"/api/blobs/{output_hash}")
                assert blob.status_code == 200
                assert json.loads(blob.content) == {"images": [{"filename": "p1.png"}]}

                deleted = await http.delete(f"/api/generations/{generation_id}")
                assert deleted.status_code == 204
                assert (await http.get(f"/api/generations/{generation_id}")).status_code == 404
                assert (await http.delete(f"/api/generations/{generation_id}")).status_code == 404
