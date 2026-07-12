# Experiment C — Pass 2: tiled detail pass

Seams, denoise band, and per-tile prompt injection for the tiled upscale
pass. Issue #5. Builds on the Experiment A winner
(`exp-a/runs/sdxl_st080_end050_s1001`, SDXL + xinsir scribble at strength
0.8 / end 0.5 — including its known water-misread interior, which turns out
to matter a great deal here).

## Verdict summary

- **Denoise band: 0.35–0.55, operating point 0.5** (30-step dpmpp_2m/karras,
  so ~15 effective steps). Below 0.3 the pass only sharpens the upscale;
  at 0.65 palette drift and tile-scale tonal patchwork begin; at 0.8 the
  patchwork is obvious at map scale and content invents freely.
- **Overlap 256 px on 1024 tiles (25% — feather = overlap), linear feather.**
  No visible seams at any tested overlap (64/128/256/384) inside the band —
  the tile ControlNet anchors neighbouring tiles to the same source, so
  disagreement is tonal, not structural. 256 keeps a comfortable margin at
  negligible cost; 384 costs ~44% more tiles for no visible gain.
- **Prompt-blend strategy: masked attention (`ConditioningSetMask` +
  `ConditioningCombine`) is the mechanism of choice**, but see the headline
  finding: at the chosen denoise band **no strategy meaningfully re-authors
  tile content** — injection is a seasoning, not a corrective.
- **Minimum region size:** at the operating point the injection effect is
  flat in region size (it is throttled by denoise/control, not geometry);
  the size threshold only appears at high denoise. See "Minimum region
  size" below for the rule.
- **Seam-quality verdict: PASS** within the band, including across region
  boundaries and at 8k. Evidence in `sheets/` and `crops/`.

## What was run

Harness: `run_tiles.py` (+ `tiling.py`, `workflows.py`) drives raw ComfyUI
over HTTP against the Phase 0 environment (`docs/pipeline/environment.md`).
Per run: upscale the 2048 Pass-1 output 2× with Lanczos, split into 1024px
tiles on a fixed grid, per tile run SDXL img2img (30 steps, cfg 7,
dpmpp_2m/karras, per-tile seed = 1001 + tile index) conditioned by the
**xinsir tile ControlNet** on the same crop (strength 0.6, full duration
unless stated), then stitch with a linear feather equal to the overlap.

Recorded per run in `runs/<run_id>/`: `manifest.json` (all knobs, the
per-tile region coverage fractions, sha256 of models / source / upscale /
stitch, wall-clock, seam metric), `workflows.json` (exact API workflow JSON
of every tile), `preview.jpg`. Full-res `stitched.png` is git-ignored,
regenerable from `workflows.json`. Runs checkpoint per tile and resume.

**Seam metric.** `overlap_disagreement`: before blending, mean |RGB delta|
between adjacent tiles over their shared overlap — measures how differently
two tiles rendered the same pixels (feathering hides small disagreement, not
structural divergence).

