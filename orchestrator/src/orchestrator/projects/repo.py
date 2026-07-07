from __future__ import annotations

import json
from typing import Any

import aiosqlite

from ..util import new_id, now_iso


def _row(row: aiosqlite.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "data": json.loads(row["data"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


class ProjectRepo:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self._conn = conn

    async def create(self, name: str, data: dict[str, Any]) -> dict[str, Any]:
        now = now_iso()
        project_id = new_id()
        await self._conn.execute(
            "INSERT INTO projects (id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (project_id, name, json.dumps(data), now, now),
        )
        await self._conn.commit()
        record = await self.get(project_id)
        assert record is not None
        return record

    async def get(self, project_id: str) -> dict[str, Any] | None:
        cursor = await self._conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
        row = await cursor.fetchone()
        return _row(row) if row is not None else None

    async def list(self) -> list[dict[str, Any]]:
        cursor = await self._conn.execute(
            "SELECT id, name, created_at, updated_at FROM projects ORDER BY created_at"
        )
        rows = await cursor.fetchall()
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]

    async def update(
        self, project_id: str, name: str | None, data: dict[str, Any] | None
    ) -> dict[str, Any] | None:
        current = await self.get(project_id)
        if current is None:
            return None
        new_name = name if name is not None else current["name"]
        new_data = data if data is not None else current["data"]
        await self._conn.execute(
            "UPDATE projects SET name = ?, data = ?, updated_at = ? WHERE id = ?",
            (new_name, json.dumps(new_data), now_iso(), project_id),
        )
        await self._conn.commit()
        return await self.get(project_id)

    async def delete(self, project_id: str) -> bool:
        cursor = await self._conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        await self._conn.commit()
        return cursor.rowcount > 0
