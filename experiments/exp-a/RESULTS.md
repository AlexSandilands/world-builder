# Experiment A — Pass 1: SDXL vs Flux bake-off

Decides which model family drives the Pass 1 base render (whole map at 2048px,
structure ControlNet + global style prompt) and whether layout adherence is
good enough to build the rest of the pipeline on. Issue #3.

## Verdict

**SDXL (with the xinsir scribble ControlNet) proceeds. Flux (InstantX union
ControlNet, canny mode) is rejected for Pass 1.**

- **Style / "is it a hand-drawn ink-and-watercolour fantasy city map":**
  SDXL — yes, convincingly, across the whole strength range. Flux — no; it
  collapses to a flat, embossed-relief medallion floating on a grey gradient
  and never reads as ink-and-watercolour line art.
- **"Generated roads/walls follow the control within visual tolerance":**
  SDXL — **PASS** at control strength 0.6–0.8 (ring walls and radial highways
  are clearly placed by the control). Flux — **FAIL**; the control leaves only
  a faint embossed ghost of the structure and destroys the style doing it.
- **Cost:** SDXL median 33 s/render (30–60 s), Flux median 95 s (87–147 s) at
  2048² on the reference 4090 — Flux is ~3× slower for a worse result.

The one substantive SDXL caveat is a **semantic misread**, not an adherence
failure: the control's dense cross-hatched district fill gets interpreted as
**water** (blue gridded lakes) at strength ≥ 0.6. This is a control-image
design problem to solve upstream in the semantic compiler (see
"Implications"), not a reason to prefer Flux — Flux fails the same districts
far more completely.

## What was run

Harness: `run_sweep.py` drives raw ComfyUI over its HTTP API (the same
`POST /prompt` → poll `/history` → `GET /view` shape the orchestrator will
use). Every run is recorded under `runs/<run_id>/`: exact API `workflow.json`,
`manifest.json` (seed, strength, end_percent, prompts, sha256 of every model
file and of the control image, wall-clock, resolution), and a 1024px
`preview.jpg`. Full-resolution `output.png` is git-ignored (large, and exactly
regenerable from the recorded workflow); previews and manifests are committed.

