"""Geometry for the hand-authored Phase 0 test city (issue #2).

Deterministic by construction: every coordinate is a fixed constant or a
closed-form function of angle, no RNG. Re-running produces byte-identical
output, which is what makes `generate_assets.py` safe to re-run after edits.

Layout: a walled circular-ish city (wall silhouette = perturbed circle) with
three concentric rings of districts around a central keep, plus terrain
(farmland/forest/lake) outside the wall and a river cutting through.
"""
import math

CANVAS = 2048
CENTER = (1024.0, 1024.0)

# Wall silhouette: a circle perturbed by two harmonics so it reads as
# hand-drawn rather than a perfect circle. Ring boundaries reuse this same
# function (scaled by radius fraction) so every ring follows the same
# irregular outline as the wall.
R0, A1, A2, P1, P2 = 620.0, 45.0, 18.0, 0.4, 1.1


def wall_radius(theta: float) -> float:
    return R0 + A1 * math.cos(3 * theta + P1) + A2 * math.cos(5 * theta + P2)


def point_at(theta: float, radius: float) -> tuple[float, float]:
    cx, cy = CENTER
    return (cx + radius * math.cos(theta), cy + radius * math.sin(theta))


def radius_at(theta: float, frac: float) -> float:
    return wall_radius(theta) * frac


# Ring radius fractions of the wall silhouette, inner to outer.
FRAC_KEEP = 0.16
FRAC_RING1 = 0.40
FRAC_RING2 = 0.72
FRAC_RING3 = 1.00  # = the wall itself

ANGLE_OFFSET = -math.pi / 2  # slot 0 starts at the top (north)


def ring_loop(frac: float, steps: int = 128) -> list[tuple[float, float]]:
    """Closed polygon loop at a given radius fraction, full 360 degrees."""
    return [
        point_at(2 * math.pi * i / steps, radius_at(2 * math.pi * i / steps, frac))
        for i in range(steps)
    ]


def sector_polygon(
    theta_start: float, theta_end: float, frac_inner: float, frac_outer: float, steps: int = 16
) -> list[tuple[float, float]]:
    """Annular wedge between two angles and two radius fractions."""
    pts = []
    for i in range(steps + 1):
        t = theta_start + (theta_end - theta_start) * i / steps
        pts.append(point_at(t, radius_at(t, frac_outer)))
    for i in range(steps + 1):
        t = theta_end - (theta_end - theta_start) * i / steps
        pts.append(point_at(t, radius_at(t, frac_inner)))
    return pts


def slot_bounds(index: int, count: int) -> tuple[float, float]:
    width = 2 * math.pi / count
    start = ANGLE_OFFSET + index * width
    return start, start + width


def slot_mid_angle(index: int, count: int) -> float:
    start, end = slot_bounds(index, count)
    return (start + end) / 2


def perturbed_disk(cx: float, cy: float, r: float, wobbles: list[tuple[float, float, float]], steps: int = 48):
    """Irregular blob: circle perturbed by a fixed list of (amplitude, freq, phase)."""
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        rr = r
        for amp, freq, phase in wobbles:
            rr += amp * math.cos(freq * t + phase)
        pts.append((cx + rr * math.cos(t), cy + rr * math.sin(t)))
    return pts


# Ring1: 4 sectors immediately around the keep.
RING1_TYPES = ["noble_quarter", "temple_district", "market_square", "guild_hall"]

# Ring2: 7 sectors, the "middle city".
RING2_TYPES = [
    "artisan_quarter",
    "residential_modest",
    "university",
    "park",
    "barracks",
    "granary",
    "stables_district",
]

# Ring3: 9 sectors at the wall. Slots 0, 3, 6 are the road gates.
RING3_TYPES = [
    "city_gate_plaza",
    "residential_dense",
    "slum",
    "city_gate_plaza",
    "docks",
    "warehouse_district",
    "city_gate_plaza",
    "tannery",
    "cemetery",
]
GATE_SLOT_INDICES = [0, 3, 6]

# River crossing sits between ring3 slots (near the docks sector, index 4)
# but is its own break in the wall, distinct from the road gates.
RIVER_SLOT_INDEX = 4


def gate_angles() -> list[float]:
    return [slot_mid_angle(i, len(RING3_TYPES)) for i in GATE_SLOT_INDICES]


def river_crossing_angle() -> float:
    return slot_mid_angle(RIVER_SLOT_INDEX, len(RING3_TYPES))


