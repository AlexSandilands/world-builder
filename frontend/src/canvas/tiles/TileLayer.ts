import { Container, Sprite, Texture } from 'pixi.js'
import type { Viewport } from '../viewportMath'
import { screenToWorld } from '../viewportMath'
import type { TileSource } from './TileSource'
import { levelDimensions, levelForScale, tileKey, visibleTiles } from './tileMath'

// Offscreen textures kept for re-pan; least-recently-visible beyond this cap
// are destroyed. 256 tiles × 256² RGBA ≈ 64 MB — the true GPU ceiling.
const TEXTURE_CACHE_CAP = 256

// Renders the artwork tile pyramid as sprites inside the world container.
// Resident sprites are bounded by the viewport and cached textures by
// TEXTURE_CACHE_CAP, so GPU memory stays bounded no matter how large the
// artwork is — the "never one 16k texture" invariant, enforced at runtime.
export class TileLayer extends Container {
  private readonly sprites = new Map<string, Sprite>()
  // Insertion order doubles as LRU order: visible keys are re-appended each
  // update, so eviction walks from the least recently visible.
  private readonly textures = new Map<string, Texture>()
  private readonly source: TileSource

  constructor(source: TileSource) {
    super()
    this.source = source
  }

  update(view: Viewport, screen: { width: number; height: number }): void {
    const p = this.source.pyramid
    const topLeft = screenToWorld(view, { x: 0, y: 0 })
    const bottomRight = screenToWorld(view, { x: screen.width, y: screen.height })
    const level = levelForScale(p, view.scale)
    const dim = levelDimensions(p, level)
    const worldPerTile = p.tileSize / dim.scale

    const needed = visibleTiles(p, level, {
      minX: topLeft.x,
      minY: topLeft.y,
      maxX: bottomRight.x,
      maxY: bottomRight.y,
    })
    const neededKeys = new Set(needed.map(tileKey))

    for (const id of needed) {
      const key = tileKey(id)
      let texture = this.textures.get(key)
      if (texture) {
        this.textures.delete(key)
      } else {
        texture = Texture.from(this.source.getTileCanvas(id))
      }
      this.textures.set(key, texture)

      if (this.sprites.has(key)) continue
      const sprite = new Sprite(texture)
      sprite.x = id.col * worldPerTile
      sprite.y = id.row * worldPerTile
      sprite.scale.set(worldPerTile / p.tileSize)
      this.addChild(sprite)
      this.sprites.set(key, sprite)
    }

    for (const [key, sprite] of this.sprites) {
      if (neededKeys.has(key)) continue
      this.removeChild(sprite)
      sprite.destroy()
      this.sprites.delete(key)
    }

    for (const [key, texture] of this.textures) {
      if (this.textures.size <= TEXTURE_CACHE_CAP) break
      if (neededKeys.has(key)) continue
      texture.destroy(true)
      this.textures.delete(key)
    }
  }

  get residentTileCount(): number {
    return this.sprites.size
  }

  get cachedTextureCount(): number {
    return this.textures.size
  }

  destroy(): void {
    for (const texture of this.textures.values()) texture.destroy(true)
    this.textures.clear()
    this.sprites.clear()
    super.destroy({ children: true })
  }
}
