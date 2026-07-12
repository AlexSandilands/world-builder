import type { Geometry, Underlay } from '../../generated/project'

// The underlay's placement is a RectGeometry in every way that matters for
// move/resize/outline math (docs/schema/project-v1.md): same x/y/width/
// height/rotation semantics. This adapter lets it reuse features/regions'
// geometry helpers instead of a second copy of the same math.
export type RectGeometry = Extract<Geometry, { kind: 'rect' }>

export function toRect(u: Underlay): RectGeometry {
  return { kind: 'rect', x: u.x, y: u.y, width: u.width, height: u.height, rotation: u.rotation }
}

export function fromRect(u: Underlay, rect: RectGeometry): Underlay {
  return {
    ...u,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotation: rect.rotation,
  }
}
