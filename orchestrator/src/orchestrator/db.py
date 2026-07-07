from pathlib import Path

import aiosqlite

from .util import now_iso

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


async def connect(db_path: str) -> aiosqlite.Connection:
    conn = await aiosqlite.connect(db_path)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA foreign_keys = ON")
    await conn.execute("PRAGMA journal_mode = WAL")
    await migrate(conn)
    return conn


async def migrate(conn: aiosqlite.Connection) -> None:
    await conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        "version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    await conn.commit()

    cursor = await conn.execute("SELECT version FROM schema_migrations")
    applied = {row["version"] for row in await cursor.fetchall()}

    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.name in applied:
            continue
        await conn.executescript(path.read_text())
        await conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
            (path.name, now_iso()),
        )
        await conn.commit()
