# orchestrator

FastAPI pipeline service. See the root README for the dev quick-start and `docs/guidelines/python.md` for conventions.

## Commands

- `uv run orchestrator` — dev server (`ORCH_PORT` env override, default 8000)
- `uv run pytest` — unit tests
- `uv run ruff check .` / `uv run ruff format --check .` — lint / format check
- `uv run pyright` — typecheck

## Environment

- `ORCH_PORT` — HTTP/WS port (default 8000).
- `ORCH_DB` — SQLite file path (default `orchestrator.db`).
- `COMFY_URL` — ComfyUI base URL (default `http://127.0.0.1:8188`); the WS URL is derived from it.

## Layout

- `app.py` — app factory + lifespan wiring; `config.py` — env settings; `db.py` — aiosqlite connect + numbered migrations in `migrations/`.
- `projects/` — project CRUD (REST + repo). Projects store opaque JSON today; schema validation arrives with codegen.
- `jobs/` — serial single-GPU job queue with per-step checkpointing, cooperative cancellation, crash/restart resume, and a WebSocket progress feed. `handlers.py` registers job kinds (`demo` is the reference handler; real generation plugs in the same way).
- `comfy/client.py` — the sole ComfyUI client: `run_workflow` opens the progress socket before submitting (events are only pushed to already-connected clients), streams updates, plus interrupt and output fetch, with retry/backoff on connection loss.

## API

- `GET /api/health`
- `POST/GET /api/projects`, `GET/PUT/DELETE /api/projects/{id}`
- `POST/GET /api/jobs`, `GET /api/jobs/{id}`, `POST /api/jobs/{id}/cancel`, `POST /api/jobs/{id}/resume`
- `WS /api/jobs/{id}/events` — snapshot then live `progress`/`step`/`state` events.
