import asyncio
from dataclasses import dataclass, field
from typing import Any

from fastapi import FastAPI, Request, WebSocket


@dataclass
class Recorder:
    submissions: list[dict[str, Any]] = field(default_factory=list)
    interrupts: int = 0

    @property
    def submitted_steps(self) -> list[int]:
        return [w["step"] for w in self.submissions if "step" in w]


def make_fake_comfy(*, steps_per_prompt: int = 2, delay: float = 0.02) -> tuple[FastAPI, Recorder]:
    """A stand-in for ComfyUI: records submissions, streams scripted progress over
    WS, and honours /interrupt by stopping the stream without a completion event."""
    app = FastAPI()
    rec = Recorder()
    state: dict[str, Any] = {"active": None, "interrupt": asyncio.Event(), "counter": 0}

    @app.post("/prompt")
    async def prompt(request: Request) -> dict[str, str]:
        body = await request.json()
        state["counter"] += 1
        prompt_id = f"p{state['counter']}"
        rec.submissions.append(body["prompt"])
        state["active"] = prompt_id
        state["interrupt"].clear()
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
        prompt_id = state["active"]
        interrupted = False
        for i in range(steps_per_prompt):
            if state["interrupt"].is_set():
                interrupted = True
                break
            await asyncio.sleep(delay)
            await socket.send_json(
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
        if not interrupted:
            await socket.send_json(
                {"type": "executing", "data": {"prompt_id": prompt_id, "node": None}}
            )
        await socket.close()

    return app, rec
