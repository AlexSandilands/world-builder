import type { Geometry, Region } from '../../generated/project'
import { stackingOrder } from '../../state/commands'
import type { XY } from './geometry'
import { outlineOf, rotateAbout } from './geometry'

export function pointInGeometry(g: Geometry, p: XY): boolean {
  switch (g.kind) {
    case 'polygon':
      return pointInRing(
        g.points.map(([x, y]) => ({ x, y })),
        p,
      )
    case 'rect': {
      const c = { x: g.x + g.width / 2, y: g.y + g.height / 2 }
      const local = rotateAbout(p, c, -(g.rotation ?? 0))
      return (
        local.x >= g.x && local.x <= g.x + g.width && local.y >= g.y && local.y <= g.y + g.height
      )
    }
    case 'ellipse': {
      const local = rotateAbout(p, { x: g.cx, y: g.cy }, -(g.rotation ?? 0))
      const nx = (local.x - g.cx) / g.rx
      const ny = (local.y - g.cy) / g.ry
      return nx * nx + ny * ny <= 1
    }
  }
}

// Topmost region under the point by effective stacking order (what a click
// should select — the same "later wins" the compiler rasterises with).
export function topRegionAt(regions: readonly Region[], p: XY): Region | null {
  const ordered = stackingOrder(regions)
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (pointInGeometry(ordered[i].geometry, p)) return ordered[i]
  }
  return null
}

// Distance from p to the region outline (for edge-targeted interactions like
// insert-vertex). Returns the outline segment index for polygons.
export function nearestOutlinePoint(
  g: Geometry,
  p: XY,
): { distance: number; segmentIndex: number } {
  const ring = outlineOf(g)
  let best = { distance: Infinity, segmentIndex: 0 }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const lenSq = abx * abx + aby * aby
    const t =
      lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq))
    const d = Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby))
    if (d < best.distance) best = { distance: d, segmentIndex: i }
  }
  return best
}

function pointInRing(ring: XY[], p: XY): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    const crosses = a.y > p.y !== b.y > p.y
    if (crosses && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
