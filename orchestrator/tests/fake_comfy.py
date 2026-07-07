import asyncio
import contextlib
from dataclasses import dataclass, field
from typing import Any

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect


@dataclass
class Recorder:
    submissions: list[dict[str, Any]] = field(default_factory=list)
    interrupts: int = 0

    @property
    def submitted_steps(self) -> list[int]:
        return [w["step"] for w in self.submissions if "step" in w]


def make_fake_comfy(*, steps_per_prompt: int = 2, delay: float = 0.02) -> tuple[FastAPI, Recorder]:
    """A stand-in for ComfyUI: records submissions, streams scripted progress
    over WS, and honours /interrupt by stopping the stream without a completion
    event.

    Like the real backend, events are pushed only to sockets connected at
    submission time — a client that connects after /prompt misses everything,
    including the terminal event. This is what catches submit-before-connect
    regressions in the client.
    """
    app = FastAPI()
    rec = Recorder()
    sockets: set[WebSocket] = set()
    tasks: set[asyncio.Task[None]] = set()
    state: dict[str, Any] = {"interrupt": asyncio.Event(), "counter": 0}

    async def script(prompt_id: str, targets: list[WebSocket]) -> None:
        async def send(payload: dict[str, Any]) -> None:
            for socket in targets:
                # A disconnected client just stops receiving, as with real ComfyUI.
                with contextlib.suppress(Exception):
                    await socket.send_json(payload)

        for i in range(steps_per_prompt):
            if state["interrupt"].is_set():
                return
            await asyncio.sleep(delay)
            await send(
                {
                    "type": "progress",
                    "data": {
                        "prompt_id": prompt_id,
                        "value": i + 1,
                        "max": steps_per_prompt,
                        "node": "sampler",
                    },
                }
            )
        await send({"type": "executing", "data": {"prompt_id": prompt_id, "node": None}})

    @app.post("/prompt")
    async def prompt(request: Request) -> dict[str, str]:
        body = await request.json()
        state["counter"] += 1
        prompt_id = f"p{state['counter']}"
        rec.submissions.append(body["prompt"])
        state["interrupt"].clear()
        task = asyncio.create_task(script(prompt_id, list(sockets)))
        tasks.add(task)
        task.add_done_callback(tasks.discard)
        return {"prompt_id": prompt_id}

    @app.post("/interrupt")
    async def interrupt() -> dict[str, bool]:
        rec.interrupts += 1
        state["interrupt"].set()
        return {"ok": True}

    @app.get("/history/{prompt_id}")
    async def history(prompt_id: str) -> dict[str, Any]:
        return {prompt_id: {"outputs": {"images": [{"filename": f"{prompt_id}.png"}]}}}

    @app.websocket("/ws")
    async def ws(socket: WebSocket) -> None:
        await socket.accept()
        sockets.add(socket)
        try:
            while True:
                await socket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            sockets.discard(socket)

    return app, rec
