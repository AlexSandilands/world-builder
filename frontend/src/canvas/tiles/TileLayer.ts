import { Container, Sprite, Texture } from 'pixi.js'
import type { Viewport } from '../viewportMath'
import { screenToWorld } from '../viewportMath'
import type { TileSource } from './TileSource'
import { levelDimensions, levelForScale, tileKey, visibleTiles } from './tileMath'

// Renders the artwork tile pyramid as sprites inside the world container. Only
// tiles intersecting the current viewport at the current level are ever
// materialised, so GPU texture memory stays bounded no matter how large the
// artwork is — the "never one 16k texture" invariant, enforced at runtime.
export class TileLayer extends Container {
  private readonly sprites = new Map<string, Sprite>()
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
      if (this.sprites.has(key)) continue
      let texture = this.textures.get(key)
      if (!texture) {
        texture = Texture.from(this.source.getTileCanvas(id))
        this.textures.set(key, texture)
      }
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
  }

  get residentTileCount(): number {
    return this.sprites.size
  }

  destroy(): void {
    for (const texture of this.textures.values()) texture.destroy(true)
    this.textures.clear()
    this.sprites.clear()
    super.destroy({ children: true })
  }
}
