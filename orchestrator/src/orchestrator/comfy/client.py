import asyncio
import json
from collections.abc import AsyncGenerator, AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import httpx
import websockets
from websockets.exceptions import WebSocketException

from ..errors import ComfyError
from ..util import new_id

_RETRYABLE = (httpx.TransportError, WebSocketException, OSError)


async def run_with_retry[T](
    call: Callable[[], Awaitable[T]], *, attempts: int, backoff_base: float
) -> T:
    """Retry a coroutine on connection loss with exponential backoff. Execution
    errors reported by ComfyUI are not connection failures and pass straight up."""
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return await call()
        except _RETRYABLE as exc:
            last = exc
            await asyncio.sleep(backoff_base * (2**attempt))
    raise ComfyError(f"ComfyUI unreachable after {attempts} attempts") from last


@dataclass(frozen=True)
class ProgressUpdate:
    value: int
    max: int
    node: str | None


@dataclass(frozen=True)
class WorkflowRun:
    prompt_id: str
    updates: AsyncIterator[ProgressUpdate]


class ComfyClient:
    """Single point of contact with ComfyUI.

    All calls retry with exponential backoff on connection loss; execution
    errors reported by ComfyUI surface as ComfyError and are not retried.
    """

    def __init__(
        self,
        http_url: str,
        ws_url: str,
        *,
        client_id: str | None = None,
        max_retries: int = 5,
        backoff_base: float = 0.1,
        timeout: float = 30.0,
    ) -> None:
        self._http_url = http_url.rstrip("/")
        self._ws_url = ws_url.rstrip("/")
        self._client_id = client_id or new_id()
        self._max_retries = max_retries
        self._backoff_base = backoff_base
        self._timeout = timeout
        self._http = httpx.AsyncClient(base_url=self._http_url, timeout=timeout)

    @property
    def client_id(self) -> str:
        return self._client_id

    @asynccontextmanager
    async def run_workflow(self, workflow: dict[str, Any]) -> AsyncGenerator[WorkflowRun, None]:
        """Submit a workflow with its progress stream already listening.

        The socket MUST be open before /prompt is sent: ComfyUI pushes events
        only to already-connected clients, so submit-then-connect drops early
        events and hangs forever on prompts that finish inside the gap.
        """
        uri = f"{self._ws_url}/ws?clientId={self._client_id}"
        connection = await self._retry(lambda: websockets.connect(uri, open_timeout=self._timeout))
        try:
            prompt_id = await self._submit(workflow)
            yield WorkflowRun(prompt_id=prompt_id, updates=self._stream(connection, prompt_id))
        finally:
            await connection.close()

    async def interrupt(self) -> None:
        async def call() -> None:
            resp = await self._http.post("/interrupt", json={"client_id": self._client_id})
            resp.raise_for_status()

        await self._retry(call)

    async def fetch_outputs(self, prompt_id: str) -> dict[str, Any]:
        async def call() -> dict[str, Any]:
            resp = await self._http.get(f"/history/{prompt_id}")
            resp.raise_for_status()
            entry: dict[str, Any] = resp.json().get(prompt_id, {})
            return entry.get("outputs", {})

        return await self._retry(call)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _submit(self, workflow: dict[str, Any]) -> str:
        async def call() -> str:
            resp = await self._http.post(
                "/prompt", json={"prompt": workflow, "client_id": self._client_id}
            )
            resp.raise_for_status()
            return str(resp.json()["prompt_id"])

        return await self._retry(call)

    async def _stream(
        self, connection: websockets.ClientConnection, prompt_id: str
    ) -> AsyncIterator[ProgressUpdate]:
        async for raw in connection:
            message: dict[str, Any] = json.loads(raw)
            data: dict[str, Any] = message.get("data") or {}
            if data.get("prompt_id") not in (None, prompt_id):
                continue
            kind = message.get("type")
            if kind == "progress":
                yield ProgressUpdate(
                    value=int(data.get("value", 0)),
                    max=int(data.get("max", 0)),
                    node=data.get("node"),
                )
            elif kind == "execution_error":
                raise ComfyError(data.get("exception_message", "ComfyUI execution error"))
            elif kind == "executing" and data.get("node") is None:
                return

    async def _retry[T](self, call: Callable[[], Awaitable[T]]) -> T:
        return await run_with_retry(
            call, attempts=self._max_retries, backoff_base=self._backoff_base
        )
