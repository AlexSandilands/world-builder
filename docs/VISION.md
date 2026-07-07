# Vision

Creating large fantasy city maps (50k–100k+ population) forces a bad choice: manual tools (Dungeondraft, Inkarnate) give control but building-by-building labor caps you at small towns; image generation is fast but can't express fine-grained intent ("this district is run-down") and fails characteristically — repeated texture instead of street logic, garbled labels, ambiguous scale.

This tool takes the middle ground: **the user authors the semantic structure** (regions, walls, roads, landmarks — tagged with types and prompts) **and a local diffusion pipeline renders the artwork** via a global-coherence pass then a district-aware tiled detail pass. Refinement is region-scoped and iterative, never start-over. Labels are a vector overlay, never generated pixels.

## Success criteria

1. A 100k-population-scale city is authorable in an evening, not a month.
2. Zooming to any neighbourhood shows plausible, district-appropriate detail — buildings front onto streets, districts are visually distinct, no repeated texture noise.
3. A specific local edit ("this quarter burned down") is expressible in under a minute and regenerates without disturbing the rest of the map.
4. No AI-generated text anywhere in the final artwork.
5. Any historical output is reproducible from stored inputs on the pinned environment (workflow JSON, model hashes, seeds all recorded).
6. Iteration stays fast: draft pass < ~2 min, single region regenerate < ~1 min on the reference GPU (RTX 4090). Full tiled renders may take 1–2 h and must checkpoint/resume.

## Standing decisions

- **Top-down illustrated projection.** The semantic canvas, control images, inpaint masks, and labels align 1:1 with the artwork. Isometric is out of scope.
- **Street topology is core.** A procedural street generator (our own) feeds dense, sound street networks into the line-art control; the AI only stylises. District type drives street density and character.
- **Regions stack in z-order** (later wins, default fill for uncovered canvas). No planar-topology editing. Terrain and "outside the walls" are first-class region types.
- **Labels are vector-only**, always. The reference failure image at `experiments/reference/failure-example.png` shows what baking text into pixels produces.
- **Thin seam over ComfyUI.** The orchestrator generates workflow JSON against a stock ComfyUI API; models/ControlNets/mechanisms stay swappable. Pipeline settings live in `docs/pipeline/DECISIONS.md`, decided by experiment, never hardcoded.
