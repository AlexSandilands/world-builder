# Schema fixtures

Test corpus for `schema/project.schema.json`. Round-trip tests (Python and
TypeScript, wired by #9/#10) must accept everything under `valid/` and reject
everything under `invalid/`.

## valid/

- `minimal.json` — smallest conforming project: one vocabulary entry (needed by
  `defaultFillType`), all collections empty.
- `test-city.json` — the Phase 0 hand-authored test city (~20 districts,
  18 region types, overlay ruin region, terrain outside the walls). Exercises
  every geometry kind, both prompt modes, both line styles, curved/haloed
  labels. Keep reconciled with `experiments/assets/` (#2).

## invalid/

Each file is `minimal.json` with exactly one defect, named for it:

| file | violates |
|---|---|
| `wrong-schema-version.json` | `schemaVersion` must be the const `1` |
| `unknown-top-level-field.json` | `additionalProperties: false` at root |
| `missing-seed.json` | `global.seed` required |
| `bad-mask-color.json` | colours are canonical lowercase `#rrggbb` |
| `polygon-two-points.json` | polygon needs ≥ 3 points |
| `unknown-line-type.json` | line type outside the fixed v1 enum |
| `prompt-missing-mode.json` | prompt override requires explicit `mode` |
| `region-type-not-kebab.json` | type refs must match the `Id` pattern |
