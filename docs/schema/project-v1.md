# Project file format v1

`schema/project.schema.json` is the source of truth; this document explains the
semantics the schema cannot express and the reasoning behind the shape. The
project file is the product: plain JSON, diffable, authored by the frontend,
consumed by the compiler, replayed by history.

## Coordinate space

All geometry lives in an abstract **canvas space** (`global.canvas`), y-down,
`[x, y]` number pairs. Output resolution (`global.output`, pixels) is a render
setting, not a coordinate system — re-rendering at 8k vs 16k must not touch
geometry. The renderer maps canvas → output by uniform scale; canvas and output
must share an aspect ratio (invariant I6). `global.scale.metersPerUnit` states
real-world intent: the street generator derives block/street dimensions from
it, and the prompt builder uses it for scale cues (ambiguous scale is a known
diffusion failure mode).

Rotations are degrees, clockwise in y-down screen convention.

## Prompt composition — explicit semantics

For a region, the effective prompt is composed as:

```
artStylePrompt  +  (era/palette conditioning)  +  type fragment or override  +  region label (if any)
```

- `prompt.mode: "extend"` — region text is **appended after** the type's
  `promptFragment`.
- `prompt.mode: "override"` — region text **replaces** the type's
  `promptFragment` entirely.
- In **both** modes `global.artStylePrompt` still applies. Override replaces
  the *type's* contribution, never the global style. A region can never opt
  out of the map's art style; that is a global edit.

Exact assembly (separators, ordering, weighting) is the semantic compiler's
contract and must be deterministic; it is specified and golden-tested in the
compiler, not here.

## Type vocabulary is data

Region and point types are per-project data (`vocabulary`), not code: id,
display name, mask colour, default prompt fragment, and (regions) a
`streetDensity` hint in [0, 1] for the street generator. Projects extend the
vocabulary freely; the compiler treats it as opaque data. Terrain ("water",
"farmland", "outside-the-walls") are ordinary region types with
`streetDensity: 0` — no special cases.

**Line types are a fixed enum** (`wall | road | river | canal | coastline`) in
v1, unlike region/point types. The compiler handles each line type
structurally: roads join the street graph, walls close and get thickness,
rivers/coastlines interact with water regions. A data-driven line type would
need behaviour attached, which data can't carry. Revisit if Phase 0 shows a
need (e.g. bridges, aqueducts) — that's a schema version bump.

## Stacking

Regions rasterise in ascending `z`, later wins; canvas not covered by any
region gets `global.defaultFillType`. Ties on `z` are broken by array order
(later wins), so compilation is deterministic without requiring unique `z`.
Polygons are single rings — holes are modelled by stacking a covering region
on top, which is the same mental model as everything else.

## Labels

Rendered map text lives only in `labels[]` (vector overlay — never generated
pixels). `region.label` / `point.label` are *semantic* names that may feed
prompts and the UI, not rendered text; duplicating a name into a `labels[]`
entry is an explicit user act. Label styling is by reference (`styleId` →
`labelStyles`) so a map keeps a coherent typographic system and restyling is
one edit. `fontSize` is in canvas units so labels scale with the map.

## Underlay

`underlay` (optional, v2+) is a locked-by-default tracing reference image —
authoring aid, not artwork. `imageRef` is a sha256 digest into the
orchestrator's content-addressed asset store (`/api/assets/{digest}`,
distinct from the history blob store so a generation-history prune can never
collide with and reclaim a project's underlay bytes). Its placement
(`x`/`y`/`width`/`height`/`rotation`) deliberately mirrors `RectGeometry` —
same units, same rotate-about-centre convention — so it reuses the region
rect-transform math rather than inventing a second one. It is never
rasterised into a compiler pass. Opacity, visibility and lock are session UI
state (`docs/frontend` editor store), not saved here — only the placement
that took effort to get right needs to survive a reload.

## Invariants beyond the schema

JSON Schema validates shape only. The orchestrator enforces these on load
(typed validation errors, before any compile):

- **I1** `id` unique within each collection (vocabulary, regions, lines,
  points, labels, labelStyles).
- **I2** Every `region.type` resolves to a vocabulary entry with
  `category: "region"`; every `point.type` to `category: "point"`.
- **I3** `global.defaultFillType` resolves to a region-category vocabulary
  entry.
- **I4** `maskColor` unique across region-category vocabulary entries (the
  segmentation mask is decoded by colour).
- **I5** Every `label.styleId` resolves to a `labelStyles` entry.
- **I6** `canvas` and `output` aspect ratios equal within 0.1%.
- **I7** Geometry coordinates lie within a sane bound of the canvas
  (±1 canvas-size margin) — off-canvas authoring is allowed, runaway
  coordinates are rejected.

## Canonical form

To keep files diffable and history byte-stable: UTF-8, 2-space indent, `\n`
line endings, object keys in schema-declared order, colours lowercase
`#rrggbb`, no trailing whitespace. Writers (frontend save, orchestrator
migrations) emit canonical form; readers accept any valid JSON.

## Versioning & migration

- `schemaVersion` is a required integer; this schema is version **1**.
- Readers **reject** unknown versions and unknown fields
  (`additionalProperties: false` throughout). Silent tolerance of unknown
  fields would let two clients disagree about what a file means.
- Migrations are **forward-only** (v1→v2→…), live in the orchestrator, and are
  pure functions run at load time; saving always writes the current version.
  There are no downgrades — old clients don't open new files.
- Any field addition, however innocuous, is a version bump with a migration.
  Cheap bumps are the point: the version number is the compatibility contract.
- Worked example: v2 (issue #30) added the optional `underlay` field. The
  migration (`orchestrator/src/orchestrator/projects/migrations.py`) is a
  one-line version bump — v1 documents are already structurally valid v2
  documents since the new field is optional. Not yet wired into `ProjectRepo`:
  that layer stores `data` opaquely with no schema validation today (shape
  enforcement is future work, same as invariants I1–I7 below), so there is no
  live call site for it yet. It exists for the first consumer that loads an
  arbitrary project document — the semantic compiler (#12) or a file-import
  flow — to call.

## Deliberate v1 omissions

Draft now, revisit after Phase 0 synthesis (#8) if experiment results change
conditioning needs:

- No per-region negative prompts or generation params (steps, CFG) — pipeline
  settings belong to `docs/pipeline/DECISIONS.md`, not the project file.
- No bezier/curve geometry — polylines and polygons with enough points are
  visually equivalent at map scale; curves complicate the compiler for no
  Phase 0 gain.
- No grouping/folders for regions — a UI concern; add when the UI needs it.
- No embedded generation history — history is orchestrator state keyed by
  content hash, not project data.