def build_regions() -> list[dict]:
    """Ordered list of fill regions, draw order == z-order (later wins)."""
    regions: list[dict] = []

    def add(id_, type_, category, polygon, prompt):
        xs = [p[0] for p in polygon]
        ys = [p[1] for p in polygon]
        regions.append(
            {
                "id": id_,
                "type": type_,
                "category": category,
                "z": len(regions),
                "prompt": prompt,
                "geometry": {"kind": "polygon", "points": [[round(x, 1), round(y, 1)] for x, y in polygon]},
                "bbox": [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)],
            }
        )

    # --- base fill: whole canvas ---
    add(
        "wilderness-01",
        "wilderness",
        "base",
        [(0, 0), (CANVAS, 0), (CANVAS, CANVAS), (0, CANVAS)],
        "empty scrubland and rough grass, untouched wilderness, top-down fantasy map illustration",
    )

    # --- terrain outside the wall ---
    forest_specs = [
        (330, 320, 190, [(35, 3, 0.2), (18, 5, 1.0)]),
        (1870, 380, 165, [(30, 3, 0.7), (15, 6, 0.4)]),
        (1880, 1780, 175, [(28, 3, 1.3), (14, 5, 0.9)]),
    ]
    for i, (cx, cy, r, wobbles) in enumerate(forest_specs, start=1):
        add(
            f"forest-{i:02d}",
            "forest",
            "terrain",
            perturbed_disk(cx, cy, r, wobbles),
            "dense fantasy forest canopy, top-down map illustration, dark green treetops",
        )

    add(
        "farmland-01",
        "farmland",
        "terrain",
        [
            (0, 1420), (620, 1300), (980, 1500), (1120, 1780),
            (980, CANVAS), (0, CANVAS),
        ],
        "cultivated farmland in patchwork strips, hedgerows, top-down fantasy map illustration",
    )

    add(
        "lake-01",
        "lake",
        "terrain",
        perturbed_disk(1790, 1790, 210, [(30, 3, 0.5), (12, 6, 1.5)]),
        "still lake water, top-down fantasy map illustration, deep blue",
    )

    # --- the walled city's default interior fill ---
    add(
        "city-ground-01",
        "city_ground",
        "streetbed",
        ring_loop(FRAC_RING3),
        "packed dirt and cobbled streets, neutral city ground, top-down fantasy map illustration",
    )

    # --- ring 1 ---
    ring1_prompts = {
        "noble_quarter": "walled noble quarter, manicured gardens and townhouses, top-down fantasy map illustration",
        "temple_district": "temple district, plazas and shrine courtyards, pale stone, top-down fantasy map illustration",
        "market_square": "bustling market square, stalls and awnings, top-down fantasy map illustration",
        "guild_hall": "guild hall district, workshops and counting houses, top-down fantasy map illustration",
    }
    for i, t in enumerate(RING1_TYPES):
        start, end = slot_bounds(i, len(RING1_TYPES))
        add(f"{t.replace('_','-')}-01", t, "district", sector_polygon(start, end, FRAC_KEEP, FRAC_RING1), ring1_prompts[t])

    # --- keep, drawn after ring1 so it sits cleanly at the centre ---
    add(
        "keep-01",
        "keep",
        "district",
        ring_loop(FRAC_KEEP, steps=64),
        "royal keep and citadel, fortified tower, top-down fantasy map illustration",
    )

    # --- ring 2 ---
    ring2_prompts = {
        "artisan_quarter": "artisan quarter, workshops and kilns, top-down fantasy map illustration",
        "residential_modest": "modest residential district, terraced houses, top-down fantasy map illustration",
        "university": "university district, lecture halls and cloisters, top-down fantasy map illustration",
        "park": "public park, winding paths and gardens, top-down fantasy map illustration",
        "barracks": "military barracks, drill yards, top-down fantasy map illustration",
        "granary": "granary district, storehouses and threshing yards, top-down fantasy map illustration",
        "stables_district": "stables and coach yards, top-down fantasy map illustration",
    }
    for i, t in enumerate(RING2_TYPES):
        start, end = slot_bounds(i, len(RING2_TYPES))
        add(f"{t.replace('_','-')}-01", t, "district", sector_polygon(start, end, FRAC_RING1, FRAC_RING2), ring2_prompts[t])

    # --- ring 3 (incl. gate plazas) ---
    ring3_prompts = {
        "city_gate_plaza": "city gate plaza, fortified gatehouse approach, top-down fantasy map illustration",
        "residential_dense": "dense residential district, narrow lanes and tight housing, top-down fantasy map illustration",
        "slum": "slum district, crowded shanty housing, top-down fantasy map illustration",
        "docks": "harbour docks, piers and warehouses on the waterfront, top-down fantasy map illustration",
        "warehouse_district": "warehouse district, loading yards, top-down fantasy map illustration",
        "tannery": "tannery and rendering yards, downwind industry, top-down fantasy map illustration",
        "cemetery": "cemetery district, headstones and mausoleums, top-down fantasy map illustration",
    }
    type_counts: dict[str, int] = {}
    for i, t in enumerate(RING3_TYPES):
        start, end = slot_bounds(i, len(RING3_TYPES))
        type_counts[t] = type_counts.get(t, 0) + 1
        add(
            f"{t.replace('_','-')}-{type_counts[t]:02d}",
            t,
            "district",
            sector_polygon(start, end, FRAC_RING2, FRAC_RING3),
            ring3_prompts[t],
        )

    # --- river ribbon, drawn last-but-one so it cuts visibly across
    # countryside and city alike (a river doesn't care about district
    # boundaries) ---
    river_pts = river_polyline()
    add(
        "river-01",
        "river",
        "terrain",
        _ribbon_polygon(river_pts, width=34),
        "river cutting through the city to a harbour, top-down fantasy map illustration",
    )

    # --- overlay: a small construction patch stacked on a ring3 district,
    # demonstrating z-order later-wins semantics ---
    slum_start, slum_end = slot_bounds(RING3_TYPES.index("slum"), len(RING3_TYPES))
    slum_mid = (slum_start + slum_end) / 2
    patch_r = radius_at(slum_mid, (FRAC_RING2 + FRAC_RING3) / 2)
    px, py = point_at(slum_mid, patch_r)
    add(
        "construction-site-01",
        "construction_site",
        "overlay",
        perturbed_disk(px, py, 60, [(14, 3, 0.3), (7, 5, 1.2)], steps=24),
        "collapsed building under repair, scaffolding and rubble, small construction patch, top-down fantasy map illustration",
    )

    return regions


