import type { Geometry } from '../../generated/project'
import type { XY } from './geometry'
import { boundsOf, geometryCenter, movePolygonVertex, rotateAbout } from './geometry'

// Edit handles for a single-selected region, in world coordinates.
// - vertex: a polygon vertex (movable; alt-click deletes).
// - resize: scales the shape — polygon: bbox corners about the opposite
//   corner; rect: its corners in local (rotated) space; ellipse: axis ends.
export type Handle =
  { kind: 'vertex'; index: number; at: XY } | { kind: 'resize'; index: number; at: XY }

export function handlesFor(g: Geometry): Handle[] {
  switch (g.kind) {
    case 'polygon': {
      const vertices: Handle[] = g.points.map(([x, y], index) => ({
        kind: 'vertex',
        index,
        at: { x, y },
      }))
      return [...bboxCorners(g).map(cornerHandle), ...vertices]
    }
    case 'rect': {
      const c = geometryCenter(g)
      const corners: XY[] = [
        { x: g.x, y: g.y },
        { x: g.x + g.width, y: g.y },
        { x: g.x + g.width, y: g.y + g.height },
        { x: g.x, y: g.y + g.height },
      ]
      return corners.map((p, index) => ({
        kind: 'resize',
        index,
        at: rotateAbout(p, c, g.rotation ?? 0),
      }))
    }
    case 'ellipse': {
      const c = { x: g.cx, y: g.cy }
      const axes: XY[] = [
        { x: g.cx + g.rx, y: g.cy },
        { x: g.cx, y: g.cy + g.ry },
        { x: g.cx - g.rx, y: g.cy },
        { x: g.cx, y: g.cy - g.ry },
      ]
      return axes.map((p, index) => ({
        kind: 'resize',
        index,
        at: rotateAbout(p, c, g.rotation ?? 0),
      }))
    }
  }
}

export function applyHandleDrag(g: Geometry, handle: Handle, to: XY): Geometry {
  if (handle.kind === 'vertex') return movePolygonVertex(g, handle.index, to)
  switch (g.kind) {
    case 'polygon':
      return scalePolygonFromCorner(g, handle.index, to)
    case 'rect':
      return resizeRect(g, handle.index, to)
    case 'ellipse':
      return resizeEllipse(g, handle.index, to)
  }
}

const MIN_SCALE = 0.01

function scalePolygonFromCorner(
  g: Extract<Geometry, { kind: 'polygon' }>,
  cornerIndex: number,
  to: XY,
): Geometry {
  const corners = bboxCorners(g)
  const corner = corners[cornerIndex]
  const anchor = corners[(cornerIndex + 2) % 4]
  const spanX = corner.x - anchor.x
  const spanY = corner.y - anchor.y
  const sx = spanX === 0 ? 1 : Math.max(MIN_SCALE, (to.x - anchor.x) / spanX)
  const sy = spanY === 0 ? 1 : Math.max(MIN_SCALE, (to.y - anchor.y) / spanY)
  return {
    ...g,
    points: g.points.map(([x, y]) => [
      anchor.x + (x - anchor.x) * sx,
      anchor.y + (y - anchor.y) * sy,
    ]) as typeof g.points,
  }
}

// Resize in the rect's local (unrotated) frame, keeping the dragged corner's
// opposite corner fixed. Rotation is about the centre, so the new centre is
// the local midpoint mapped back through the old centre's rotation.
function resizeRect(g: Extract<Geometry, { kind: 'rect' }>, cornerIndex: number, to: XY): Geometry {
  const rotation = g.rotation ?? 0
  const oldCenter = geometryCenter(g)
  const localCorners: XY[] = [
    { x: g.x, y: g.y },
    { x: g.x + g.width, y: g.y },
    { x: g.x + g.width, y: g.y + g.height },
    { x: g.x, y: g.y + g.height },
  ]
  const anchor = localCorners[(cornerIndex + 2) % 4]
  const dragged = rotateAbout(to, oldCenter, -rotation)
  const width = Math.max(1e-6, Math.abs(dragged.x - anchor.x))
  const height = Math.max(1e-6, Math.abs(dragged.y - anchor.y))
  const localCenter = { x: (dragged.x + anchor.x) / 2, y: (dragged.y + anchor.y) / 2 }
  const newCenter = rotateAbout(localCenter, oldCenter, rotation)
  return { ...g, x: newCenter.x - width / 2, y: newCenter.y - height / 2, width, height }
}

function resizeEllipse(
  g: Extract<Geometry, { kind: 'ellipse' }>,
  axisIndex: number,
  to: XY,
): Geometry {
  const local = rotateAbout(to, { x: g.cx, y: g.cy }, -(g.rotation ?? 0))
  if (axisIndex % 2 === 0) return { ...g, rx: Math.max(1e-6, Math.abs(local.x - g.cx)) }
  return { ...g, ry: Math.max(1e-6, Math.abs(local.y - g.cy)) }
}

function bboxCorners(g: Geometry): XY[] {
  const b = boundsOf(g)
  return [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ]
}

function cornerHandle(at: XY, index: number): Handle {
  return { kind: 'resize', index, at }
}
