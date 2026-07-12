import type { Line, Vec2 } from '../../generated/project'
import type { XY } from '../regions/geometry'
import { distanceToSegment } from '../regions/geometry'

export function translateLine(points: Line['points'], dx: number, dy: number): Line['points'] {
  return asPolyline(points.map(([x, y]): Vec2 => [x + dx, y + dy]))
}

export function movePolylineVertex(points: Line['points'], index: number, to: XY): Line['points'] {
  return asPolyline(points.map((p, i): Vec2 => (i === index ? [to.x, to.y] : p)))
}

export function insertPolylineVertex(
  points: Line['points'],
  afterIndex: number,
  at: XY,
): Line['points'] {
  const next = points.map((p): Vec2 => [p[0], p[1]])
  next.splice(afterIndex + 1, 0, [at.x, at.y])
  return asPolyline(next)
}

// Schema minItems is 2 (docs/schema/project-v1.md — an open polyline needs at
// least two points to be a line); deletion below that is a no-op.
export function deletePolylineVertex(points: Line['points'], index: number): Line['points'] {
  if (points.length <= 2) return points
  return asPolyline(points.filter((_, i) => i !== index).map((p): Vec2 => [p[0], p[1]]))
}

// Index of the open-polyline segment (i → i+1, no wraparound — unlike a
// region ring, a line has no implicit closing edge) closest to `p`.
export function nearestOpenSegment(
  points: readonly XY[],
  p: XY,
): { index: number; distance: number } {
  let best = { index: 0, distance: Infinity }
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegment(p, points[i], points[i + 1])
    if (d < best.distance) best = { index: i, distance: d }
  }
  return best
}

// Perpendicular distance from p to the whole polyline (for line selection).
export function distanceToLine(points: readonly XY[], p: XY): number {
  return nearestOpenSegment(points, p).distance
}

// Breaks an open polyline into alternating dash/gap segments for the
// 'dashed' line style — Pixi's Graphics stroke has no built-in dash pattern.
export function dashSegments(points: readonly XY[], dash: number, gap: number): [XY, XY][] {
  const out: [XY, XY][] = []
  let drawing = true
  let remaining = dash
  for (let i = 0; i < points.length - 1; i++) {
    let a = points[i]
    const b = points[i + 1]
    let segLen = Math.hypot(b.x - a.x, b.y - a.y)
    while (segLen > 1e-9) {
      const step = Math.min(remaining, segLen)
      const t = step / segLen
      const next = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (drawing) out.push([a, next])
      a = next
      segLen -= step
      remaining -= step
      if (remaining <= 1e-9) {
        drawing = !drawing
        remaining = drawing ? dash : gap
      }
    }
  }
  return out
}

function asPolyline(points: Vec2[]): [Vec2, Vec2, ...Vec2[]] {
  if (points.length < 2) throw new Error('line needs at least 2 points')
  return points as [Vec2, Vec2, ...Vec2[]]
}
