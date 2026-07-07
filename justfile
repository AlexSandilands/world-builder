set shell := ["bash", "-uc"]

orch_port := env_var_or_default("ORCH_PORT", "8000")
web_port := env_var_or_default("WEB_PORT", "5173")

default:
    @just --list

# Install both apps' dependencies.
install:
    cd orchestrator && uv sync
    cd frontend && npm install

# Run orchestrator + frontend dev servers together; ORCH_PORT/WEB_PORT override defaults
# (parallel agent worktrees each get a derived port pair, see .claude/skills/foreman/SKILL.md).
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill 0' EXIT
    (cd orchestrator && ORCH_PORT={{orch_port}} uv run orchestrator) &
    (cd frontend && WEB_PORT={{web_port}} ORCH_PORT={{orch_port}} npm run dev) &
    wait

test: test-orchestrator test-frontend

test-orchestrator:
    cd orchestrator && uv run pytest

test-frontend:
    cd frontend && npm run test

lint: lint-orchestrator lint-frontend

lint-orchestrator:
    cd orchestrator && uv run ruff check .
    cd orchestrator && uv run ruff format --check .
    cd orchestrator && uv run pyright

lint-frontend:
    cd frontend && npm run lint
    cd frontend && npm run format
    cd frontend && npm run typecheck

# Regenerate Pydantic + TypeScript types from schema/project.schema.json (lands with #10).
codegen:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -f schema/project.schema.json ]; then
        echo "schema/project.schema.json not found yet (see #10) — nothing to generate." >&2
        exit 1
    fi
    cd orchestrator && uv run datamodel-codegen \
        --input ../schema/project.schema.json \
        --input-file-type jsonschema \
        --output src/orchestrator/generated/project.py \
        --output-model-type pydantic_v2.BaseModel
    cd frontend && npx json-schema-to-typescript ../schema/project.schema.json \
        > src/generated/project.ts
