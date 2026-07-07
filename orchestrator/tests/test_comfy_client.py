import asyncio

import pytest

from orchestrator.comfy import ComfyClient, ProgressUpdate
from orchestrator.comfy.client import run_with_retry
from orchestrator.errors import ComfyError

from .fake_comfy import make_fake_comfy
from .harness import serve


async def test_retry_recovers_from_transient_loss() -> None:
    attempts = {"n": 0}

    async def flaky() -> str:
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise OSError("connection refused")
        return "ok"

    result = await run_with_retry(flaky, attempts=5, backoff_base=0.0)
    assert result == "ok"
    assert attempts["n"] == 3


async def test_retry_exhausts_and_raises() -> None:
    async def always_down() -> str:
        raise OSError("down")

    with pytest.raises(ComfyError):
        await run_with_retry(always_down, attempts=3, backoff_base=0.0)


async def test_run_workflow_streams_and_fetches() -> None:
    app, recorder = make_fake_comfy(steps_per_prompt=2, delay=0.01)
    async with serve(app) as port:
        client = ComfyClient(f"http://127.0.0.1:{port}", f"ws://127.0.0.1:{port}")
        async with client.run_workflow({"step": 0}) as run:
            updates = [u async for u in run.updates]
        assert [u.value for u in updates] == [1, 2]
        assert updates[-1].max == 2

        outputs = await client.fetch_outputs(run.prompt_id)
        assert "images" in outputs

        await client.interrupt()
        assert recorder.interrupts == 1
        await client.aclose()


async def test_run_workflow_survives_instant_completion() -> None:
    # The fake delivers events only to sockets connected before /prompt; with
    # zero delay the whole script fires immediately after submission. A client
    # that dialled the socket after submitting would miss the terminal event
    # and hang — wait_for turns that regression into a test failure.
    app, _ = make_fake_comfy(steps_per_prompt=1, delay=0.0)
    async with serve(app) as port:
        client = ComfyClient(f"http://127.0.0.1:{port}", f"ws://127.0.0.1:{port}")

        async def consume() -> list[ProgressUpdate]:
            async with client.run_workflow({"step": 0}) as run:
                return [u async for u in run.updates]

        updates = await asyncio.wait_for(consume(), timeout=5)
        assert [u.value for u in updates] == [1]
        await client.aclose()