Region geometry/prompts come from `experiments/assets/region_manifest.json`
(#2), z-order-resolved to an index map — the same semantics the semantic
compiler will use.

## Denoise sweep (`sheets/denoise.jpg`, `crops/denoise_*.jpg`, `crops/seamband_*.jpg`)

Global style prompt, overlap 256. Disagreement rises smoothly with denoise —
there is no cliff; the failure mode is not a visible join:

| denoise | seam mean | seam max | verdict |
|---|---|---|---|
| 0.2 | 7.4 | 9.7 | faithful; mild sharpen only, little added detail |
| 0.3 | 9.0 | 11.5 | faithful; linework crisps up |
| 0.4 | 10.7 | 13.3 | detail band begins: hatching, roof texture, ink weight |
| 0.5 | 12.7 | 15.1 | **operating point**: real added detail, layout intact |
| 0.65 | 16.2 | 18.3 | palette drift; tile-scale tonal patchwork emerges |
| 0.8 | 18.1 | 20.6 | obvious green/purple patchwork at map scale; invents structures |

- **No hard seams at any denoise** — even 0.8 shows continuous linework
  through the overlap band (`crops/seamband_dn080.jpg`). The tile ControlNet
  pins both neighbours to the same underlying image; what diverges is tone.
- **The real seam failure is macro, not micro:** at ≥0.65 each tile drifts
  to its own palette and the feathered result reads as a patchwork quilt at
  map scale (`runs/dn080_ov256_global/preview.jpg`), even though every
  individual join is clean at 100%.
- Cost at 4096² (25 tiles, 4090): ~153 s per full pass at denoise ≥0.4
  (~6 s/tile); denoise scales effective steps, so lower denoise is cheaper.
- **Text-risk note:** from ~0.5 upward, occasional glyph-like doodles appear
  inside blocks (letter-shaped marks, present under the global prompt too —
  not caused by injection) despite the negative prompt. Nothing reads as
  words at 0.5, but `docs/VISION.md`'s no-generated-text rule makes this
  worth watching in #8's validation set.

## Overlap sweep (`crops/overlap_seams.jpg`)

At denoise 0.5, overlap ∈ {64, 128, 256, 384} (feather = overlap):

| overlap | tiles | seam mean | notes |
|---|---|---|---|
| 64 | 25 | 13.4 | no visible seam, but no margin; highest disagreement |
| 128 | 25 | 12.7 | clean |
| 256 | 25 | 12.7 | clean — **chosen** |
| 384 | 36 | 12.3 | clean; +44% tiles for nothing visible |

Inside the denoise band, overlap barely matters visually; 256 (25%) is kept
as the generous-margin default since its cost at fixed tile count is zero
until the grid gains a row/column. Feather must not exceed overlap
(`tiling.stitch` invariant), and canvas-boundary edges must not be feathered
or normalisation attenuates the border.

## Per-tile prompt injection (`crops/blend_*.jpg`)

Strategies at denoise 0.5 / overlap 256, per-tile region sets from the
z-resolved index map (participation thresholds: concat ≥5%, area ≥2%,
mask ≥1% of tile area):

- **global** — control condition, base style prompt only.
- **concat** — base prompt + region prompt fragments, largest-first, one
  CLIP encode. 25 tiles / 159 s.
- **area** — per-region encodes folded into an exact area-weighted embedding
  average (`ConditioningAverage` chain). 25 tiles / 153 s.
- **mask** — per-region encodes attention-masked to the region's pixels in
  the tile (`ConditioningSetMask` strength 1.0 + `ConditioningCombine`).
  25 tiles / **415 s — ~2.7× cost**: sampling scales with the number of
  masked conditioning entries per tile (≈3–9 here).

**Headline finding: at the usable denoise band, injection cannot re-author
Pass-1 content.** The exp-a winner renders the walled interior as a blue
gridded lake; a docks tile prompted "harbour docks, piers and warehouses"
stays water (`crops/blend_docks.jpg`), the construction site stays water,
and the effect of any strategy is marginal decoration (small boats appear,
ink details shift). Quantitatively (seed-matched runs, so conditioning is
the only variable): per-region mean |Δ| vs the global run is 1.1–3.5 gray
levels for *every* region under both mask and area — at the whole-image
noise floor (2.9/2.8), with no dependence on region size. Denoise 0.5 +
tile CN 0.6 simply leaves the prompt no authority.

Consequences:

1. **District semantics must be correct at Pass 1.** Pass 2 refines what
   exists; it will not fix a misread. This hardens the exp-a "implications"
   item: the #8 regional mechanism (control encoding / regional
   conditioning) is where district identity gets decided, not the detail
   pass.
2. Within its lane (styling detail that is already the right kind of
   content), masked attention is the correct mechanism — it is the only
   strategy whose changes land exactly inside the region's pixels; concat
   bleeds every region's wording across the whole tile and dilutes with
   region count; area is a whole-tile average by construction.

### High-denoise probes (headroom for re-authoring)

Masked injection with more room to act (`sheets/followup.jpg`,
`crops/dn065mask_*.jpg`, `crops/dn080mask_*.jpg`, `crops/cn030mask_*.jpg`):

| run | seam mean | verdict |
|---|---|---|
| dn065 global | 16.2 | (control) palette drift, mild patchwork |
| dn065 mask | 20.3 | injection acts — scaffolding appears on the 4.4%-of-tile construction site, wharf texture at the docks shore — but with speckle artifacts and spillover outside the region mask |
| dn080 mask | 28.5 | collapse: an entire quadrant washes into grey-pink haze, purple patchwork everywhere |
| dn065 mask, tile CN 0.3 | 31.3 | most injection authority (dock shore renders as wood boardwalk) and the worst seams, plus a magenta artifact bloom |
| dn065 global, tile CN 0.3 | 28.3 | (control) weak CN alone wrecks tile agreement — no injection involved |

Two structural facts fall out:

- **The tile ControlNet at 0.6 is what keeps neighbouring tiles agreeing.**
  Dropping it to 0.3 nearly doubles overlap disagreement even with a plain
  global prompt. It cannot be traded away for prompt authority.
