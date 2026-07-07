# Pipeline docs

Phase 0 outputs land here:

- `environment.md` — ComfyUI commit, model files + hashes, GPU/driver versions (#1).
- `DECISIONS.md` — binding pipeline decisions from the Phase 0 synthesis (#8): checkpoint family, ControlNet set, Pass 1 regional mechanism + region ceiling, tile size/overlap/denoise/prompt-blend settings, inpaint settings, minimum-region-size rule, street density requirement.

Until #8 closes, nothing in `orchestrator/` may hardcode pipeline settings — they all trace back to `DECISIONS.md`.