def river_polyline() -> list[tuple[float, float]]:
    """West edge -> through the wall's river gate (a short harbour dip
    inside the walls) -> out the other side -> the lake. A single pass
    with no retraced segment, so the ribbon offset in render.py stays a
    simple (non-self-intersecting) polygon."""
    theta_r = river_crossing_angle()
    harbor_pt = point_at(theta_r, wall_radius(theta_r) * 0.90)
    return [
        (0, 1250),
        (560, 1290),
        harbor_pt,
        (1300, 1520),
        (1790, 1790),
    ]


def _ribbon_polygon(points: list[tuple[float, float]], width: float) -> list[tuple[float, float]]:
    """Offset a polyline into a closed ribbon polygon of constant width."""
    left, right = [], []
    n = len(points)
    for i, (x, y) in enumerate(points):
        if i == 0:
            dx, dy = points[i + 1][0] - x, points[i + 1][1] - y
        elif i == n - 1:
            dx, dy = x - points[i - 1][0], y - points[i - 1][1]
        else:
            dx, dy = points[i + 1][0] - points[i - 1][0], points[i + 1][1] - points[i - 1][1]
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length * width / 2, dx / length * width / 2
        left.append((x + nx, y + ny))
        right.append((x - nx, y - ny))
    return left + right[::-1]


def build_roads() -> list[list[tuple[float, float]]]:
    """Main roads: radial spokes through each gate (extended past the wall
    into the countryside) plus one ring road at the ring2/ring3 boundary."""
    roads = []
    for theta in gate_angles():
        keep_edge = point_at(theta, radius_at(theta, FRAC_KEEP))
        wall_edge = point_at(theta, wall_radius(theta))
        cx, cy = CENTER
        dx, dy = math.cos(theta), math.sin(theta)
        far = (cx + dx * (R0 + 500), cy + dy * (R0 + 500))
        roads.append([keep_edge, wall_edge, far])
    roads.append(ring_loop(FRAC_RING2, steps=96) + [ring_loop(FRAC_RING2, steps=96)[0]])
    return roads


def wall_loop_with_gate_breaks(steps: int = 256) -> list[list[tuple[float, float]]]:
    """Wall outline as a list of arcs, each stopping short of a gate/river
    crossing so the line art shows a clean opening rather than a solid ring."""
    break_half_width = 0.06  # radians
    breaks = gate_angles() + [river_crossing_angle()]
    arcs: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = 2 * math.pi * i / steps
        in_break = any(abs(((t - b + math.pi) % (2 * math.pi)) - math.pi) < break_half_width for b in breaks)
        if in_break:
            if len(current) > 1:
                arcs.append(current)
            current = []
        else:
            current.append(point_at(t, wall_radius(t)))
    if len(current) > 1:
        arcs.append(current)
    return arcs
