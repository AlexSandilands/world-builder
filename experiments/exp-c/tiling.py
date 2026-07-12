"""Tile-grid, region-mask, and stitching math for Experiment C (issue #5).

Pure CPU (numpy + Pillow): no ComfyUI traffic here. run_tiles.py drives it.
All geometry is deterministic — same inputs give byte-identical masks and
stitches, so run manifests stay reproducible.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

TILE = 1024

MANIFEST_PATH = Path(__file__).parent.parent / "assets" / "region_manifest.json"


@dataclass(frozen=True)
class Region:
    index: int  # position in z-sorted manifest order; value in the index map
    id: str
    type: str
    prompt: str


@dataclass(frozen=True)
class TileRegion:
    region: Region
    fraction: float  # of tile area, after z-order resolution


def axis_positions(size: int, tile: int, overlap: int) -> list[int]:
    """Tile origins along one axis. Last tile is clamped to the canvas edge,
    so the final overlap may exceed `overlap` when stride doesn't divide."""
    if size <= tile:
        return [0]
    stride = tile - overlap
    positions = list(range(0, size - tile, stride))
    positions.append(size - tile)
    return positions


def tile_grid(size: int, tile: int, overlap: int) -> list[tuple[int, int]]:
    xs = axis_positions(size, tile, overlap)
    ys = axis_positions(size, tile, overlap)
    return [(x, y) for y in ys for x in xs]


def load_regions() -> list[Region]:
    manifest = json.loads(MANIFEST_PATH.read_text())
    return [
        Region(index=i, id=r["id"], type=r["type"], prompt=r["prompt"])
        for i, r in enumerate(manifest["regions"])
    ]


def rasterize_index_map(size: int) -> np.ndarray:
    """Z-order-resolved region index per pixel (later region wins), scaled
    from the manifest's 2048 canvas to `size`. Matches the segmentation-mask
    semantics in docs/VISION.md."""
    manifest = json.loads(MANIFEST_PATH.read_text())
    scale = size / manifest["canvas"]["width"]
    img = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(img)
    for i, r in enumerate(manifest["regions"]):
        points = [(x * scale, y * scale) for x, y in r["geometry"]["points"]]
        draw.polygon(points, fill=i)
    return np.asarray(img)


def region_mask_png(index_map: np.ndarray, region_index: int, out: Path) -> None:
    """White-on-black coverage mask for one region, for ComfyUI mask input."""
    mask = (index_map == region_index).astype(np.uint8) * 255
    Image.fromarray(mask, mode="L").save(out)


def tile_regions(
    index_map: np.ndarray,
    regions: list[Region],
    x: int,
    y: int,
    tile: int,
    min_fraction: float,
) -> list[TileRegion]:
    """Regions covering >= min_fraction of the tile, largest first."""
    crop = index_map[y : y + tile, x : x + tile]
    counts = np.bincount(crop.ravel(), minlength=len(regions))
    area = tile * tile
    stats = [
        TileRegion(region=regions[i], fraction=round(counts[i] / area, 4))
        for i in np.nonzero(counts)[0]
        if counts[i] / area >= min_fraction
    ]
    return sorted(stats, key=lambda s: (-s.fraction, s.region.index))


def _axis_weights(tile: int, feather: int, ramp_lo: bool, ramp_hi: bool) -> np.ndarray:
    # Canvas-boundary edges keep weight 1.0 so normalisation never divides
    # by a near-zero sum at the map border.
    w = np.ones(tile, dtype=np.float64)
    ramp = (np.arange(feather) + 1) / (feather + 1)
    if ramp_lo:
        w[:feather] = np.minimum(w[:feather], ramp)
    if ramp_hi:
        w[tile - feather :] = np.minimum(w[tile - feather :], ramp[::-1])
    return w


def stitch(
    size: int,
    tiles: dict[tuple[int, int], np.ndarray],
    tile: int,
    feather: int,
) -> np.ndarray:
    """Feathered weighted blend. Feather must not exceed overlap, or the ramp
    reaches pixels no neighbouring tile covers and content is attenuated."""
    xs = sorted({x for x, _ in tiles})
    ys = sorted({y for _, y in tiles})
    acc = np.zeros((size, size, 3), dtype=np.float64)
    wsum = np.zeros((size, size, 1), dtype=np.float64)
    for (x, y), img in tiles.items():
        wx = _axis_weights(tile, feather, ramp_lo=x != xs[0], ramp_hi=x != xs[-1])
        wy = _axis_weights(tile, feather, ramp_lo=y != ys[0], ramp_hi=y != ys[-1])
        w = (wy[:, None] * wx[None, :])[:, :, None]
        acc[y : y + tile, x : x + tile] += img.astype(np.float64) * w
        wsum[y : y + tile, x : x + tile] += w
    return np.clip(acc / wsum, 0, 255).astype(np.uint8)


def overlap_disagreement(tiles: dict[tuple[int, int], np.ndarray], tile: int) -> dict[str, float]:
    """How differently adjacent tiles rendered their shared overlap, before
    blending (mean |RGB delta| per overlapping pair). The objective seam
    signal for the denoise sweep: feathering hides small disagreement, not
    structural divergence."""
    xs = sorted({x for x, _ in tiles})
    ys = sorted({y for _, y in tiles})
    diffs = []
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            a = tiles[(x, y)].astype(np.float64)
            if i + 1 < len(xs) and xs[i + 1] < x + tile:
                nx = xs[i + 1]
                b = tiles[(nx, y)].astype(np.float64)
                width = x + tile - nx
                diffs.append(np.abs(a[:, tile - width :] - b[:, :width]).mean())
            if j + 1 < len(ys) and ys[j + 1] < y + tile:
                ny = ys[j + 1]
                b = tiles[(x, ny)].astype(np.float64)
                height = y + tile - ny
                diffs.append(np.abs(a[tile - height :, :] - b[:height, :]).mean())
    return {
        "mean": round(float(np.mean(diffs)), 3),
        "p95": round(float(np.percentile(diffs, 95)), 3),
        "max": round(float(np.max(diffs)), 3),
        "pairs": len(diffs),
    }
