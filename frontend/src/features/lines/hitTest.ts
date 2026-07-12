import type { Line } from '../../generated/project'
import type { XY } from '../regions/geometry'
import { distanceToLine } from './geometry'

function toXY(points: Line['points']): XY[] {
  return points.map(([x, y]) => ({ x, y }))
}

// Nearest line whose stroke (half its width, plus a fixed screen-space
// grab tolerance) covers `p`, closest first. A line's clickable footprint is
// its rendered stroke, not an infinitely thin path.
export function nearestLineAt(
  lines: readonly Line[],
  p: XY,
  tolerance: number,
): { line: Line; distance: number } | null {
  let best: { line: Line; distance: number } | null = null
  for (const line of lines) {
    const distance = distanceToLine(toXY(line.points), p)
    if (distance <= line.width / 2 + tolerance && (!best || distance < best.distance)) {
      best = { line, distance }
    }
  }
  return best
}
