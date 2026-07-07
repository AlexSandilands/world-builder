// Deep-zoom tile pyramid math. The artwork is authored/rendered at 8k–16k and
// MUST never be uploaded as one texture (frontend guideline). Instead it is a
// pyramid of fixed-size tiles; the viewport pulls only the tiles it can see at
// the level whose resolution matches the current zoom. This module is the pure
// geometry that decides which tiles those are.

export type TilePyramid = {
  width: number // full-resolution artwork width in px
  height: number // full-resolution artwork height in px
  tileSize: number // edge length of a square tile in px
}

export type WorldRect = { minX: number; minY: number; maxX: number; maxY: number }

export type TileId = { level: number; col: number; row: number }

// Highest (full-resolution) level index. Level 0 is the coarsest overview.
export function maxLevel(p: TilePyramid): number {
  return Math.ceil(Math.log2(Math.max(1, p.width, p.height)))
}

// Downsample-adjusted dimensions of a given pyramid level.
export function levelDimensions(
  p: TilePyramid,
  level: number,
): {
  width: number
  height: number
  cols: number
  rows: number
  scale: number // level px per full-resolution px, ≤ 1
} {
  const scale = Math.pow(2, level - maxLevel(p))
  const width = Math.max(1, Math.ceil(p.width * scale))
  const height = Math.max(1, Math.ceil(p.height * scale))
  return {
    width,
    height,
    scale,
    cols: Math.ceil(width / p.tileSize),
    rows: Math.ceil(height / p.tileSize),
  }
}

// Pick the pyramid level whose texels map ~1:1 to screen pixels at the current
// world→screen scale. Oversampling by rounding up keeps the artwork crisp.
export function levelForScale(p: TilePyramid, worldToScreenScale: number): number {
  const ideal = maxLevel(p) + Math.log2(Math.max(1e-6, worldToScreenScale))
  return Math.min(maxLevel(p), Math.max(0, Math.ceil(ideal)))
}

// The tiles intersecting the visible world rect at the given level. Output is
// bounded by the viewport, never by the image size — the invariant that keeps a
// 16k artwork from ever becoming a 16k texture.
export function visibleTiles(p: TilePyramid, level: number, view: WorldRect): TileId[] {
  const dim = levelDimensions(p, level)
  const toCol = (worldX: number) => Math.floor((worldX * dim.scale) / p.tileSize)
  const toRow = (worldY: number) => Math.floor((worldY * dim.scale) / p.tileSize)

  const c0 = clamp(toCol(view.minX), 0, dim.cols - 1)
  const c1 = clamp(toCol(view.maxX), 0, dim.cols - 1)
  const r0 = clamp(toRow(view.minY), 0, dim.rows - 1)
  const r1 = clamp(toRow(view.maxY), 0, dim.rows - 1)

  const tiles: TileId[] = []
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) tiles.push({ level, col, row })
  }
  return tiles
}

export function tileKey(id: TileId): string {
  return `${id.level}/${id.col}/${id.row}`
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
