import asyncio
import contextlib
from collections.abc import AsyncGenerator

import uvicorn
from fastapi import FastAPI


@contextlib.asynccontextmanager
async def serve(app: FastAPI) -> AsyncGenerator[int, None]:
    """Run a FastAPI app on an ephemeral port in the current event loop, yielding
    the bound port. Lifespan (queue worker, db) runs like production."""
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning", lifespan="on")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    try:
        while not server.started:
            await asyncio.sleep(0.01)
        port = server.servers[0].sockets[0].getsockname()[1]
        yield port
    finally:
        server.should_exit = True
        await task
