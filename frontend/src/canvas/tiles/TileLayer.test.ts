import { beforeEach, describe, expect, test, vi } from 'vitest'

// jsdom has neither WebGL nor 2D canvas; stub the pixi primitives TileLayer
// touches so the sprite/texture bookkeeping runs for real.
vi.mock('pixi.js', () => {
  class Container {
    children: unknown[] = []
    addChild(child: unknown) {
      this.children.push(child)
      return child
    }
    removeChild(child: unknown) {
      this.children = this.children.filter((c) => c !== child)
      return child
    }
    destroy() {}
  }
  class Sprite {
    x = 0
    y = 0
    scale = { set: () => {} }
    texture: unknown
    constructor(texture: unknown) {
      this.texture = texture
    }
    destroy() {}
  }
  const Texture = { from: () => ({ destroyed: false, destroy: vi.fn() }) }
  return { Container, Sprite, Texture }
})

import { TileLayer } from './TileLayer'
import type { TileSource } from './TileSource'

const pyramid = { width: 16384, height: 16384, tileSize: 256 }
const source: TileSource = {
  pyramid,
  getTileCanvas: () => ({}) as HTMLCanvasElement,
}
const screen = { width: 1280, height: 800 }

let layer: TileLayer

beforeEach(() => {
  layer = new TileLayer(source)
})

describe('texture cache eviction (PR #43 review, finding 2)', () => {
  test('panning across the full image at full resolution keeps the cache capped', () => {
    // scale 1 → level 14, the 64×64-tile level. Sweep the whole 16k image.
    for (let ty = 0; ty > -16384; ty -= 800) {
      for (let tx = 0; tx > -16384; tx -= 1280) {
        layer.update({ tx, ty, scale: 1 }, screen)
      }
    }
    expect(layer.cachedTextureCount).toBeLessThanOrEqual(256)
    expect(layer.residentTileCount).toBeLessThanOrEqual(36)
  })

  test('visible tiles are never evicted and revisiting reuses cached textures', () => {
    layer.update({ tx: 0, ty: 0, scale: 1 }, screen)
    const resident = layer.residentTileCount
    expect(resident).toBeGreaterThan(0)
    expect(layer.cachedTextureCount).toBeGreaterThanOrEqual(resident)

    layer.update({ tx: -4000, ty: -4000, scale: 1 }, screen)
    layer.update({ tx: 0, ty: 0, scale: 1 }, screen)
    // Both viewports' tiles fit under the cap, so nothing was evicted.
    expect(layer.cachedTextureCount).toBeGreaterThan(resident)
  })
})
