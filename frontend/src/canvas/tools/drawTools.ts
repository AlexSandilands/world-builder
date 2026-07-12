import type { Line, Point, Region } from '../../generated/project'
import type { XY } from '../../features/regions/geometry'
import { simplifyPolyline } from '../../features/regions/geometry'
import { nextLineId, nextPointId, nextRegionId, nextZ } from '../../state/commands'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'
import type { Draft, PointerInfo, Tool, ToolContext } from './toolTypes'

const LASSO_SAMPLE_PX = 2
// RDP tolerance in screen pixels: large enough to absorb hand tremor so a
// freehand stroke commits as a clean ring, not a jagged one.
const LASSO_SIMPLIFY_PX = 4
const MIN_DRAG_PX = 4
// A double-click's second onDown adds a point at (near enough) the same
// spot as the click before it; onDoubleClick strips it below this radius.
const LINE_DEDUPE_PX = 4

function commitRegion(geometry: Region['geometry']): void {
  const project = useProjectStore.getState().project
  const region: Region = {
    id: nextRegionId(project),
    type: useEditorStore.getState().drawType,
    geometry,
    z: nextZ(project),
  }
  useProjectStore.getState().dispatch({ kind: 'region/add', region })
  useEditorStore.getState().select([region.id])
}

function drawingBlocked(): boolean {
  const e = useEditorStore.getState()
  return !e.regionsVisible || e.regionsLocked
}

// Freehand lasso: sample while dragging, simplify to a clean ring on release.
export class LassoTool implements Tool {
  private points: XY[] | null = null

  onDown(e: PointerInfo, ctx: ToolContext): boolean {
    if (drawingBlocked()) return false
    this.points = [e.world]
    ctx.setDraft({ kind: 'lasso', points: this.points })
    return true
  }

  onMove(e: PointerInfo, ctx: ToolContext): void {
    if (!this.points) return
    const last = this.points[this.points.length - 1]
    const minStep = LASSO_SAMPLE_PX / ctx.scale()
    if (Math.hypot(e.world.x - last.x, e.world.y - last.y) < minStep) return
    this.points = [...this.points, e.world]
    ctx.setDraft({ kind: 'lasso', points: this.points })
  }

  onUp(_e: PointerInfo, ctx: ToolContext): void {
    const raw = this.points
    this.cancel(ctx)
    if (!raw) return
    const ring = simplifyPolyline(raw, LASSO_SIMPLIFY_PX / ctx.scale())
    if (ring.length < 3) return
    commitRegion({
      kind: 'polygon',
      points: ring.map((p): [number, number] => [p.x, p.y]) as [
        [number, number],
        [number, number],
        [number, number],
        ...[number, number][],
      ],
    })
  }

  cancel(ctx: ToolContext): void {
    this.points = null
    ctx.setDraft(null)
  }
}

// Shared drag-a-box tool for rect and ellipse.
export class BoxTool implements Tool {
  private readonly shape: 'rect' | 'ellipse'
  private start: XY | null = null

  constructor(shape: 'rect' | 'ellipse') {
    this.shape = shape
  }

  onDown(e: PointerInfo, ctx: ToolContext): boolean {
    if (drawingBlocked()) return false
    this.start = e.world
    ctx.setDraft(this.draft(e.world))
    return true
  }

  onMove(e: PointerInfo, ctx: ToolContext): void {
    if (this.start) ctx.setDraft(this.draft(e.world))
  }

  onUp(e: PointerInfo, ctx: ToolContext): void {
    const a = this.start
    this.cancel(ctx)
    if (!a) return
    const minSize = MIN_DRAG_PX / ctx.scale()
    const width = Math.abs(e.world.x - a.x)
    const height = Math.abs(e.world.y - a.y)
    if (width < minSize || height < minSize) return
    const x = Math.min(a.x, e.world.x)
    const y = Math.min(a.y, e.world.y)
    if (this.shape === 'rect') {
      commitRegion({ kind: 'rect', x, y, width, height })
    } else {
      commitRegion({
        kind: 'ellipse',
        cx: x + width / 2,
        cy: y + height / 2,
        rx: width / 2,
        ry: height / 2,
      })
    }
  }

