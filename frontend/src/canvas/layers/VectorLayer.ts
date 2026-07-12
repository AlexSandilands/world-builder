import { Container, Graphics } from 'pixi.js'
import type { Line, Point, Region, WorldBuilderProject } from '../../generated/project'
import { geometryCenter, outlineOf } from '../../features/regions/geometry'
import { handlesFor } from '../../features/regions/handles'
import { dashSegments } from '../../features/lines/geometry'
import { handlesForLine } from '../../features/lines/handles'
import { LINE_COLORS } from '../../features/lines/style'
import { isBelowMinSize } from '../../features/regions/minSize'
import { stackingOrder } from '../../state/commands'
import type { OverlayTheme } from '../overlayTheme'
import type { Draft } from '../tools/toolTypes'

export type VectorScene = {
  project: WorldBuilderProject
  selectedRegionIds: readonly string[]
  selectedLineIds: readonly string[]
  selectedPointIds: readonly string[]
  regionsVisible: boolean
  linesVisible: boolean
  pointsVisible: boolean
  draft: Draft | null
}

// Screen-px radius by sizeHint (points carry no vocabulary colour like
// region maskColor — schema/project-v1.md — so size is the only per-point
// visual besides the shared marker colour).
const POINT_RADIUS_PX: Record<NonNullable<Point['sizeHint']>, number> = {
  small: 4,
  medium: 6,
  large: 8,
}

// Semantic vector overlay: regions in compiler stacking order (each filled
// with its vocabulary mask colour), then lines, then points (topmost —
// smallest target, wins hit-testing), each with selection chrome and edit
// handles, then the in-progress draw draft. All geometry is world-space;
// stroke/handle sizes divide by scale to hold screen size.
export class VectorLayer extends Container {
  private readonly g = new Graphics()
  private readonly theme: OverlayTheme

  constructor(theme: OverlayTheme) {
    super()
    this.theme = theme
    this.addChild(this.g)
  }

  redraw(scene: VectorScene, scale: number): void {
    const g = this.g
    g.clear()
    const { project } = scene
    const px = (n: number) => n / scale

    if (scene.regionsVisible) {
      const maskColor = new Map(
        project.vocabulary
          .filter((t) => t.category === 'region')
          .map((t) => [t.id, (t as { maskColor: string }).maskColor]),
      )
      const selected = new Set(scene.selectedRegionIds)

      for (const region of stackingOrder(project.regions)) {
        const color = maskColor.get(region.type) ?? '#888888'
        const ring = outlineOf(region.geometry, 64)
        g.poly(ring.flatMap((p) => [p.x, p.y]))
          .fill({ color, alpha: 0.3 })
          .stroke({ width: px(1.5), color, alpha: 0.9 })
        if (isBelowMinSize(region.geometry, project.global)) this.drawWarning(region, ring, px)
      }

      for (const region of project.regions) {
        if (selected.has(region.id)) this.drawSelection(region, px)
      }
      if (scene.selectedRegionIds.length === 1) {
        const only = project.regions.find((r) => r.id === scene.selectedRegionIds[0])
        if (only) this.drawHandles(only, px)
      }
    }

    if (scene.linesVisible) {
      const selectedLines = new Set(scene.selectedLineIds)
      for (const line of project.lines) {
        if (selectedLines.has(line.id)) this.drawLineSelection(line, px)
        this.drawLine(line, px)
      }
      if (scene.selectedLineIds.length === 1) {
        const only = project.lines.find((l) => l.id === scene.selectedLineIds[0])
        if (only) this.drawLineHandles(only, px)
      }
    }

    if (scene.pointsVisible) {
      const selectedPoints = new Set(scene.selectedPointIds)
      for (const point of project.points) this.drawPoint(point, px, selectedPoints.has(point.id))
    }

    if (scene.draft) this.drawDraft(scene.draft, px)
  }

  private drawSelection(region: Region, px: (n: number) => number): void {
    const ring = outlineOf(region.geometry, 64)
    this.g
      .poly(ring.flatMap((p) => [p.x, p.y]))
      .fill({ color: this.theme.selectionFill })
      .stroke({ width: px(2), color: this.theme.selection })
  }

