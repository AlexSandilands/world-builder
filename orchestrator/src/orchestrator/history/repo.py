from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import aiosqlite

from ..util import new_id, now_iso
from .blobs import BlobStore


def _blob_refs(record: GenerationRecord) -> set[str]:
    return set(record.inputs.values()) | set(record.outputs.values())


@dataclass(frozen=True)
class GenerationRecord:
    id: str
    job_id: str | None
    project_id: str | None
    parent_id: str | None
    prompt_id: str | None
    project_snapshot_hash: str | None
    workflow: dict[str, Any]
    inputs: dict[str, str]
    outputs: dict[str, str]
    seeds: dict[str, Any]
    settings: dict[str, Any]
    model_hashes: dict[str, Any]
    environment: dict[str, Any]
    created_at: str


def _record(row: aiosqlite.Row) -> GenerationRecord:
    return GenerationRecord(
        id=row["id"],
        job_id=row["job_id"],
        project_id=row["project_id"],
        parent_id=row["parent_id"],
        prompt_id=row["prompt_id"],
        project_snapshot_hash=row["project_snapshot_hash"],
        workflow=json.loads(row["workflow"]),
        inputs=json.loads(row["inputs"]),
        outputs=json.loads(row["outputs"]),
        seeds=json.loads(row["seeds"]),
        settings=json.loads(row["settings"]),
        model_hashes=json.loads(row["model_hashes"]),
        environment=json.loads(row["environment"]),
        created_at=row["created_at"],
    )


class HistoryRepo:
    """Generation history: DB rows hold hashes/metadata only, never blob bytes
    (see docs/guidelines/python.md). `blobs` is the sole owner of file content;
    callers hash bytes into it themselves and pass the resulting refs here.

    Blob GC safety: a blob is reclaimable only if it (a) was referenced by a
    row being deleted right now, (b) is referenced by no surviving row, and
    (c) is not pinned by an in-flight job. Restricting candidates to (a) means
    a blob a running job just wrote — visible on disk, not yet in any row —
    can never be collected out from under it; pins cover the remaining hole,
    where a job re-references digests from an existing generation (reproduce)
    that gets deleted mid-run. Cost: a blob orphaned by a crash between
    put_blob and record_generation is never reclaimed — leaked disk, not a
    corrupted record, which is the right side of the trade.
    """

    def __init__(self, conn: aiosqlite.Connection, blobs: BlobStore) -> None:
        self._conn = conn
        self.blobs = blobs
        self._pins: dict[str, set[str]] = {}

    def pin(self, owner_id: str, digests: Iterable[str]) -> None:
        self._pins.setdefault(owner_id, set()).update(digests)

    def unpin(self, owner_id: str) -> None:
        self._pins.pop(owner_id, None)

    async def put_blob(self, owner_id: str, data: bytes) -> str:
        """Write a blob pinned to `owner_id`. The pin lands before the write:
        GC re-checks pins under the blob store's write lock, so once this
        returns the file cannot be unlinked until the owner unpins — even if
        the digest collides (dedupe) with one a concurrent delete is reclaiming.
        """
        digest = BlobStore.digest_of(data)
        self.pin(owner_id, [digest])
        return await self.blobs.put(data)

    def _pinned(self) -> set[str]:
        pinned: set[str] = set()
        for digests in self._pins.values():
            pinned |= digests
        return pinned

    async def create(
        self,
        *,
        job_id: str | None,
        project_id: str | None,
        parent_id: str | None,
        prompt_id: str | None,
        project_snapshot_hash: str | None,
        workflow: dict[str, Any],
        inputs: dict[str, str],
        outputs: dict[str, str],
        seeds: dict[str, Any],
        settings: dict[str, Any],
        model_hashes: dict[str, Any],
        environment: dict[str, Any],
    ) -> GenerationRecord:
        generation_id = new_id()
        await self._conn.execute(
            "INSERT INTO generations (id, job_id, project_id, parent_id, prompt_id, "
            "project_snapshot_hash, workflow, inputs, outputs, seeds, settings, "
            "model_hashes, environment, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                generation_id,
                job_id,
                project_id,
                parent_id,
                prompt_id,
                project_snapshot_hash,
                json.dumps(workflow),
                json.dumps(inputs),
                json.dumps(outputs),
                json.dumps(seeds),
                json.dumps(settings),
                json.dumps(model_hashes),
                json.dumps(environment),
                now_iso(),
            ),
        )
        await self._conn.commit()
        record = await self.get(generation_id)
        assert record is not None
        return record

    async def get(self, generation_id: str) -> GenerationRecord | None:
        cursor = await self._conn.execute(
            "SELECT * FROM generations WHERE id = ?", (generation_id,)
        )
        row = await cursor.fetchone()
        return _record(row) if row is not None else None

    async def list_for_project(self, project_id: str) -> list[GenerationRecord]:
        cursor = await self._conn.execute(
            "SELECT * FROM generations WHERE project_id = ? ORDER BY created_at", (project_id,)
        )
        return [_record(row) for row in await cursor.fetchall()]

    async def children(self, generation_id: str) -> list[GenerationRecord]:
        cursor = await self._conn.execute(
            "SELECT * FROM generations WHERE parent_id = ? ORDER BY created_at", (generation_id,)
        )
        return [_record(row) for row in await cursor.fetchall()]

    async def delete(self, generation_id: str) -> bool:
        """Delete one generation row and reclaim its now-unreferenced, unpinned
        blobs. Children are re-parented to None rather than cascaded, so
        deleting a mid-tree node cannot silently drop its descendants' history."""
        record = await self.get(generation_id)
        if record is None:
            return False
        await self._conn.execute("DELETE FROM generations WHERE id = ?", (generation_id,))
        await self._conn.commit()
        await self._gc_blobs(_blob_refs(record))
        return True

    async def prune(self, project_id: str, keep: int) -> list[str]:
        """Delete all but the `keep` most recent generations for a project,
        then reclaim orphaned blobs. Returns the deleted ids."""
        records = await self.list_for_project(project_id)
        to_delete = records if keep <= 0 else records[:-keep] if keep < len(records) else []
        ids = [record.id for record in to_delete]
        if ids:
            placeholders = ",".join("?" for _ in ids)
            await self._conn.execute(f"DELETE FROM generations WHERE id IN ({placeholders})", ids)
            await self._conn.commit()
            candidates: set[str] = set()
            for record in to_delete:
                candidates |= _blob_refs(record)
            await self._gc_blobs(candidates)
        return ids

    async def _gc_blobs(self, candidates: set[str]) -> None:
        candidates = candidates - self._pinned()
        if not candidates:
            return
        cursor = await self._conn.execute("SELECT inputs, outputs FROM generations")
        for row in await cursor.fetchall():
            candidates -= set(json.loads(row["inputs"]).values())
            candidates -= set(json.loads(row["outputs"]).values())
            if not candidates:
                return
        for digest in candidates:
            # Pins are re-checked per unlink, under the blob write lock: a job
            # may have pinned this digest while the scan above was awaiting.
            await self.blobs.delete_if(digest, lambda d=digest: d not in self._pinned())
