from collections.abc import Awaitable, Callable

from .state import JobContext

Handler = Callable[[JobContext], Awaitable[None]]

_REGISTRY: dict[str, Handler] = {}


def register(kind: str, handler: Handler) -> None:
    _REGISTRY[kind] = handler


def get_handler(kind: str) -> Handler | None:
    return _REGISTRY.get(kind)


async def demo_handler(ctx: JobContext) -> None:
    """Reference multi-step job: proves the queue/checkpoint/cancel/resume
    contract end-to-end against ComfyUI. Real generation handlers register the
    same way once the pipeline lands.

    Checkpoint shape: {"completed": <count of finished steps>}. Resuming a
    partially-run job continues from that count rather than redoing work.

    Cancellation is only observed between steps and at progress events — a
    silent stream defers it. Real handlers (tile passes) must keep each step
    short so a cancel never waits long.
    """
    total = int(ctx.spec.get("steps", 1))
    start = int(ctx.checkpoint.get("completed", 0))

    for step in range(start, total):
        ctx.check_cancelled()
        async with ctx.comfy.run_workflow({"step": step}) as run:
            async for update in run.updates:
                await ctx.emit(
                    {
                        "type": "progress",
                        "step": step,
                        "value": update.value,
                        "max": update.max,
                    }
                )
                if ctx.cancelled():
                    await ctx.comfy.interrupt()
                    ctx.check_cancelled()
            outputs = await ctx.comfy.fetch_outputs(run.prompt_id)
        await ctx.record_generation(run.prompt_id, outputs)
        ctx.checkpoint["completed"] = step + 1
        await ctx.save_checkpoint()
        await ctx.emit({"type": "step", "step": step, "completed": step + 1, "total": total})


register("demo", demo_handler)