  private drawHandles(region: Region, px: (n: number) => number): void {
    for (const handle of handlesFor(region.geometry)) {
      const r = handle.kind === 'vertex' ? px(4) : px(5)
      this.g
        .rect(handle.at.x - r, handle.at.y - r, r * 2, r * 2)
        .fill({ color: handle.kind === 'vertex' ? this.theme.handle : this.theme.selection })
        .stroke({
          width: px(1.5),
          color: handle.kind === 'vertex' ? this.theme.selection : this.theme.handle,
        })
    }
  }

  private drawWarning(
    region: Region,
    ring: { x: number; y: number }[],
    px: (n: number) => number,
  ): void {
    this.g
      .poly(ring.flatMap((p) => [p.x, p.y]))
      .fill({ color: this.theme.warningFill })
      .stroke({ width: px(1.5), color: this.theme.warning })
    const c = geometryCenter(region.geometry)
    const r = px(8)
    this.g.circle(c.x, c.y, r).fill({ color: this.theme.warning })
    // Exclamation mark, drawn as bar + dot so no text texture is needed.
    this.g
      .rect(c.x - r * 0.12, c.y - r * 0.55, r * 0.24, r * 0.62)
      .fill({ color: this.theme.handle })
    this.g.circle(c.x, c.y + r * 0.4, r * 0.14).fill({ color: this.theme.handle })
  }

  private drawLine(line: Line, px: (n: number) => number): void {
    const width = Math.max(line.width, px(1.5))
    const stroke = { width, color: LINE_COLORS[line.type], alpha: 0.85 }
    if (line.style === 'dashed') {
      const xy = line.points.map(([x, y]) => ({ x, y }))
      for (const [a, b] of dashSegments(xy, px(10), px(6))) {
        this.g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke(stroke)
      }
      return
    }
    this.g
      .poly(
        line.points.flatMap((p) => [p[0], p[1]]),
        false,
      )
      .stroke(stroke)
  }

  // A halo stroke behind the line's own colour, in the shared selection
  // colour — reads as a highlight without hiding the type colour on top.
  private drawLineSelection(line: Line, px: (n: number) => number): void {
    this.g
      .poly(
        line.points.flatMap((p) => [p[0], p[1]]),
        false,
      )
      .stroke({ width: Math.max(line.width, px(1.5)) + px(4), color: this.theme.selection })
  }

  private drawLineHandles(line: Line, px: (n: number) => number): void {
    for (const handle of handlesForLine(line.points)) {
      const r = px(4)
      this.g
        .rect(handle.at.x - r, handle.at.y - r, r * 2, r * 2)
        .fill({ color: this.theme.handle })
        .stroke({ width: px(1.5), color: this.theme.selection })
    }
  }

  private drawPoint(point: Point, px: (n: number) => number, selected: boolean): void {
    const [x, y] = point.position
    const r = px(POINT_RADIUS_PX[point.sizeHint ?? 'medium'])
    if (selected) {
      this.g.circle(x, y, r + px(3)).stroke({ width: px(2), color: this.theme.selection })
    }
    this.g
      .circle(x, y, r)
      .fill({ color: this.theme.marker })
      .stroke({ width: px(1.5), color: this.theme.handle })
  }

  private drawDraft(draft: Draft, px: (n: number) => number): void {
    const stroke = { width: px(1.5), color: this.theme.draft }
    if (draft.kind === 'lasso') {
      if (draft.points.length < 2) return
      this.g
        .poly(
          draft.points.flatMap((p) => [p.x, p.y]),
          false,
        )
        .stroke(stroke)
      return
    }
    if (draft.kind === 'line') {
      if (draft.points.length < 2) return
      this.g
        .poly(
          draft.points.flatMap((p) => [p.x, p.y]),
          false,
        )
        .stroke(stroke)
      for (const p of draft.points) {
        this.g.circle(p.x, p.y, px(3)).fill({ color: this.theme.draft })
      }
      return
    }
    const x = Math.min(draft.a.x, draft.b.x)
    const y = Math.min(draft.a.y, draft.b.y)
    const w = Math.abs(draft.b.x - draft.a.x)
    const h = Math.abs(draft.b.y - draft.a.y)
    if (draft.kind === 'marquee') {
      // Selection colour, not the draw colour: a marquee picks, not draws.
      this.g
        .rect(x, y, w, h)
        .fill({ color: this.theme.selectionFill })
        .stroke({ width: px(1), color: this.theme.selection })
    } else if (draft.kind === 'rect') {
      this.g.rect(x, y, w, h).stroke(stroke)
    } else {
      this.g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2).stroke(stroke)
    }
  }
}
