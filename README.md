# World Builder

Semantic city map generator: author a city's meaning (regions, walls, roads,
landmarks) on a canvas; a two-pass ComfyUI diffusion pipeline renders the
artwork. See `docs/VISION.md` for the full pitch and standing decisions.

## Quick start

Prerequisites: [uv](https://docs.astral.sh/uv/) (Python 3.12+, pinned via
`.python-version`), Node.js (pinned via `frontend/.nvmrc`), and
[`just`](https://github.com/casey/just).

```sh
just install   # uv sync (orchestrator) + npm install (frontend)
just dev       # orchestrator on :8000, frontend on :5173
```

Override ports with `ORCH_PORT` / `WEB_PORT` env vars — useful when running
several checkouts in parallel (see `.claude/skills/foreman/SKILL.md`):

```sh
ORCH_PORT=8017 WEB_PORT=5517 just dev
```

Before every PR:

```sh
just lint   # ruff + pyright (orchestrator), eslint + prettier + tsc (frontend)
just test   # pytest (orchestrator), vitest (frontend)
```

`just codegen` regenerates Pydantic + TypeScript types from
`schema/project.schema.json` once that schema lands (#10).

## Layout

```
frontend/       React app
orchestrator/   Python service
schema/         JSON Schema + codegen config (lands with #10)
scripts/        dev/agent tooling
experiments/    Phase 0 assets and results
docs/           architecture, guidelines, design, pipeline docs
```

See `docs/architecture/OVERVIEW.md` for the component breakdown and
`CLAUDE.md` for the working conventions.