Control asset: `experiments/assets/lineart_dense.png` (#2) — a top-down city
with an outer ring wall, an inner ring wall, radial highways, and dense
cross-hatched grid districts, black-on-parchment. Both ControlNets are trained
on white-on-black, so each workflow inverts the asset in-graph (recorded in the
workflow JSON). Global prompt: *"hand-drawn top-down fantasy city map, ink and
watercolour."*

- **Adherence phase (16 runs, complete):** SDXL and Flux × strength
  {0.4, 0.6, 0.8, 1.0} × seed {1001, 2002}, dense control, base prompt.
  Contact sheets: `sheets/adherence_sdxl.jpg`, `sheets/adherence_flux.jpg`.
- **Follow-up phase (6 runs, complete):** targeted `end_percent` probes
  motivated by the adherence results (release the control before the final
  denoising steps). Flux {0.2/0.8, 0.3/0.8, 0.4/0.5, 0.6/0.4},
  SDXL {0.8/0.5, 1.0/0.4} as strength/end_percent. Sheet: `sheets/followup.jpg`.
- **Scale phase (6 runs):** prompt-wording and control-density knobs for
  apparent building size. See "Scale-control findings" below.

## SDXL findings (`sheets/adherence_sdxl.jpg`, `sheets/followup.jpg`)

- **Strength 0.4** — best pure style: a clean, forested, ring-road city with
  radial avenues, tiny densely-packed rooftops, no text artifacts. Adherence
  is *loose*: it is recognisably a ring-and-radial city but does not lock to
  both concentric walls.
- **Strength 0.6–0.8** — adherence tightens: both ring walls and the radial
  highways are clearly placed by the control. This is the usable adherence
  band. **But** the dense cross-hatch district fill starts being read as
  water: the interior becomes a large blue gridded lake (`sdxl_st080_s1001`).
- **Strength 1.0** — structure is followed hard but the whole interior is
  water and the image gets busy/artifact-prone. Not preferred.
- **Follow-up (release control early):** `sdxl_st080_end050_s1001` is the most
  city-like SDXL result — it keeps the ring/road structure from the first
  half of denoising, then lets the model render proper gridded streets and
  richly detailed buildings over the districts instead of flat water. Some
  blue basins remain, so early cutoff *reduces but does not eliminate* the
  water misread. `sdxl_st100_end040` still shows the two blue basins.
- **Seeds:** 1001 vs 2002 change palette and coastline but not the
  conclusions — structure adherence and the water-misread are seed-stable.
- **Text artifacts:** none observed in any SDXL run.

**Recommended SDXL operating point for downstream work:** strength **0.6–0.8**
with **`end_percent` ≈ 0.5**. Treat as provisional — the region mechanism
chosen in #8 may move it.

## Flux findings (`sheets/adherence_flux.jpg`, `sheets/followup.jpg`)

- The InstantX union ControlNet in canny/lineart mode does not carry this
  style. At strength 0.4 the output is a flat embossed relief with an ornate
  picture-frame border (`flux_st040_s1001`); one seed (`flux_st040_s2002`)
  gives a flatter coloured-district plan with a compass rose — the single best
  Flux frame, and still washed-out with no ink linework.
- Strength 0.6–1.0 progressively worse: the city collapses to a pale
  embossed medallion on a grey/brown gradient, the radial roads survive only
  as faint scratches. Unusable.
- Follow-up `end_percent` probes (0.2–0.6 strength, early cutoff) recover a
  little structure but never the style: results are tiny map medallions in
  large empty vignettes (`flux_st020_end080`, `flux_st040_end050`) or the same
  flat relief (`flux_st060_end040`).
- ~3× slower than SDXL throughout.

Not pursued: a different Flux control (e.g. depth/tile in the same union model,
or a dedicated lineart ControlNet). The style gap is large and SDXL already
clears the bar, so this is out of scope for the Pass-1 decision; revisit only
if a later requirement forces Flux.

## Scale-control findings

<!-- PENDING: the dedicated scale phase (6 runs) requires the GPU, which is
currently in use by another workload on the shared 4090. This section is
filled in once those runs complete; the harness resumes them automatically
(execute_run skips any run whose manifest already exists). -->

Direct evidence from the completed phases already indicates:

- **Control density dominates apparent building size / district texture.** The
  dense cross-hatch fill drives the model toward a fine street grid (and, in
  SDXL ≥ 0.6, toward reading that grid as gridded water). Apparent building
  size tracks the control's line spacing more than anything in the prompt.
- **Building scale in SDXL is already plausible** at low strength / early
  cutoff: rooftops are tiny relative to the city extent and the map reads as a
  real city, not a handful of oversized houses.

The scale phase isolates two knobs on top of this to confirm which one to
expose in the compiler:

- **Prompt wording** — base vs *"…tiny densely packed rooftops, vast city
  sprawl"* vs *"…detailed large buildings, close aerial view."*
- **Control density** — dense vs sparse line-art (`lineart_sparse.png`).

Pinned strengths: SDXL 0.8, Flux 0.6. Run IDs:
`sdxl_scale_{base_sparse,tiny_dense,large_dense}_st080_s1001`,
`flux_scale_{base_sparse,tiny_dense,large_dense}_st060_s1001`.

## Implications for downstream issues (#4–#7)

- Build Pass 1 on **SDXL + xinsir scribble** at strength ~0.6–0.8 with an
  early control cutoff.
- The **cross-hatch-as-water misread is the thing to design around** in the
  control encoding / semantic compiler (#4, #5): a uniform dense hatch is an
  ambiguous signal. Options to evaluate downstream — per-region control
  imagery or regional prompting so district fills are labelled as built-up
  land rather than a texture the base model is free to read as water; or a
  sparser structural control (walls/roads only) with district character
  supplied by prompt/region conditioning rather than by hatch density.
- Flux is not needed for Pass 1; keep its assets for possible later use
  (inpainting/detail passes) but do not gate Pass 1 on it.

_Reproduce:_ `python3 run_sweep.py --port <comfy_port> --phase all` against the
Phase 0 environment (`docs/pipeline/environment.md`); completed runs are
skipped, so it resumes rather than repeats.
