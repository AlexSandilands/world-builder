import type { Region } from '../../generated/project'
import type { XY } from '../../features/regions/geometry'
import { simplifyPolyline } from '../../features/regions/geometry'
import { nextRegionId, nextZ } from '../../state/commands'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'
import type { Draft, PointerInfo, Tool, ToolContext } from './toolTypes'

const LASSO_SAMPLE_PX = 2
// RDP tolerance in screen pixels: large enough to absorb hand tremor so a
// freehand stroke commits as a clean ring, not a jagged one.
const LASSO_SIMPLIFY_PX = 4
const MIN_DRAG_PX = 4

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
