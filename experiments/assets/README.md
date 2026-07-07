# Phase 0 test-city assets

Hand-authored conditioning assets for a ~20-district test city, produced for
issue #2. These feed the Phase 0 ComfyUI experiments (#3-#7); the geometry
lives in `citylayout.py` as fixed constants and closed-form functions (no
randomness), rendered by `render.py` via `generate_assets.py`. This is a
throwaway precursor to the real schema (#10) and the real semantic compiler
(#12) — field names are kept sensible but nothing here is load-bearing on
the eventual JSON Schema.

## Files

- `segmentation_mask.png` — 2048x2048, flat per-region colour fill.
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

## Colour table (26 types)

| Type | Category | Hex |
|---|---|---|
| `wilderness` | base | `#6b7a4a` |
| `forest` | terrain | `#2f5233` |
| `farmland` | terrain | `#c9b458` |
| `lake` | terrain | `#3a6ea5` |
| `city_ground` | streetbed | `#a8a394` |
| `noble_quarter` | district | `#9d8fc7` |
| `temple_district` | district | `#e8e2d0` |
| `market_square` | district | `#e0973c` |
| `guild_hall` | district | `#8a6642` |
| `keep` | district | `#6a4c93` |
| `artisan_quarter` | district | `#c98a3c` |
| `residential_modest` | district | `#b5946a` |
| `university` | district | `#4f8a8b` |
| `park` | district | `#6fae5c` |
| `barracks` | district | `#8b3a3a` |
| `granary` | district | `#d4a94b` |
| `stables_district` | district | `#7a5c3e` |
| `city_gate_plaza` | district | `#cbbfa8` |
| `residential_dense` | district | `#d1b28c` |
| `slum` | district | `#6e6259` |
| `docks` | district | `#5c7a8a` |
| `warehouse_district` | district | `#5a5a52` |
| `tannery` | district | `#9a8f3f` |
| `cemetery` | district | `#4a4453` |
| `river` | terrain | `#4f8fce` |
| `construction_site` | overlay | `#f2b705` |

## Region types represented (26)

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
