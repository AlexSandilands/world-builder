# Frontend Guidelines

## Stack

- Vite + React + TypeScript (strict), **zustand** for state, Tailwind CSS consuming the design tokens from `docs/design/` (CSS variables — never hardcode colours/spacing that a token covers).
- Canvas: PixiJS v8 (pending #16 spike confirmation) — one scene graph for everything: artwork tile pyramid at the bottom, then semantic vector layers, then UI adornments.

## State

- One zustand store per domain (project, selection, generation, history), not one mega-store.
- The project document in memory always validates against the generated types from `schema/` — imports come from the generated module, never hand-declared shapes.
- **Every mutation of the project document is an undoable command** (do/undo pair) from day one; the undo stack is core infrastructure, not a feature bolted on later.
- Server state (jobs, history) comes via the orchestrator API; don't mirror it into project state.

## Canvas rules

- Never load a full-resolution render as a single texture — artwork always renders as deep-zoom tiles served by the orchestrator.
- Semantic layers stay perfectly registered with the artwork: one shared world-coordinate system, transforms applied at the viewport level only.
- Pointer interactions must stay responsive during generation; WS progress handling never blocks the render loop.

## Components

- Feature folders (`features/regions/`, `features/generate/`…), components small enough to obey the 500 LoC cap naturally.
- No component talks to the API directly — API access lives in a thin typed client module (`api/`), one function per endpoint, request/response types generated from the schema.
