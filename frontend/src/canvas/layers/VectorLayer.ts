import { Container, Graphics } from 'pixi.js'
import type { Layer } from '../../state/types'

// Draws the semantic vector layers (regions as filled polygons, lines as
// polylines) above the artwork tiles, in the same world coordinate system so
// they stay perfectly registered under pan/zoom. Vertex handles are sized in
// inverse proportion to zoom so they read as a constant screen size.
export class VectorLayer extends Container {
  private readonly g = new Graphics()

  constructor() {
    super()
    this.addChild(this.g)
  }

  redraw(layers: Layer[], scale: number): void {
    const g = this.g
    g.clear()
    const handleRadius = 5 / scale
    const strokeWidth = 2 / scale

    for (const layer of layers) {
      if (!layer.visible) continue

      if (layer.kind === 'region' && layer.polygon.length >= 2) {
        g.poly(layer.polygon.flatMap((p) => [p.x, p.y]))
          .fill({ color: layer.color, alpha: 0.28 })
          .stroke({ width: strokeWidth, color: layer.color, alpha: 0.95 })
        this.drawHandles(layer.polygon, layer.color, handleRadius)
      }

      if (layer.kind === 'line' && layer.points.length >= 2) {
        g.poly(
          layer.points.flatMap((p) => [p.x, p.y]),
          false,
        ).stroke({ width: strokeWidth * 1.5, color: layer.color, alpha: 0.95 })
        this.drawHandles(layer.points, layer.color, handleRadius)
      }
    }
  }

  private drawHandles(points: { x: number; y: number }[], color: number, r: number): void {
    for (const p of points) {
      this.g
        .circle(p.x, p.y, r)
        .fill({ color: 0xffffff, alpha: 0.95 })
        .stroke({ width: r * 0.4, color })
    }
  }
}
