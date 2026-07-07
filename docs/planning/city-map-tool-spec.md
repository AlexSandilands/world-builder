# Semantic City Map Generator — Specification

**Working title:** TBD
**Author:** Alex
**Status:** Draft v0.2
**Date:** July 2026 (v0.1 June 2026)

---

## 1. Problem Statement

Creating large-scale fantasy city maps (50,000–100,000+ population) for tabletop campaigns currently forces a choice between two bad options:

- **Manual tools (Inkarnate, Dungeondraft, Wonderdraft):** Full creative control, but placing stamps and painting textures building-by-building is infeasible at city scale. Even expert results read as "small towns" because the labor cost caps the achievable density and extent.
- **Pure image generation (Gemini/nano-banana, Midjourney, etc.):** Fast and compositionally impressive, but control is coarse. Feeding in a hand-drawn sketch improves layout adherence, but fine-grained intent ("this district is run-down," "construction here," "this is the noble quarter") cannot be reliably expressed. Output also suffers from characteristic one-shot failure modes: repeated texture noise instead of street logic, duplicate/garbled labels, and ambiguous scale.

**The goal** is a tool occupying the middle ground: the user authors the *semantic structure* of the city (regions, walls, roads, landmarks, and what each one *is*), and a diffusion pipeline renders the *artwork* — with enough resolution and local detail that players can zoom into individual neighbourhoods.

## 2. Core Concept

The user works on an interactive canvas, sketching shapes and tagging them with meaning. The tool compiles this into machine-readable conditioning inputs (a segmentation/control image plus per-region prompts) and drives a local diffusion backend through a two-pass generation process: a global coherence pass, then a district-aware tiled detail pass. The user then iteratively refines the result via region-targeted regeneration and inpainting. Labels are rendered as a vector overlay, never baked into the generated pixels.

**Authorship lives in the semantic layer. The AI handles the pixels.**

## 3. Target Workflow (Three Phases)

### Phase A — Sketchpad

The user composes the city on a layered 2D canvas:

1. **Draw regions** — freehand polygons, rectangles, ellipses ("lasso a blob, this is the docks").
2. **Draw lines** — walls, main roads, rivers, canals. Lines carry a type and a width/weight.
3. **Place points** — landmarks: castle, cathedral, market square, park, gate, bridge.
4. **Tag everything** — each element gets:
   - A **label** (display name, e.g. "The Red Bastion") — optional.
   - A **type** from a preset vocabulary (noble district, slums, docks, market, industrial, temple district, park/green space, military, ruins, construction, farmland...) which maps to a default prompt fragment and a mask colour.
   - An optional **custom prompt** that overrides or extends the type default (e.g. "recently burned, half the rooftops collapsed and blackened").
5. **Set global properties** — overall art style prompt (e.g. "hand-drawn isometric fantasy city map, ink and watercolour, parchment"), palette, era/culture notes, target output dimensions, scale intent (sprawling metropolis vs. compact town).

Quality-of-life requirements:

- Layers with show/hide/lock (regions, lines, points, labels, reference underlay).
- Import a reference image as a tracing underlay (hand sketch photo, or a ProbableTrain / Watabou export).
- Regions are stacked shapes rasterised in z-order (later wins); uncovered canvas gets a default fill type (generic urban / terrain). No shared-edge topology or gap-free partition requirement — vertex snapping is a convenience only.
- Z-ordering for overlapping regions (e.g. a "construction" patch on top of a district).
- Undo/redo, autosave, named saves.
- Project file is plain JSON — diffable, scriptable, versionable in git.

### Phase B — Generate

The user hits **Generate**. The tool:

1. **Compiles conditioning inputs** from the canvas:
   - A flat **segmentation mask** PNG: each region rendered in its type's colour, lines rasterised at weight, landmark points stamped as small shapes.
   - A **line-art / scribble control image**: walls, roads, rivers, coastline as clean strokes (for a structure ControlNet).
   - A **region manifest** JSON: region ID → bounding polygon, type, resolved prompt (type default + custom additions), z-order.