  cancel(ctx: ToolContext): void {
    this.start = null
    ctx.setDraft(null)
  }

  private draft(to: XY): Draft {
    return { kind: this.shape, a: this.start!, b: to }
  }
}

function linesBlocked(): boolean {
  const e = useEditorStore.getState()
  return !e.linesVisible || e.linesLocked
}

function commitLine(points: XY[]): void {
  const project = useProjectStore.getState().project
  const editor = useEditorStore.getState()
  const line: Line = {
    id: nextLineId(project),
    type: editor.drawLineType,
    points: points.map((p): [number, number] => [p.x, p.y]) as [
      [number, number],
      [number, number],
      ...[number, number][],
    ],
    width: editor.drawLineWidth,
  }
  useProjectStore.getState().dispatch({ kind: 'line/add', line })
  useEditorStore.getState().selectLines([line.id])
}

// Click-to-place polyline. The vertex commits on *release* — a press starts
// placing it, dragging fine-places it, letting go lands it exactly where the
// preview shows (PR #59 round 1: committing on press made the release-point
// preview a lie). Between clicks the rubber band follows the cursor (hover
// onMove routing in CanvasController). A double-click or Enter finishes the
// line; Escape cancels via Tool.cancel.
export class LineTool implements Tool {
  private committed: XY[] | null = null
  // True between a pointer press and its release: the vertex being placed.
  private pending = false

  onDown(e: PointerInfo, ctx: ToolContext): boolean {
    if (linesBlocked()) return false
    this.committed ??= []
    this.pending = true
    this.draft(ctx, e.world)
    return true
  }

  onMove(e: PointerInfo, ctx: ToolContext): void {
    if (!this.committed) return
    this.draft(ctx, e.world)
  }

  onUp(e: PointerInfo, ctx: ToolContext): void {
    if (!this.committed || !this.pending) return
    this.pending = false
    this.committed = [...this.committed, e.world]
    this.draft(ctx, e.world)
  }

  onDoubleClick(_e: PointerInfo, ctx: ToolContext): void {
    const points = this.committed
    if (!points) return
    // The double-click's own two clicks each committed a vertex at (nearly)
    // the same spot; strip the trailing duplicates before finishing.
    const tolerance = LINE_DEDUPE_PX / ctx.scale()
    while (points.length >= 2) {
      const last = points[points.length - 1]
      const prev = points[points.length - 2]
      if (Math.hypot(last.x - prev.x, last.y - prev.y) >= tolerance) break
      points.pop()
    }
    this.finish(ctx)
  }

  // Enter finishes too (CanvasController routes it here). No dedupe: every
  // vertex was a deliberate click, unlike the double-click's phantom pair.
  finish(ctx: ToolContext): void {
    const points = this.committed
    this.committed = null
    this.pending = false
    ctx.setDraft(null)
    if (!points || points.length < 2) return
    commitLine(points)
  }

  cancel(ctx: ToolContext): void {
    this.committed = null
    this.pending = false
    ctx.setDraft(null)
  }

  private draft(ctx: ToolContext, cursor: XY): void {
    ctx.setDraft({ kind: 'line', points: [...this.committed!, cursor] })
  }
}

// Click-to-place landmark/gate point.
export class PointTool implements Tool {
  onDown(e: PointerInfo): boolean {
    const editor = useEditorStore.getState()
    if (!editor.pointsVisible || editor.pointsLocked) return false
    const project = useProjectStore.getState().project
    const point: Point = {
      id: nextPointId(project),
      type: editor.drawPointType,
      position: [e.world.x, e.world.y],
    }
    useProjectStore.getState().dispatch({ kind: 'point/add', point })
    useEditorStore.getState().selectPoints([point.id])
    return true
  }

  onMove(): void {}
  onUp(): void {}
  cancel(): void {}
}
