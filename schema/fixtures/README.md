# Schema fixtures

Test corpus for `schema/project.schema.json`. Round-trip tests (Python and
TypeScript, wired by #9/#10) must accept everything under `valid/` and reject
everything under `invalid/`.

## valid/

- `minimal.json` — smallest conforming project: one vocabulary entry (needed by
  `defaultFillType`), all collections empty.
- `test-city.json` — hand-authored exemplar city (~20 districts, 18 region
  types, overlay ruin region, terrain outside the walls) written to exercise
  every geometry kind, both prompt modes, both line styles, curved/haloed
  labels — not tied to any other asset.
- `phase0-manifest.json` — direct translation of the *actual* Phase 0 asset
  set, `experiments/assets/region_manifest.json` (#2): all 30 regions, all
  26 region types (26 vocabulary entries, kebab-case ids — the manifest's
  snake_case type names are renamed; mask colours kept from its README
  colour table), `z` and geometry preserved exactly. `global.canvas` is
  2048x2048 and `defaultFillType` is `wilderness`, matching that asset set.
  No region's prompt differs from its type's `promptFragment` (one distinct
  prompt per type across all 30 regions), so no region uses a `prompt`
  override. No lines/points/labels were authored for it — empty arrays are
  correct. Proves the hand-authored Phase 0 manifest is expressible in v1
  without a schema-side special case. Keep reconciled with
  `experiments/assets/` if that manifest changes.
- `with-underlay.json` — `minimal.json` plus an `underlay` block (issue #30):
  proves the optional v2 field round-trips. `imageRef` is a syntactically
  valid sha256 (the well-known empty-string digest) — fixtures test shape
  only, not that the blob exists.

## invalid/

Each file is `minimal.json` with exactly one defect, named for it:

| file | violates |
|---|---|
| `wrong-schema-version.json` | `schemaVersion` must be the const `2` |
| `unknown-top-level-field.json` | `additionalProperties: false` at root |
| `missing-seed.json` | `global.seed` required |
| `bad-mask-color.json` | colours are canonical lowercase `#rrggbb` |
| `polygon-two-points.json` | polygon needs ≥ 3 points |
| `unknown-line-type.json` | line type outside the fixed v1 enum |
| `prompt-missing-mode.json` | prompt override requires explicit `mode` |
| `region-type-not-kebab.json` | type refs must match the `Id` pattern |
| `underlay-missing-width.json` | `underlay.width` required |

Note: `schemaVersion` was bumped 1→2 by issue #30 (added the optional
`underlay` field); all fixtures were bumped in lockstep so each still tests
exactly the one defect it's named for.
