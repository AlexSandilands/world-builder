#!/usr/bin/env python3
"""Regenerates the Phase 0 test-city assets (issue #2) into this directory.

Deterministic: re-running with an unchanged citylayout.py/render.py produces
byte-identical PNGs and JSON. Requires Pillow (`pip install pillow`); not a
project dependency, since this is a throwaway Phase 0 precursor, not
orchestrator/frontend code.
"""
import json
from pathlib import Path

from citylayout import build_regions
from render import color_table_markdown, render_lineart_dense, render_lineart_sparse, render_segmentation_mask

OUT = Path(__file__).parent

README_TEMPLATE = """# Phase 0 test-city assets

Hand-authored conditioning assets for a ~20-district test city, produced for
issue #2. These feed the Phase 0 ComfyUI experiments (#3-#7); the geometry
lives in `citylayout.py` as fixed constants and closed-form functions (no
randomness), rendered by `render.py` via `generate_assets.py`. This is a
throwaway precursor to the real schema (#10) and the real semantic compiler
(#12) — field names are kept sensible but nothing here is load-bearing on
the eventual JSON Schema.

## Files

- `segmentation_mask.png` — {canvas}x{canvas}, flat per-region colour fill.
- `lineart_sparse.png` — walls, main roads, and the river/coastline only.
- `lineart_dense.png` — sparse plus a hand-traced street fill per district,
  standing in for a Watabou street-layout export. Experiment E (#7) compares
  the two.
- `region_manifest.json` — every region: id, type, category, z (draw-order
  index — later/higher wins, matching `docs/VISION.md`'s z-order semantics),
  resolved prompt, polygon geometry, and bbox.

## Layout

A walled city (an irregular, hand-perturbed circle, not a perfect circle)
with a central keep, a 4-sector inner ring (noble/temple/market/guild), a
7-sector middle ring, and a 9-sector outer ring at the wall (3 of which are
gate plazas). Three road gates plus a separate river crossing break the
wall. Outside the wall: forest patches, a farmland belt, a lake the river
empties into, and open wilderness filling whatever the other terrain
doesn't cover.

## Z-order / default-fill demonstration

The draw order is: wilderness (canvas-wide default fill) -> forest patches
-> farmland -> lake -> city_ground (the walled interior's default fill) ->
ring 1 districts -> keep -> ring 2 districts -> ring 3 districts -> river
(drawn last-but-one so it visibly cuts across both countryside and city,
same as a real river ignores district boundaries) -> the construction-site
overlay (a small patch stacked on the slum district, the highest z-order
region in the set). Any later region fully overrides earlier ones where
polygons overlap; `wilderness` and `city_ground` are what show through
wherever nothing more specific was drawn.

## Colour table ({count} types)

{table}

## Region types represented ({type_count})

Includes at least one overlay region (`construction_site`, stacked on a
`slum` sector) and terrain outside the walls (`forest`, `farmland`, `lake`,
`wilderness`), satisfying the issue's >=15-distinct-types and overlay/terrain
acceptance criteria.

## Regenerating

```
cd experiments/assets
pip install pillow
python3 generate_assets.py
```
"""


def main() -> None:
    regions = build_regions()

    seg = render_segmentation_mask(regions)
    seg.save(OUT / "segmentation_mask.png")

    render_lineart_sparse(regions).save(OUT / "lineart_sparse.png")
    render_lineart_dense(regions).save(OUT / "lineart_dense.png")

    manifest = {
        "canvas": {"width": seg.width, "height": seg.height},
        "regionCount": len(regions),
        "regions": regions,
    }
    (OUT / "region_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    distinct_types = sorted({r["type"] for r in regions})
    readme = README_TEMPLATE.format(
        canvas=seg.width,
        count=len(distinct_types),
        type_count=len(distinct_types),
        table=color_table_markdown(),
    )
    (OUT / "README.md").write_text(readme)

    print(f"regions: {len(regions)}, distinct types: {len(distinct_types)}")
    print(f"types: {', '.join(distinct_types)}")


if __name__ == "__main__":
    main()