- **Injection authority and pass quality are the same budget.** Raising
  denoise or weakening control gives region prompts real power, but the
  artifacts (speckles, haze, patchwork) always arrive before clean
  re-authoring does. There is no setting where the detail pass both
  preserves Pass 1 and meaningfully repaints a district.

## Minimum region size

At the operating point injection is uniformly weak, so **no size cliff is
observable at denoise 0.5** — region size is not the gating variable;
denoise and control strength are. At denoise 0.65 (where masked injection
visibly acts), the *smallest* region in the test city — the
construction-site overlay at **4.4% of a tile's area (~1/5 of the tile
linearly)** — still receives its prompt (scaffolding/rubble render on it;
per-region |Δ| 11.8 vs 8.7 noise floor). No lower bound was reached with
the masked strategy.

Working rule for the UI and #8, from mechanism rather than a measured
cliff: attention masks are consumed at the UNet's attention resolutions
(down to 32× downsampling at 1024px), so a region narrower than ~64 px at
render scale (**~1/16 of the tile linearly, ≈0.4% of tile area**) cannot
survive mask downsampling and its prompt will smear into neighbours.
Between that hard floor and our smallest verified region (4.4% area), the
behaviour is untested — **warn in the UI when a region covers less than
~4% of a tile's area (~1/5 linear) at render scale**, and treat anything
below ~0.4% as not individually promptable (fold it into its parent
region's prompt instead). Concat has no spatial targeting at all, so for
small regions it is not merely weak but wrong — it restyles the whole
tile; do not use it below one-region-per-tile dominance.

## 8k progressive pass (`runs/scale8k_mask`, `crops/scale8k_zoom.jpg`)

The recommended recipe applied a second time: the dn050 mask run's 4096
output upscaled 2× again to **8192², 121 tiles, masked strategy** —
the realistic progressive path to the 8k–16k target.

- **Seam quality holds and improves: mean disagreement 6.6** (vs 12.7 for
  the first application) — a Pass-2 output re-tiled is even more
  self-consistent, so quality does not degrade with stacking; no patchwork,
  no double-processing artifacts, linework continuous through every seam
  checked at 100%.
- Cost: **1275 s (21 min) for 121 masked tiles** (~10.5 s/tile — cheaper
  per tile than at 4096 because each 8k tile covers less map, hence fewer
  region conditionings). Projected full chain 2048 → 4096 → 8192 at the
  recipe: **~25 min on the 4090** with masked injection, ~16 min with a
  global prompt — comfortably inside the 1–2 h budget in `docs/VISION.md`,
  leaving room for a 16k third application (~4× the tile count).
- Caveat carried forward: at 8k the underlying drawing is a 4× enlargement
  of a 2048 layout, so blocks read as large soft washes with crisp ink
  edges. District-appropriate *content* density at high zoom (success
  criterion 2) still depends on Pass 1 supplying real street/building
  structure — same conclusion as the injection findings.

## Recommended Pass-2 recipe (input to #8)

- SDXL img2img per 1024px tile over a Lanczos 2× upscale of the previous
  pass; progressive 2× per pass to reach 8k–16k.
- xinsir tile ControlNet on the tile's own source crop, **strength 0.6,
  full duration** — this is the seam-agreement mechanism; do not weaken it.
- **Denoise 0.5** (band 0.35–0.55), 30 steps dpmpp_2m/karras, cfg 7,
  per-tile seed = base seed + tile index.
- **Overlap 256 px, linear feather = overlap**, full-weight edges at the
  canvas boundary, normalise by accumulated weight.
- **Masked attention** (`ConditioningSetMask` + `ConditioningCombine`) for
  per-tile region prompts, participation threshold ~1% of tile area.
  Budget for it: sampling cost scales with regions-per-tile (~2.7× observed
  at 3–9 regions). If the budget is tight, the global style prompt loses
  almost nothing *on a semantically-correct Pass 1 base* at denoise 0.5 —
  decide in #8 once Experiment B's regional mechanism fixes the base.
- **Do not use the detail pass to fix district identity.** Region identity
  must be right after Pass 1 (that is #4/#6/#8's job); expressing "this
  quarter burned down" belongs to region regeneration/inpainting (#6), not
  to Pass-2 prompt injection.
- Record per tile: workflow JSON, seed, crop coords, region fractions —
  the run manifests here are the shape the orchestrator's history needs.

_Reproduce:_ `python3 run_tiles.py --port <comfy_port> --phase all` against
the Phase 0 environment; completed runs are skipped, so it resumes rather
than repeats. Contact sheets / crops: `make_sheets.py`.
