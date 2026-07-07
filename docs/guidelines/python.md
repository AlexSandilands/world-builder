# Python Guidelines (orchestrator)

## Toolchain

- Python 3.12+, **uv** for dependency management, **ruff** (lint + format), **pyright strict**, **pytest** (+ pytest-asyncio).
- FastAPI for HTTP/WS; Pydantic v2 models only where data crosses a boundary — internal code passes plain dataclasses/values.

## Data & storage

- **aiosqlite with hand-written SQL.** No ORM. Schema migrations are numbered SQL files applied at startup.
- Blob store is content-addressed (sha256 → file path); the DB stores hashes and metadata, never image bytes.
- Pydantic models for the project format are **generated** from `schema/project.schema.json` — never edit them by hand.

## Pipeline code

- Imaging: Pillow + numpy. Geometry: shapely. Graphs: networkx. Reach for these before writing geometry math by hand.
- The compiler is a pure function: project JSON in → control images + manifest out, deterministic (fixed random seeds if randomness is ever needed, stable iteration order — sort, don't rely on dict order across versions).
- Long jobs (tile passes) checkpoint after every unit of work and must resume cleanly. Cancellation is cooperative: check between tiles, propagate ComfyUI interrupts.
- ComfyUI client: all calls behind one module (`comfy/client.py` pattern); retry with backoff on connection loss; workflow JSON built by dedicated builders that are snapshot-tested.

## Async

- FastAPI handlers are async; CPU-heavy work (rasterisation, stitching) runs in a worker thread/process, never on the event loop.
- One GPU: the job queue is the only thing allowed to submit to ComfyUI.

## Testing patterns

- Golden-image tests for the compiler (small fixtures, exact-match PNGs committed).
- Workflow builders: JSON snapshot tests.
- ComfyUI integration: fake server with recorded responses; no live ComfyUI in tests.
