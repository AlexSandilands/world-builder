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


async def test_gc_never_touches_blobs_outside_deleted_rows(tmp_path: Path) -> None:
    # Regression (PR #48 review, finding 1): GC used to full-scan the disk and
    # reclaim any blob absent from committed rows — including one a running
    # job had just written but not yet recorded. Candidates are now scoped to
    # the deleted rows' own refs, so an unrecorded blob is structurally
    # unreachable by GC.
    conn = await connect(str(tmp_path / "history.db"))
    blobs = BlobStore(tmp_path / "blobs")
    history = HistoryRepo(conn, blobs)
    projects = ProjectRepo(conn)
    project = await projects.create("Old Town", {})

    committed_hash = await blobs.put(b"committed-output")
    record = await history.create(
        job_id=None,
        project_id=project["id"],
        parent_id=None,
        prompt_id="p1",
        project_snapshot_hash=None,
        workflow={"step": 0},
        inputs={},
        outputs={"result": committed_hash},
        seeds={},
        settings={},
        model_hashes={},
        environment={},
    )

    inflight_hash = await history.put_blob("job-in-flight", b"fresh-unrecorded-mask")
    assert await history.delete(record.id) is True
    assert blobs.exists(inflight_hash)  # the in-flight blob survived the unrelated delete
    assert not blobs.exists(committed_hash)

    await conn.close()


async def test_gc_spares_digests_pinned_by_inflight_jobs(tmp_path: Path) -> None:
    # The dedupe-shared-digest case: a running reproduce job re-references the
    # source generation's blobs (pinning them, as JobQueue.get_generation
    # does); deleting the source row mid-run must not reclaim those blobs.
    conn = await connect(str(tmp_path / "history.db"))
    blobs = BlobStore(tmp_path / "blobs")
    history = HistoryRepo(conn, blobs)
    projects = ProjectRepo(conn)
    project = await projects.create("Old Town", {})
    project_id = project["id"]

    def make_row_kwargs(prompt_id: str, mask: str) -> dict[str, Any]:
        return {
            "job_id": None,
            "project_id": project_id,
            "parent_id": None,
            "prompt_id": prompt_id,
            "project_snapshot_hash": None,
            "workflow": {"step": 0},
            "inputs": {"mask": mask},
            "outputs": {},
            "seeds": {},
            "settings": {},
            "model_hashes": {},
            "environment": {},
        }

    shared_hash = await blobs.put(b"shared-mask")
    source = await history.create(**make_row_kwargs("p-source", shared_hash))

    history.pin("job-1", [shared_hash])
    assert await history.delete(source.id) is True
    assert blobs.exists(shared_hash)  # pinned: survives even though no row references it

    # The job commits its own row referencing the digest, then finishes (unpin).
    child = await history.create(**make_row_kwargs("p-child", shared_hash))
    history.unpin("job-1")
    assert await history.delete(child.id) is True
    assert not blobs.exists(shared_hash)  # unpinned and unreferenced: reclaimed

    await conn.close()


async def test_blob_store_sweeps_stale_tmp_files(tmp_path: Path) -> None:
    root = tmp_path / "blobs"
    (root / "ab").mkdir(parents=True)
    stray = root / "ab" / f"{'ab' * 32}.deadbeef.tmp"
    stray.write_bytes(b"half-written")
    BlobStore(root)
    assert not stray.exists()


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

                # Carry-forward of the non-workflow fields is asserted with
                # non-empty fixtures in test_reproduce_carries_forward_fields.
                for child in children:
                    detail = (await http.get(f"/api/generations/{child['id']}")).json()
                    assert json.dumps(detail["workflow"], sort_keys=True) == json.dumps(
                        source["workflow"], sort_keys=True
                    )

                # The fake ComfyUI's /prompt body is the ground truth for "byte-identical
                # submission": the original step-0 workflow was resubmitted verbatim twice.
                step0_submissions = [w for w in recorder.submissions if w == {"step": 0}]
                assert len(step0_submissions) == 3

                missing = await http.post("/api/generations/does-not-exist/reproduce")
                assert missing.status_code == 404


async def test_reproduce_carries_forward_fields(tmp_path: Path) -> None:
    # The source generation is seeded with a non-empty value in every
    # reproducibility field, so any dropped carry-forward fails loudly —
    # empty-vs-empty comparisons prove nothing.
    fake, recorder = make_fake_comfy(steps_per_prompt=1, delay=0.0)
    async with serve(fake) as comfy_port:
        app = create_app(settings=_settings(str(tmp_path / "history.db"), comfy_port))
        async with serve(app) as orch_port:
            async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{orch_port}") as http:
                project_data = {"regions": [{"id": "r1", "type": "district"}]}
                project = await http.post(
                    "/api/projects", json={"name": "Old Town", "data": project_data}
                )
                project_id = project.json()["id"]

                history_repo: HistoryRepo = app.state.history_repo
                mask_hash = await history_repo.blobs.put(b"segmentation-mask-bytes")
                snapshot_hash = sha256_json(project_data)
                source = await history_repo.create(
                    job_id=None,
                    project_id=project_id,
                    parent_id=None,
                    prompt_id="p-original",
                    project_snapshot_hash=snapshot_hash,
                    workflow={"step": 99},
                    inputs={"mask": mask_hash},
                    outputs={},
                    seeds={"pass1": 424242},
                    settings={"tile_size": 1024, "denoise": 0.45},
                    model_hashes={"checkpoint": "sha256:aaa", "controlnet": "sha256:bbb"},
                    environment={"comfy_commit": "deadbeef", "gpu": "RTX 4090"},
                )

                reproduced = await http.post(f"/api/generations/{source.id}/reproduce")
                assert reproduced.status_code == 201
                await _wait_state(http, reproduced.json()["id"], {"done"})

                children = [
                    g
                    for g in (await http.get(f"/api/projects/{project_id}/history")).json()
                    if g["parent_id"] == source.id
                ]
                assert len(children) == 1
                detail = (await http.get(f"/api/generations/{children[0]['id']}")).json()

                assert detail["workflow"] == {"step": 99}
                assert detail["inputs"] == {"mask": mask_hash}
                assert detail["seeds"] == {"pass1": 424242}
                assert detail["settings"] == {"tile_size": 1024, "denoise": 0.45}
                assert detail["model_hashes"] == {
                    "checkpoint": "sha256:aaa",
                    "controlnet": "sha256:bbb",
                }
                assert detail["environment"] == {"comfy_commit": "deadbeef", "gpu": "RTX 4090"}
                assert detail["project_snapshot_hash"] == snapshot_hash
                assert recorder.submissions[-1] == {"step": 99}


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

                # Digest param is constrained to 64 lowercase hex chars.
                assert (await http.get("/api/blobs/not-a-digest")).status_code == 422
                # Encoded-slash traversal: either unrouted (404) or rejected by
                # the pattern (422) — never resolved against the filesystem.
                assert (await http.get("/api/blobs/..%2Fescape")).status_code in {404, 422}
                assert (await http.get(f"/api/blobs/{'0' * 64}")).status_code == 404

                deleted = await http.delete(f"/api/generations/{generation_id}")
                assert deleted.status_code == 204
                assert (await http.get(f"/api/generations/{generation_id}")).status_code == 404
                assert (await http.delete(f"/api/generations/{generation_id}")).status_code == 404
