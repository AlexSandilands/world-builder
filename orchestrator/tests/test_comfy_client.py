import pytest

from orchestrator.comfy import ComfyClient
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


async def test_submit_stream_fetch_interrupt() -> None:
    app, recorder = make_fake_comfy(steps_per_prompt=2, delay=0.0)
    async with serve(app) as port:
        client = ComfyClient(f"http://127.0.0.1:{port}", f"ws://127.0.0.1:{port}")
        prompt_id = await client.submit({"step": 0})
        updates = [u async for u in client.stream_progress(prompt_id)]
        assert [u.value for u in updates] == [1, 2]
        assert updates[-1].max == 2

        outputs = await client.fetch_outputs(prompt_id)
        assert "images" in outputs

        await client.interrupt()
        assert recorder.interrupts == 1
        await client.aclose()
