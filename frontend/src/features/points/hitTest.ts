import type { Point } from '../../generated/project'
import type { XY } from '../regions/geometry'

// Nearest point within `tolerance` (screen-space, world-converted by the
// caller), closest first — a point's clickable footprint is a fixed-radius
// marker, not literally one pixel.
export function nearestPointAt(points: readonly Point[], p: XY, tolerance: number): Point | null {
  let best: { point: Point; distance: number } | null = null
  for (const point of points) {
    const [x, y] = point.position
    const distance = Math.hypot(x - p.x, y - p.y)
    if (distance <= tolerance && (!best || distance < best.distance)) best = { point, distance }
  }
  return best?.point ?? null
}
