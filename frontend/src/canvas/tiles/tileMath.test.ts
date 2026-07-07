import { describe, expect, test } from 'vitest'
import { levelDimensions, levelForScale, maxLevel, visibleTiles } from './tileMath'

const pyramid = { width: 16384, height: 16384, tileSize: 256 }

describe('pyramid geometry', () => {
  test('max level covers the full resolution', () => {
    expect(maxLevel(pyramid)).toBe(14) // log2(16384)
  })

  test('each level halves the previous', () => {
    const full = levelDimensions(pyramid, 14)
    const half = levelDimensions(pyramid, 13)
    expect(full.width).toBe(16384)
    expect(half.width).toBe(8192)
    expect(half.scale).toBeCloseTo(0.5)
  })

  test('level tracks zoom and stays in range', () => {
    expect(levelForScale(pyramid, 1)).toBe(14) // 1 screen px per world px → full res
    expect(levelForScale(pyramid, 0.5)).toBe(13)
    expect(levelForScale(pyramid, 1e-6)).toBe(0)
    expect(levelForScale(pyramid, 1000)).toBe(14)
  })
})

describe('visibleTiles is bounded by the viewport, not the image', () => {
  test('a small window yields a handful of tiles at full resolution', () => {
    const tiles = visibleTiles(pyramid, 14, { minX: 8000, minY: 8000, maxX: 8500, maxY: 8500 })
    // A 500px window over 256px tiles spans at most 3×3 tiles.
    expect(tiles.length).toBeLessThanOrEqual(9)
    expect(tiles.length).toBeGreaterThan(0)
  })

  test('the full image at full resolution would be far larger — proving we never materialise it', () => {
    const dim = levelDimensions(pyramid, 14)
    const fullImageTiles = dim.cols * dim.rows
    const window = visibleTiles(pyramid, 14, { minX: 0, minY: 0, maxX: 1024, maxY: 768 })
    expect(fullImageTiles).toBe(64 * 64)
    expect(window.length).toBeLessThan(fullImageTiles / 100)
  })

  test('clamps to the image bounds', () => {
    const tiles = visibleTiles(pyramid, 2, { minX: -9999, minY: -9999, maxX: 99999, maxY: 99999 })
    const dim = levelDimensions(pyramid, 2)
    expect(tiles.length).toBe(dim.cols * dim.rows)
    for (const t of tiles) {
      expect(t.col).toBeGreaterThanOrEqual(0)
      expect(t.col).toBeLessThan(dim.cols)
    }
  })
})
