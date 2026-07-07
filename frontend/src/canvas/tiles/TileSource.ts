import type { TileId, TilePyramid } from './tileMath'
import { levelDimensions, maxLevel } from './tileMath'

// A TileSource yields the pixels for one pyramid tile on demand. In production
// this is a thin client over the orchestrator's deep-zoom tile endpoint
// (returning image URLs/blobs); for the spike SyntheticTileSource draws tiles
// procedurally so a "large test image" needs no committed 16k asset.
export interface TileSource {
  readonly pyramid: TilePyramid
  getTileCanvas(id: TileId): HTMLCanvasElement
}

// Procedurally paints a distinct tile for any (level, col, row): a world-space
// gradient (so panning across the huge virtual image is visibly continuous),
// a faint grid, and the tile's coordinates. Represents a ~16k test artwork.
export class SyntheticTileSource implements TileSource {
  readonly pyramid: TilePyramid

  constructor(pyramid: TilePyramid) {
    this.pyramid = pyramid
  }

  getTileCanvas(id: TileId): HTMLCanvasElement {
    const size = this.pyramid.tileSize
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    const dim = levelDimensions(this.pyramid, id.level)
    // Fraction of the full image this tile's top-left sits at, so colour is a
    // function of world position and stays stable across zoom levels.
    const fx = ((id.col * size) / dim.width + id.row * 0.0001) % 1
    const fy = (id.row * size) / dim.height

    const grad = ctx.createLinearGradient(0, 0, size, size)
    grad.addColorStop(0, `hsl(${Math.round(fx * 320)}, 70%, ${28 + fy * 24}%)`)
    grad.addColorStop(1, `hsl(${Math.round(fx * 320 + 40)}, 70%, ${16 + fy * 20}%)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)

    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1)

    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillText(`L${id.level} · ${id.col},${id.row}`, 10, 22)
    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.fillText(`lvl max ${maxLevel(this.pyramid)}`, 10, 40)

    return canvas
  }
}
