from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import aiosqlite

from ..util import new_id, now_iso
from .blobs import BlobStore


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
    callers hash bytes into it themselves and pass the resulting refs here."""

    def __init__(self, conn: aiosqlite.Connection, blobs: BlobStore) -> None:
        self._conn = conn
        self.blobs = blobs

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
        """Delete one generation row and reclaim any blob it referenced that no
        other generation still points to. Children are re-parented to None
        rather than cascaded, so deleting a mid-tree node cannot silently drop
        its descendants' history."""
        cursor = await self._conn.execute("DELETE FROM generations WHERE id = ?", (generation_id,))
        await self._conn.commit()
        deleted = cursor.rowcount > 0
        if deleted:
            await self._gc_blobs()
        return deleted

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
            await self._gc_blobs()
        return ids

    async def _gc_blobs(self) -> None:
        cursor = await self._conn.execute("SELECT inputs, outputs FROM generations")
        referenced: set[str] = set()
        for row in await cursor.fetchall():
            referenced.update(json.loads(row["inputs"]).values())
            referenced.update(json.loads(row["outputs"]).values())
        for digest in await self.blobs.list_digests():
            if digest not in referenced:
                await self.blobs.delete(digest)
