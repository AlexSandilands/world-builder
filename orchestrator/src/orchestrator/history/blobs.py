import asyncio
import hashlib
from pathlib import Path
from uuid import uuid4


class BlobStore:
    """Content-addressed blob storage on disk: sha256(bytes) -> file path,
    fanned out one directory level (first 2 hex chars) to avoid huge flat dirs.

    Writing identical bytes twice is a no-op after the first write, which is
    the dedupe guarantee masks/controls/outputs rely on across runs.
    """

    def __init__(self, root: Path) -> None:
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)

    def path_for(self, digest: str) -> Path:
        return self._root / digest[:2] / digest

    def exists(self, digest: str) -> bool:
        return self.path_for(digest).exists()

    async def put(self, data: bytes) -> str:
        digest = hashlib.sha256(data).hexdigest()
        await asyncio.to_thread(self._write, digest, data)
        return digest

    async def get(self, digest: str) -> bytes:
        return await asyncio.to_thread(self.path_for(digest).read_bytes)

    async def delete(self, digest: str) -> None:
        await asyncio.to_thread(self._delete, digest)

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
