"""Rasterisation for the Phase 0 test-city assets (issue #2).

Segmentation mask: flat polygon fills, later region in draw order wins on
overlap (z-order later-wins, per docs/VISION.md). No anti-aliasing — a
classification mask should stay flat-coloured at region boundaries.

Line art: rendered at 2x and downsampled with LANCZOS for anti-aliased
strokes ("clean strokes" per the issue scope), in two variants:
sparse (walls/main roads/river only) and dense (sparse + per-district
street fill, standing in for hand-traced/Watabou street import).
"""
import math

from PIL import Image, ImageDraw

from citylayout import CANVAS, build_regions, build_roads, wall_loop_with_gate_breaks, river_polyline, CENTER

SUPERSAMPLE = 2

TYPE_COLORS: dict[str, str] = {
    "wilderness": "#6b7a4a",
    "forest": "#2f5233",
    "farmland": "#c9b458",
    "lake": "#3a6ea5",
    "city_ground": "#a8a394",
    "noble_quarter": "#9d8fc7",
    "temple_district": "#e8e2d0",
    "market_square": "#e0973c",
    "guild_hall": "#8a6642",
    "keep": "#6a4c93",
    "artisan_quarter": "#c98a3c",
    "residential_modest": "#b5946a",
    "university": "#4f8a8b",
    "park": "#6fae5c",
    "barracks": "#8b3a3a",
    "granary": "#d4a94b",
    "stables_district": "#7a5c3e",
    "city_gate_plaza": "#cbbfa8",
    "residential_dense": "#d1b28c",
    "slum": "#6e6259",
    "docks": "#5c7a8a",
    "warehouse_district": "#5a5a52",
    "tannery": "#9a8f3f",
    "cemetery": "#4a4453",
    "river": "#4f8fce",
    "construction_site": "#f2b705",
}

# (kind, spacing_px) per district type for the dense line-art variant.
# "sparse" types get no fill pattern even in the dense variant (plazas /
# the keep read as open ground, not street grid).
STREET_STYLE: dict[str, tuple[str, int]] = {
    "noble_quarter": ("grid", 44),
    "temple_district": ("grid", 70),
    "market_square": ("grid", 26),
    "guild_hall": ("grid", 50),
    "artisan_quarter": ("grid", 30),
    "residential_modest": ("grid", 40),
    "university": ("grid", 55),
    "park": ("organic", 80),
    "barracks": ("grid", 48),
    "granary": ("grid", 60),
    "stables_district": ("grid", 55),
    "city_gate_plaza": ("sparse", 0),
    "residential_dense": ("grid", 22),
    "slum": ("organic", 26),
    "docks": ("organic", 34),
    "warehouse_district": ("grid", 65),
    "tannery": ("grid", 58),
    "cemetery": ("organic", 70),
    "keep": ("sparse", 0),
}


def render_segmentation_mask(regions: list[dict]) -> Image.Image:
    img = Image.new("RGB", (CANVAS, CANVAS), TYPE_COLORS["wilderness"])
    draw = ImageDraw.Draw(img)
    for region in regions:
        pts = [tuple(p) for p in region["geometry"]["points"]]
        draw.polygon(pts, fill=TYPE_COLORS[region["type"]])
    return img


def _sector_centroid_angle(region: dict) -> float:
    cx, cy = CENTER
    xs = [p[0] for p in region["geometry"]["points"]]
    ys = [p[1] for p in region["geometry"]["points"]]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    return math.atan2(my - cy, mx - cx)


def _grid_layer(size: int, spacing: int, angle: float) -> Image.Image:
    layer = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(layer)
    diag = int(size * 1.5)
    cx, cy = size / 2, size / 2
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    offset = -diag
    while offset <= diag:
        x0, y0 = -diag, offset
        x1, y1 = diag, offset
        p0 = (cx + x0 * cos_a - y0 * sin_a, cy + x0 * sin_a + y0 * cos_a)
        p1 = (cx + x1 * cos_a - y1 * sin_a, cy + x1 * sin_a + y1 * cos_a)
        draw.line([p0, p1], fill=255, width=2)
        p0 = (cx + y0 * cos_a - x0 * sin_a, cy + y0 * sin_a + x0 * cos_a)
        p1 = (cx + y1 * cos_a - x1 * sin_a, cy + y1 * sin_a + x1 * cos_a)
        draw.line([p0, p1], fill=255, width=2)
        offset += spacing
    return layer


def _organic_layer(size: int, spacing: int, angle: float) -> Image.Image:
    layer = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(layer)
    diag = int(size * 1.5)
    cx, cy = size / 2, size / 2
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    offset = -diag
    while offset <= diag:
        pts = []
        for i in range(0, diag * 2, 24):
            x = -diag + i
            y = offset + 22 * math.sin(x / 90.0 + offset)
            pts.append((cx + x * cos_a - y * sin_a, cy + x * sin_a + y * cos_a))
        draw.line(pts, fill=255, width=2, joint="curve")
        offset += spacing
    return layer


def _draw_polyline(draw: ImageDraw.ImageDraw, pts, scale, width):
    scaled = [(x * scale, y * scale) for x, y in pts]
    draw.line(scaled, fill=(20, 18, 16), width=int(width * scale), joint="curve")


def _render_lineart(regions: list[dict], dense: bool) -> Image.Image:
    size = CANVAS * SUPERSAMPLE
    img = Image.new("RGB", (size, size), (247, 243, 233))
    draw = ImageDraw.Draw(img)

    if dense:
        for region in regions:
            if region["category"] != "district":
                continue
            style = STREET_STYLE.get(region["type"], ("sparse", 0))
            kind, spacing = style
            if kind == "sparse":
                continue
            angle = _sector_centroid_angle(region)
            layer_fn = _grid_layer if kind == "grid" else _organic_layer
            pattern = layer_fn(size, spacing * SUPERSAMPLE, angle)
            mask = Image.new("L", (size, size), 0)
            mdraw = ImageDraw.Draw(mask)
            mdraw.polygon([(x * SUPERSAMPLE, y * SUPERSAMPLE) for x, y in region["geometry"]["points"]], fill=255)
            black = Image.new("RGB", (size, size), (20, 18, 16))
            img.paste(black, (0, 0), Image.composite(pattern, Image.new("L", (size, size), 0), mask))

    for arc in wall_loop_with_gate_breaks():
        _draw_polyline(draw, arc, SUPERSAMPLE, 5)
    for road in build_roads():
        _draw_polyline(draw, road, SUPERSAMPLE, 6)
    _draw_polyline(draw, river_polyline(), SUPERSAMPLE, 5)

    return img.resize((CANVAS, CANVAS), Image.LANCZOS)


def render_lineart_sparse(regions: list[dict]) -> Image.Image:
    return _render_lineart(regions, dense=False)


def render_lineart_dense(regions: list[dict]) -> Image.Image:
    return _render_lineart(regions, dense=True)


def color_table_markdown() -> str:
    lines = ["| Type | Category | Hex |", "|---|---|---|"]
    categories = {r["type"]: r["category"] for r in build_regions()}
    for type_, hex_ in TYPE_COLORS.items():
        lines.append(f"| `{type_}` | {categories.get(type_, '?')} | `{hex_}` |")
    return "\n".join(lines)
