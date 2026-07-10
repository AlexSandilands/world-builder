// Pure pan/zoom transform math. The canvas keeps a single world-coordinate
// system; this is the only place world coordinates become screen pixels, so
// every layer stays registered regardless of pan/zoom (frontend guideline:
// "transforms applied at the viewport level only").

export type Point = { x: number; y: number }

export type Viewport = {
  // Screen-pixel translation of the world origin.
  tx: number
  ty: number
  // Uniform world→screen scale factor.
  scale: number
}

export type ScaleBounds = { min: number; max: number }

export const DEFAULT_SCALE_BOUNDS: ScaleBounds = { min: 0.02, max: 8 }

export function worldToScreen(view: Viewport, p: Point): Point {
  return { x: p.x * view.scale + view.tx, y: p.y * view.scale + view.ty }
}

export function screenToWorld(view: Viewport, p: Point): Point {
  return { x: (p.x - view.tx) / view.scale, y: (p.y - view.ty) / view.scale }
}

export function clampScale(scale: number, bounds = DEFAULT_SCALE_BOUNDS): number {
  return Math.min(bounds.max, Math.max(bounds.min, scale))
}

export function panBy(view: Viewport, dx: number, dy: number): Viewport {
  return { ...view, tx: view.tx + dx, ty: view.ty + dy }
}

// Zoom by `factor` while keeping the world point under `anchor` (screen px)
// fixed — the interaction users expect from wheel zoom.
export function zoomAt(
  view: Viewport,
  anchor: Point,
  factor: number,
  bounds = DEFAULT_SCALE_BOUNDS,
): Viewport {
  const scale = clampScale(view.scale * factor, bounds)
  const applied = scale / view.scale
  return {
    scale,
    tx: anchor.x - (anchor.x - view.tx) * applied,
    ty: anchor.y - (anchor.y - view.ty) * applied,
  }
}

// Fit a world-sized rect into a screen viewport with margin, centred.
export function fitToScreen(
  world: { width: number; height: number },
  screen: { width: number; height: number },
  margin = 0.9,
  bounds = DEFAULT_SCALE_BOUNDS,
): Viewport {
  const scale = clampScale(
    Math.min(screen.width / world.width, screen.height / world.height) * margin,
    bounds,
  )
  return {
    scale,
    tx: (screen.width - world.width * scale) / 2,
    ty: (screen.height - world.height * scale) / 2,
  }
}