2. **Pass 1 — global coherence:** generates the full map at moderate resolution (~2048px long edge) using the structure ControlNet(s) plus regional prompting, so layout, lighting, and style are consistent across the whole city.
3. **Pass 2 — district-aware tiled detail:** upscales via tiled diffusion (ControlNet Tile / Ultimate-SD-Upscale-style) to the target resolution (8k–16k+). For each tile, the tool re-injects the prompts of the regions intersecting that tile, so detail hallucination is *appropriate*: villas and walled gardens in the noble quarter, crooked sagging rooflines in the slums, cranes and warehouses at the docks. Tile overlap + tile ControlNet handle seam consistency.
4. **Presents the result** in the canvas as a new image layer, aligned 1:1 with the semantic layer (regions remain selectable on top of the artwork).

Generation requirements:

- Progress reporting per pass / per tile; cancellable.
- Seed control (fixed seed for reproducibility, randomise button).
- Generation history: every output retained with its inputs (mask, manifest, seed, settings) so any result can be reproduced or branched.
- "Draft mode": Pass 1 only, fast, for composition iteration before committing to a full tiled run.

### Phase C — Refine

Refinement is region-scoped and iterative, never start-over:

1. **Regenerate region** — select any tagged region (or draw an ad-hoc mask), optionally edit its prompt, and re-run generation *only inside that mask*, with sufficient context padding so the patch blends with surroundings. Backed by inpainting + the same ControlNets cropped to the area.
2. **Edit semantics, then regenerate** — move a wall, retag a district from "market" to "ruins", add a new landmark; the tool knows which areas are dirty and offers targeted regeneration of just those areas.
3. **Variations** — generate N variants of a selected region and pick one.
4. **Touch-up inpaint** — small freehand mask + short prompt for spot fixes ("remove this weird tower").
5. **Detail zoom-in (stretch goal)** — select a district and generate a *separate, higher-zoom* battle-map-adjacent rendering of just that district, style-matched, for use as a closer-scale handout.

### Labels & Export

- Labels are a **vector overlay**: place, style (font, halo, curvature along roads), show/hide per layer. Never part of the diffusion output — eliminates garbled/duplicated AI text entirely.
- Exports:
  - Full-resolution PNG/JPEG/WebP, with or without labels.
  - Tiled export (e.g. DZI / slippy-map tiles) for zoomable web embedding — directly usable on the Elandis campaign wiki.
  - Label layer as SVG.
  - Project JSON.
- Optional: Foundry VTT scene export (image + grid-less scene config).

## 4. Architecture

```
┌────────────────────────────┐
│  Frontend (web app)        │
│  - Canvas editor (regions, │
│    lines, points, labels)  │
│  - Project management      │
│  - Generation UI/history   │
└──────────┬─────────────────┘
           │ REST/WebSocket
┌──────────▼─────────────────┐
│  Orchestrator (Python)     │
│  - Compiles masks/manifest │
│  - Builds ComfyUI graphs   │
│  - Tile scheduler          │
│  - Job queue + history DB  │
└──────────┬─────────────────┘
           │ ComfyUI API (HTTP/WS)
┌──────────▼─────────────────┐
│  ComfyUI (local, RTX 4090) │
│  - SDXL or Flux checkpoint │
│  - ControlNets: scribble/  │
│    lineart, seg, tile      │
│  - Regional prompting      │
│  - Inpainting              │
└────────────────────────────┘
```

**Component notes:**

- **Frontend:** browser-based; canvas via Konva.js / Fabric.js / PixiJS (evaluate; needs polygon editing, layers, large-image tiles, and good pen/freehand support). Single-user, local-first.
- **Orchestrator:** Python (FastAPI). Owns the pipeline logic: rasterising the semantic layer into control images, splitting the canvas into tiles, computing per-tile prompt blends from the region manifest, submitting ComfyUI workflows, stitching results, persisting history (SQLite — same patterns as the test-generation orchestrator: job queue, deterministic control flow, the model only paints).
- **Diffusion backend:** stock ComfyUI so workflows remain inspectable and hand-tweakable. The orchestrator generates workflow JSON via the API rather than depending on a custom node soup. Model choice (SDXL vs Flux), ControlNet selection, and the regional-prompting mechanism are deliberately encapsulated behind the orchestrator so they can be swapped as the ecosystem moves.

## 5. Key Technical Decisions & Risks

