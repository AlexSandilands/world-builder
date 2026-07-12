import type { Line } from '../../generated/project'
import type { Handle } from '../regions/handles'
import type { XY } from '../regions/geometry'
import { movePolylineVertex } from './geometry'

// Lines only expose vertex handles — no bbox/corner resize, since stroke
// width (not a draggable box) is what's editable besides the path itself.
export function handlesForLine(points: Line['points']): Handle[] {
  return points.map(([x, y], index) => ({ kind: 'vertex', index, at: { x, y } }))
}

export function applyLineHandleDrag(
  points: Line['points'],
  handle: Handle,
  to: XY,
): Line['points'] {
  return movePolylineVertex(points, handle.index, to)
}
