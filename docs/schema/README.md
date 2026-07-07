# Project schema

`schema/project.schema.json` (created by #10) is the single source of truth for the project file format — regions, lines, points, labels, global settings, type vocabulary.

- Change the format **only** by editing the JSON Schema, then `just codegen`.
- Codegen targets: Pydantic v2 models (orchestrator) via datamodel-code-generator; TypeScript types (frontend) via json-schema-to-typescript. CI fails if generated output is stale.
- The schema is versioned (`schemaVersion` field); migrations are forward-only and live in the orchestrator.

Format documentation and design rationale accompany the schema here as #10 lands.
