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
- `ORCH_BLOB_ROOT` — content-addressed blob store root directory (default `blobs`).
- `COMFY_URL` — ComfyUI base URL (default `http://127.0.0.1:8188`); the WS URL is derived from it.

## Layout

- `app.py` — app factory + lifespan wiring; `config.py` — env settings; `db.py` — aiosqlite connect + numbered migrations in `migrations/`.
- `projects/` — project CRUD (REST + repo). Projects store opaque JSON today; schema validation arrives with codegen.
- `jobs/` — serial single-GPU job queue with per-step checkpointing, cooperative cancellation, crash/restart resume, and a WebSocket progress feed. `handlers.py` registers job kinds (`demo` is the reference handler, `reproduce` resubmits a stored generation's workflow verbatim; real generation plugs in the same way).
- `comfy/client.py` — the sole ComfyUI client: `run_workflow` opens the progress socket before submitting (events are only pushed to already-connected clients), streams updates, plus interrupt and output fetch, with retry/backoff on connection loss.
- `history/` — generation history: `blobs.py` is a content-addressed (sha256) blob store on disk for masks/controls/outputs, deduping identical bytes across runs; `repo.py` stores each generation's full reproducibility record (project snapshot hash, workflow JSON, seeds, settings, model/ControlNet hashes, environment fingerprint, blob-hash refs for inputs/outputs, parent generation for branching) and handles delete/prune with blob garbage-collection. GC only considers blobs the deleted rows referenced and skips digests pinned by in-flight jobs, so a running job's blobs can never be reclaimed before its generation record commits.

## API

- `GET /api/health`
- `POST/GET /api/projects`, `GET/PUT/DELETE /api/projects/{id}`
- `POST/GET /api/jobs`, `GET /api/jobs/{id}`, `POST /api/jobs/{id}/cancel`, `POST /api/jobs/{id}/resume`
- `WS /api/jobs/{id}/events` — snapshot then live `progress`/`step`/`state` events.
- `GET /api/projects/{project_id}/history` — generation summaries for a project, oldest first.
- `POST /api/projects/{project_id}/history/prune` — `{"keep": N}`, deletes all but the `N` most recent generations and reclaims orphaned blobs.
- `GET /api/generations/{id}` — full reproducibility record (workflow, inputs/outputs blob refs, seeds, settings, model hashes, environment).
- `DELETE /api/generations/{id}` — delete one generation and reclaim any blob it solely referenced.
- `POST /api/generations/{id}/reproduce` — enqueues a `reproduce` job that resubmits the stored workflow verbatim; the resulting generation is recorded as a child of the source (branching).
- `GET /api/blobs/{sha256}` — fetch a blob's raw bytes by content hash.
