# Architecture Overview

Three components, strict boundaries:

```
Browser (React/TS)  ──REST+WS──▶  Orchestrator (Python/FastAPI)  ──HTTP/WS──▶  ComfyUI (local RTX 4090)
   canvas editor                     pipeline brains                              dumb graph executor
```

## Frontend (`frontend/`)

Vite + React + TypeScript, zustand state, Tailwind styled by design tokens from `docs/design/`. Canvas: PixiJS (pending #16 spike confirmation) rendering everything in one scene — semantic vector layers (regions/lines/points/labels) over the generated artwork, which is displayed as a deep-zoom tile pyramid served by the orchestrator. Never load a full-resolution render as one texture.

## Orchestrator (`orchestrator/`)

Python 3.12, FastAPI, aiosqlite. Owns all pipeline logic:

- **Semantic compiler** — project JSON → segmentation mask (regions rasterised z-order later-wins, default fill for uncovered canvas), line-art control image (walls/roads/rivers + street graph), region manifest. Pure and deterministic.
- **Workflow builder** — composes ComfyUI workflow JSON per `docs/pipeline/DECISIONS.md`; submits via ComfyUI API.
- **Tile scheduler** — splits Pass 2 into tiles, computes per-tile region prompts, stitches with feathered overlap, checkpoints every tile (jobs must survive crash/restart).
- **Job queue** — serial GPU execution, cancellation, resume, WS progress events.
- **History** — SQLite + content-addressed blob store; every generation's full inputs (workflow JSON, seeds, model hashes) recorded so any output is reproducible.

## ComfyUI

Stock ComfyUI, driven entirely through its HTTP API with orchestrator-generated workflow JSON. No custom nodes unless `docs/pipeline/DECISIONS.md` says so. The backend URL is config — local today, potentially remote workers later. ComfyUI holds no state we care about.

## The schema treaty

`schema/project.schema.json` is the single source of truth for the project file format. Codegen produces Pydantic models (orchestrator) and TypeScript types (frontend); CI fails on drift. All wire traffic validates against it.

## Repo layout

```
frontend/       React app
orchestrator/   Python service
schema/         JSON Schema + codegen config
scripts/        dev/agent tooling (issue_frontier.py etc.)
experiments/    Phase 0 assets and results
docs/           you are here
.claude/skills/ agent workflow skills
```
