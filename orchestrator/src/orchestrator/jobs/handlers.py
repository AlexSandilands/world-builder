import json
from collections.abc import Awaitable, Callable

from .state import GenerationInputs, JobContext

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
        # No real output bytes to fetch yet (ComfyClient has no /view call);
        # the metadata blob stands in until a pipeline handler has real images.
        output_hash = await ctx.put_blob(json.dumps(outputs, sort_keys=True).encode())
        await ctx.record_generation(
            GenerationInputs(
                prompt_id=run.prompt_id,
                workflow={"step": step},
                outputs={"result": output_hash},
            )
        )
        ctx.checkpoint["completed"] = step + 1
        await ctx.save_checkpoint()
        await ctx.emit({"type": "step", "step": step, "completed": step + 1, "total": total})


register("demo", demo_handler)


async def reproduce_handler(ctx: JobContext) -> None:
    """Re-submits a stored generation's workflow verbatim (byte-identical to
    the original /prompt body — see history/routes.py) and records the result
    as a child of the source generation, giving the history tree its branches.
    """
    source_id = ctx.spec["source_generation_id"]
    source = await ctx.get_generation(source_id)
    if source is None:
        raise RuntimeError(f"generation {source_id} not found")
    workflow = ctx.spec["workflow"]

    ctx.check_cancelled()
    async with ctx.comfy.run_workflow(workflow) as run:
        async for _update in run.updates:
            if ctx.cancelled():
                await ctx.comfy.interrupt()
                ctx.check_cancelled()
        outputs = await ctx.comfy.fetch_outputs(run.prompt_id)
    output_hash = await ctx.put_blob(json.dumps(outputs, sort_keys=True).encode())

    await ctx.record_generation(
        GenerationInputs(
            prompt_id=run.prompt_id,
            workflow=workflow,
            inputs=source.inputs,
            outputs={"result": output_hash},
            seeds=source.seeds,
            settings=source.settings,
            model_hashes=source.model_hashes,
            environment=source.environment,
            project_snapshot_hash=source.project_snapshot_hash,
            parent_id=source.id,
        )
    )
    ctx.checkpoint["completed"] = True
    await ctx.save_checkpoint()


register("reproduce", reproduce_handler)
