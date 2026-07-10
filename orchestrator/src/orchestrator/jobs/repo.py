from __future__ import annotations

import json
from typing import Any

import aiosqlite

from ..util import new_id, now_iso
from .state import JobRecord, JobState


def _record(row: aiosqlite.Row) -> JobRecord:
    return JobRecord(
        id=row["id"],
        project_id=row["project_id"],
        kind=row["kind"],
        state=JobState(row["state"]),
        spec=json.loads(row["spec"]),
        checkpoint=json.loads(row["checkpoint"]),
        error=row["error"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


class JobRepo:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self._conn = conn

    async def create(self, kind: str, spec: dict[str, Any], project_id: str | None) -> JobRecord:
        now = now_iso()
        job_id = new_id()
        await self._conn.execute(
            "INSERT INTO jobs (id, project_id, kind, state, spec, checkpoint, "
            "created_at, updated_at) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)",
            (job_id, project_id, kind, JobState.QUEUED.value, json.dumps(spec), now, now),
        )
        await self._conn.commit()
        record = await self.get(job_id)
        assert record is not None
        return record

    async def get(self, job_id: str) -> JobRecord | None:
        cursor = await self._conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = await cursor.fetchone()
        return _record(row) if row is not None else None

    async def list(self) -> list[JobRecord]:
        cursor = await self._conn.execute("SELECT * FROM jobs ORDER BY created_at")
        return [_record(row) for row in await cursor.fetchall()]

    async def list_by_states(self, states: list[JobState]) -> list[JobRecord]:
        placeholders = ",".join("?" for _ in states)
        cursor = await self._conn.execute(
            f"SELECT * FROM jobs WHERE state IN ({placeholders}) ORDER BY created_at",
            [state.value for state in states],
        )
        return [_record(row) for row in await cursor.fetchall()]

    async def set_state(self, job_id: str, state: JobState, *, error: str | None = None) -> None:
        await self._conn.execute(
            "UPDATE jobs SET state = ?, error = ?, updated_at = ? WHERE id = ?",
            (state.value, error, now_iso(), job_id),
        )
        await self._conn.commit()

    async def save_checkpoint(self, job_id: str, checkpoint: dict[str, Any]) -> None:
        await self._conn.execute(
            "UPDATE jobs SET checkpoint = ?, updated_at = ? WHERE id = ?",
            (json.dumps(checkpoint), now_iso(), job_id),
        )
        await self._conn.commit()