| Area | Decision / Risk | Mitigation |
|---|---|---|
| Global coherence vs. detail | One-shot generation can't do both | Two-pass: small coherent base, then district-aware tiled upscale |
| Seams between tiles | Tiled diffusion can show joins | Tile ControlNet + generous overlap + feathered blending; validate early |
| Regional prompt adherence | Models drift from per-region intent | Combine seg-colour conditioning *and* per-tile prompt injection; keep regions ≥ a minimum size relative to tile |
| Street-level plausibility | Diffusion invents streets that go nowhere | Core: procedural street generator (own implementation) fills districts with dense street networks fed into the line-art control, so topology is sound and AI only stylises. District type drives density/irregularity. Phase 0 validates the premise with hand-traced/Watabou stand-in streets |
| AI text artifacts | Garbled, duplicated labels | Labels never generated; vector overlay only |
| Reproducibility | "I liked the old version" | Full input+seed history; every artifact regenerable |
| Model/ecosystem churn | ControlNet/regional tooling evolves fast | Thin orchestrator abstraction over ComfyUI graphs |
| VRAM at 16k output | Even a 4090 has limits | Tiles are independent; stream, don't hold full canvas on GPU |

## 6. MVP Cut & Phasing

**Phase 0 — Pipeline validation (no UI).** Hand-author one segmentation mask + manifest (can derive from the existing nano-banana sketch). Prove in raw ComfyUI: Pass 1 quality, Pass 2 district-aware tiling, region inpaint. *This de-risks everything; do not build UI before this works.*

**Phase 1 — Minimum authoring loop.** Canvas with polygon regions + type tagging + custom prompts; lines for walls/roads/rivers; Generate (both passes); view result. JSON project save/load.

**Phase 2 — Refinement loop.** Region regenerate, ad-hoc inpaint mask, variations, generation history UI.

**Phase 3 — Presentation.** Label overlay editor, exports (PNG, SVG labels, zoomable tiles), reference underlay import.

**Street generator workstream (parallel).** Own procedural street generator: design doc (algorithm, semantic-layer inputs), core implementation (street graph within regions, honouring walls/gates/main roads, district-type-driven density), compiler integration. Starts after Phase 0 validates the dense-streets premise; runs in parallel with Phases 1–2.

**Phase 4 — Nice-to-haves.** Watabou/ProbableTrain import (as an alternative street/layout source), Foundry export, district zoom-in renders, style presets library.

## 7. Success Criteria

1. A 100k-population-scale city is authorable in an evening, not a month.
2. Zooming to any neighbourhood shows *plausible, district-appropriate* detail — buildings front onto streets, districts are visually distinct, no repeated texture noise.
3. A specific local edit ("this quarter burned down") is expressible in under a minute and regenerates without disturbing the rest of the map.
4. No AI-generated text anywhere in the final artwork.
5. Any historical output can be exactly reproduced from stored inputs.

## 8. Decisions (v0.2)

Settled after review discussion, July 2026:

1. **Projection: top-down illustrated.** The MVP commits to top-down / high-angle "illustrated atlas" style so the semantic canvas, control images, region inpainting masks, and label anchors all align 1:1 with the artwork. Isometric is a possible later mode, not attempted now.
2. **Street topology is core, not optional.** A dense street network feeding the line-art control is treated as load-bearing for "buildings front onto streets." We build our own generator (see workstream above); Phase 0 uses hand-traced or Watabou-exported streets as a stand-in so pipeline validation is not blocked on it.
3. **Region model: z-order stacking, not planar topology.** No snap/merge or gap-free partition editing. Compile rasterises regions later-wins; uncovered canvas gets a default fill type. Terrain (water, farmland, forest, barren) and "outside the walls" are first-class region types with a global default surround.
4. **SDXL vs Flux: decided by a Phase 0 bake-off**, not upfront. Regional-prompting mechanism likewise chosen from evidence (attention coupling, seg-colour assist, per-tile injection) — the seg-colour mask is assumed to be at best a weak assist; per-region/per-tile prompt injection is the primary mechanism.
5. **Reproducibility criterion softened to pinned-environment reproducibility.** History stores workflow JSON, model/ControlNet hashes, seeds, and all conditioning inputs; bit-exact output is only guaranteed on the archived environment.
6. **Iteration latency is a success criterion.** Draft (Pass 1) < ~2 min; single region regenerate < ~1 min on the reference 4090. Full tiled renders may take 1–2 h and must checkpoint per tile and resume after interruption.
