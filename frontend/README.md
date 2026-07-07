# frontend

Vite + React + TypeScript. See the root README for the dev quick-start and `docs/guidelines/frontend.md` for conventions.

## Scripts

- `npm run dev` — dev server (`WEB_PORT` env override, default 5173; proxies `/api` to the orchestrator on `ORCH_PORT`, default 8000)
- `npm run build` — typecheck + production build
- `npm run lint` — eslint
- `npm run format` — prettier check
- `npm run typecheck` — `tsc -b`
- `npm run test` — vitest
