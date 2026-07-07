# Canvas library decision (issue #16 spike)

**Verdict: PixiJS v8** as the single scene-graph canvas, with the artwork rendered
as a deep-zoom tile pyramid inside it (no OpenSeadragon, no Konva). This confirms
the tentative choice already recorded in `docs/guidelines/frontend.md`.

## What had to decide it

The canvas is deliberately an open choice; four hard requirements settle it
(issue #16 Context):

1. **Polygon editing** — regions/walls as editable vector geometry with vertex handles.
2. **Layers** — artwork underneath, many semantic vector layers above, UI adornments on top.
3. **Freehand / pen input** — low-latency pointer capture for drawing lines and regions.
4. **Multi-thousand-pixel artwork** — the 8k–16k render must display via deep-zoom
   tiles, **never as one 16k texture** (a hard rule in `docs/guidelines/frontend.md`).

Requirement 4 is the discriminator, because it forces one shared world-coordinate
system in which streamed tiles and editable vectors stay perfectly registered
under pan/zoom.

## The candidates

### PixiJS v8 — chosen

- **Large tiled image:** WebGL/WebGPU renderer built for thousands of sprites. A
  tile pyramid is just sprites in a container; resident sprites are bounded by the
  viewport and offscreen textures by an LRU cache cap (256 tiles ≈ 64 MB), so GPU
  memory stays bounded regardless of artwork size. Directly satisfies "never one
  16k texture." Proven in this spike — see evidence below.
- **One coordinate system:** a single `world` Container carries the pan/zoom
  transform; tiles and vector layers are its children, so they cannot drift out of
  registration. This is exactly the architecture the frontend guideline prescribes
  ("one scene graph… tile pyramid at the bottom, then semantic vector layers, then
  UI adornments").
- **Polygon editing / freehand:** `Graphics` gives filled polygons, polylines and
  vertex handles; Pixi's federated pointer events give per-object hit-testing at
  WebGL latency. Handle sizes are drawn in inverse proportion to zoom so they read
  as constant screen size.
- **TypeScript:** v8 is TS-first with first-class types; strict mode + the repo's
  `erasableSyntaxOnly` build passed with no `any` and no shims (one caveat: use
  explicit field assignment, not constructor parameter properties).
- **Cost:** it is a low-level renderer — pan/zoom, tile management and editing
  interactions are ours to build (this spike builds the first slice). Bundle is
  ~145 kB gzip, acceptable for a desktop authoring tool.

### Konva — rejected

- Strong, ergonomic vector editing (`Transformer`, drag anchors) — its best feature,
  and the thing we least need help with.
- But it is a **2D-canvas** scene graph with **no tiling / deep-zoom**: the artwork
  would be drawn via `Konva.Image`, i.e. a single bitmap. At 16k that is exactly the
  one-giant-texture failure requirement 4 forbids, and 2D-canvas has no path to the
  bounded-texture tile streaming Pixi gives for free. Disqualifying.

### Hybrid: OpenSeadragon (tiles) + vector overlay — rejected

- OpenSeadragon is excellent at deep-zoom tiles, but it owns its own viewport and
  animation loop. Editable vectors then live in a *separate* overlay canvas whose
  transform must be kept in lockstep with OSD's — two coordinate systems bolted
  together, fighting requirement 4's "perfectly registered" clause on every frame,
  plus two input models to reconcile. A single Pixi scene graph gives the same
  deep-zoom behaviour without the seam, so the hybrid buys complexity for nothing.

## Evidence from the scaffold

The scaffold in this PR is a running PixiJS v8 app, not a paper study. Verified in
a headless Chromium (WebGL via SwiftShader), driving the real app:

| Action | Zoom | Resident tiles | Pyramid level |
|---|---|---|---|
| Fit whole 16 384² artwork | 4% | **16** | L10 (overview) |
| Wheel-zoom to full res | 219% | **4** | L14 (full res) |
| Drag-pan at full res | 219% | **9** | L14 |

The resident-tile count stays in single digits at every zoom — the deep-zoom
invariant, made observable. At full resolution the layer auto-selects level 14
(the 16 384² level, 64×64 tiles) yet materialises only the 4 under the viewport;
it never builds the full-image texture. The region polygon and road line stay
registered to the tiles through zoom and pan, and toggling a layer in the panel
hides its geometry. Console error count: 0.

`src/canvas/tiles/tileMath.ts` encodes the level-selection and visible-tile
geometry and is unit-tested (`tileMath.test.ts`), including an explicit assertion
that a viewport window resolves to <1% of the full-image tile set.
`TileLayer.test.ts` sweeps a full-resolution pan across the entire 16k image and
asserts the texture cache never exceeds its cap, so the bounded-GPU-memory claim
is enforced by test, not just asserted in a comment.

## What the scaffold establishes (and what it defers)

Delivered: app shell, layer-panel skeleton, PixiJS viewport with wheel-zoom /
drag-pan, a test polygon layer, a road-line layer, and a deep-zoom tiled-artwork
layer, with zustand stores shaped to the (placeholder) project schema types.

Deferred, by design, to the editing issues that depend on #16 (#17/#20/#30):

- **Tile source:** `SyntheticTileSource` paints tiles procedurally so the "large
  test image" needs no committed 16k asset. Production swaps in a `TileSource` that
  fetches the orchestrator's deep-zoom endpoint — same interface.
- **Schema types:** `src/state/types.ts` is a hand-written placeholder; #10 generates
  the real types into `src/generated/`, and the stores keep their API when it lands.
- **Undo/redo:** the day-one undoable-command requirement is store infrastructure the
  editing issues build; this spike only reads and toggles.
- **Design tokens:** styling is placeholder literals until #37 delivers `tokens.css`.
- **Interactive vertex editing:** handles render; dragging them to edit geometry is
  the first editing issue's job.
- **Smarter tile caching:** the spike's texture cache is a flat LRU cap. Tile
  prefetching, coarser-level fallback while tiles load, and cache sizing tuned to
  real orchestrator tiles are follow-up work for the generation-display issues.
