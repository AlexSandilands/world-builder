# world-builder

Semantic city map generator: the user authors a city's *meaning* (regions, walls, roads, landmarks, tagged with types and prompts) on a canvas; a two-pass ComfyUI diffusion pipeline renders the artwork at 8k–16k. Authorship lives in the semantic layer; the AI handles the pixels.

Spec: `docs/planning/city-map-tool-spec.md` — §8 lists binding decisions. Work is driven by the GitHub issue board (dependency-wired, model labels).

## Commands

- `just dev` — orchestrator (:8000) + frontend (:5173) dev servers
- `just test` / `just lint` — run before every PR; both must be green
- `just codegen` — regenerate Pydantic + TypeScript types from the JSON Schema

(Targets are implemented by #9; keep this list current as they land.)

## Hard rules

1. Files under 500 LoC. Split before you reach it, not after.
2. Comments only state what the code cannot: constraints, invariants, non-obvious whys. No narration, no history.
3. Frontend ↔ backend communicate only via the orchestrator HTTP/WS API. Never assume a shared filesystem.
4. The project file format changes only in `schema/` (JSON Schema is the source of truth); run codegen, never hand-edit generated types.
5. The semantic compiler must stay deterministic: same project JSON → byte-identical outputs. History and reproducibility depend on it.
6. Only one `needs-gpu` job at a time — there is a single local RTX 4090 shared by everything.

## Read before working

| Touching | Read first |
|---|---|
| Generation jobs, ComfyUI workflows, tiling | `docs/architecture/OVERVIEW.md`, `docs/pipeline/DECISIONS.md` |
| Semantic compiler, street generator | `docs/architecture/OVERVIEW.md`, `docs/schema/README.md` |
| Backend (any Python) | `docs/guidelines/python.md` |
| Frontend (any TS/React) | `docs/guidelines/frontend.md`, `docs/design/README.md` |
| Anything | `docs/guidelines/general.md` |

## Working the issue board

Use the repo skills: `next-issue` to pick work, `work-issue` for the single-issue contract, `foreman` for the long-running orchestration loop. Issue `model:` labels say which model an implementation session should run on. Branch as `issue/NN-slug`; PRs say `Closes #NN`.
