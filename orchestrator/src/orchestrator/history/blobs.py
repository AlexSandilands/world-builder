import asyncio
import hashlib
from collections.abc import Callable
from pathlib import Path
from uuid import uuid4


class BlobStore:
    """Content-addressed blob storage on disk: sha256(bytes) -> file path,
    fanned out one directory level (first 2 hex chars) to avoid huge flat dirs.

    Writing identical bytes twice is a no-op after the first write, which is
    the dedupe guarantee masks/controls/outputs rely on across runs.

    put and delete_if serialise on one lock: a GC unlink and a concurrent
    write of the same digest must not interleave, or the file can vanish
    after a writer was told it exists (see HistoryRepo's GC contract).
    """

    def __init__(self, root: Path) -> None:
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        for stray in self._root.glob("*/*.tmp"):
            stray.unlink(missing_ok=True)

    @staticmethod
    def digest_of(data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()

    def path_for(self, digest: str) -> Path:
        return self._root / digest[:2] / digest

    def exists(self, digest: str) -> bool:
        return self.path_for(digest).exists()

    async def put(self, data: bytes) -> str:
        digest = self.digest_of(data)
        async with self._lock:
            await asyncio.to_thread(self._write, digest, data)
        return digest

    async def get(self, digest: str) -> bytes:
        return await asyncio.to_thread(self.path_for(digest).read_bytes)

    async def delete_if(self, digest: str, allowed: Callable[[], bool]) -> None:
        """Unlink unless `allowed` (evaluated under the write lock) vetoes it.
        The check must happen inside the lock so a pin taken just before a
        write is visible to any GC decision ordered against that write."""
        async with self._lock:
            if allowed():
                await asyncio.to_thread(self._delete, digest)

    async def delete(self, digest: str) -> None:
        await self.delete_if(digest, lambda: True)

    async def list_digests(self) -> list[str]:
        return await asyncio.to_thread(self._list_digests)

    def _list_digests(self) -> list[str]:
        return [path.name for path in self._root.glob("*/*") if not path.name.endswith(".tmp")]

    def _write(self, digest: str, data: bytes) -> None:
        path = self.path_for(digest)
        if path.exists():
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        # Write-then-rename so a crash mid-write never leaves a half-written
        # blob under its final, content-addressed name.
        tmp = path.parent / f"{digest}.{uuid4().hex}.tmp"
        tmp.write_bytes(data)
        tmp.replace(path)

    def _delete(self, digest: str) -> None:
        self.path_for(digest).unlink(missing_ok=True)
