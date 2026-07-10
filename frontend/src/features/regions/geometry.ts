import type { Geometry, Vec2 } from '../../generated/project'

export type XY = { x: number; y: number }

const DEG = Math.PI / 180

export function rotateAbout(p: XY, center: XY, degrees: number): XY {
  if (!degrees) return p
  // Positive degrees are clockwise in the schema's y-down convention, which
  // is the standard CCW formula evaluated in y-down screen space.
  const a = degrees * DEG
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = p.x - center.x
  const dy = p.y - center.y
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }
}

export function geometryCenter(g: Geometry): XY {
  switch (g.kind) {
    case 'polygon': {
      const b = boundsOf(g)
      return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
    }
    case 'rect':
      return { x: g.x + g.width / 2, y: g.y + g.height / 2 }
    case 'ellipse':
      return { x: g.cx, y: g.cy }
  }
}

// The shape's outline as a closed ring in world coordinates (ellipse
// approximated for hit-testing and bounds; rendering draws the true curve).
export function outlineOf(g: Geometry, ellipseSegments = 32): XY[] {
  switch (g.kind) {
    case 'polygon':
      return g.points.map(([x, y]) => ({ x, y }))
    case 'rect': {
      const c = geometryCenter(g)
      const corners: XY[] = [
        { x: g.x, y: g.y },
        { x: g.x + g.width, y: g.y },
        { x: g.x + g.width, y: g.y + g.height },
        { x: g.x, y: g.y + g.height },
      ]
      return corners.map((p) => rotateAbout(p, c, g.rotation ?? 0))
    }
    case 'ellipse': {
      const pts: XY[] = []
      for (let i = 0; i < ellipseSegments; i++) {
        const t = (i / ellipseSegments) * 2 * Math.PI
        pts.push(
          rotateAbout(
            { x: g.cx + g.rx * Math.cos(t), y: g.cy + g.ry * Math.sin(t) },
            { x: g.cx, y: g.cy },
            g.rotation ?? 0,
          ),
        )
      }
      return pts
    }
  }
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

export function boundsOf(g: Geometry): Bounds {
  const pts = g.kind === 'polygon' ? g.points.map(([x, y]) => ({ x, y })) : outlineOf(g)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

export function areaOf(g: Geometry): number {
  switch (g.kind) {
    case 'polygon': {
      let twice = 0
      const pts = g.points
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i]
        const [x2, y2] = pts[(i + 1) % pts.length]
        twice += x1 * y2 - x2 * y1
      }
      return Math.abs(twice) / 2
    }
    case 'rect':
      return Math.abs(g.width * g.height)
    case 'ellipse':
      return Math.PI * Math.abs(g.rx * g.ry)
  }
}

export function translateGeometry(g: Geometry, dx: number, dy: number): Geometry {
  switch (g.kind) {
    case 'polygon':
      return { ...g, points: mapPoints(g.points, ([x, y]) => [x + dx, y + dy]) }
    case 'rect':
      return { ...g, x: g.x + dx, y: g.y + dy }
    case 'ellipse':
      return { ...g, cx: g.cx + dx, cy: g.cy + dy }
  }
}

export function movePolygonVertex(g: Geometry, index: number, to: XY): Geometry {
  if (g.kind !== 'polygon') return g
  return { ...g, points: mapPoints(g.points, (p, i) => (i === index ? [to.x, to.y] : p)) }
}

export function insertPolygonVertex(g: Geometry, afterIndex: number, at: XY): Geometry {
  if (g.kind !== 'polygon') return g
  const points = g.points.map((p): Vec2 => [p[0], p[1]])
  points.splice(afterIndex + 1, 0, [at.x, at.y])
  return { ...g, points: asRing(points) }
}

// Rings need at least 3 vertices (schema minItems); deletion below that is a no-op.
export function deletePolygonVertex(g: Geometry, index: number): Geometry {
  if (g.kind !== 'polygon' || g.points.length <= 3) return g
  return { ...g, points: asRing(g.points.filter((_, i) => i !== index).map((p) => [p[0], p[1]])) }
}

// Index of the ring segment (i → i+1) closest to `p`, with its distance.
export function nearestSegment(ring: XY[], p: XY): { index: number; distance: number } {
  let best = { index: 0, distance: Infinity }
  for (let i = 0; i < ring.length; i++) {
    const d = distanceToSegment(p, ring[i], ring[(i + 1) % ring.length])
    if (d < best.distance) best = { index: i, distance: d }
  }
  return best
}

export function distanceToSegment(p: XY, a: XY, b: XY): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lenSq = abx * abx + aby * aby
  const t =
    lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq))
  const qx = a.x + t * abx
  const qy = a.y + t * aby
  return Math.hypot(p.x - qx, p.y - qy)
}

// Ramer–Douglas–Peucker: reduces freehand-lasso samples to a clean polygon.
export function simplifyPolyline(points: XY[], epsilon: number): XY[] {
  if (points.length <= 2) return points
  let maxDist = 0
  let maxIndex = 0
  const first = points[0]
  const last = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], first, last)
    if (d > maxDist) {
      maxDist = d
      maxIndex = i
    }
  }
  if (maxDist <= epsilon) return [first, last]
  const left = simplifyPolyline(points.slice(0, maxIndex + 1), epsilon)
  const right = simplifyPolyline(points.slice(maxIndex), epsilon)
  return [...left.slice(0, -1), ...right]
}

// Convenience-only vertex snapping (issue #17: no topology merge). Returns the
// nearest vertex of any other region within `tolerance`, or null.
export function snapToVertex(
  candidates: readonly { id: string; geometry: Geometry }[],
  excludeId: string | null,
  p: XY,
  tolerance: number,
): XY | null {
  let best: XY | null = null
  let bestDist = tolerance
  for (const c of candidates) {
    if (c.id === excludeId || c.geometry.kind !== 'polygon') continue
    for (const [x, y] of c.geometry.points) {
      const d = Math.hypot(x - p.x, y - p.y)
      if (d <= bestDist) {
        bestDist = d
        best = { x, y }
      }
    }
  }
  return best
}

function mapPoints(
  points: readonly Vec2[],
  f: (p: Vec2, i: number) => Vec2,
): [Vec2, Vec2, Vec2, ...Vec2[]] {
  return asRing(points.map((p, i) => f(p, i)))
}

function asRing(points: Vec2[]): [Vec2, Vec2, Vec2, ...Vec2[]] {
  if (points.length < 3) throw new Error('polygon ring needs at least 3 points')
  return points as [Vec2, Vec2, Vec2, ...Vec2[]]
}
