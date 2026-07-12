import type { PointerInfo, Tool, ToolContext } from '../../canvas/tools/toolTypes'
import type { XY } from '../regions/geometry'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'
import { nearestPointAt } from './hitTest'

const POINT_HIT_PX = 10
const CLICK_SLOP_PX = 3

type DragState = { start: XY; before: XY; pointId: string; moved: boolean }

// Select/drag for points. Tried as a select-tool candidate before line and
// region hit-testing (mirrors features/underlay/interaction.ts) — points are
// drawn smallest and topmost, so they win a click over a line or region
// beneath them.
export class PointInteraction implements Tool {
  private drag: DragState | null = null

  onDown(e: PointerInfo, ctx: ToolContext): boolean {
    const editor = useEditorStore.getState()
    if (!editor.pointsVisible || editor.pointsLocked) return false
    const project = useProjectStore.getState().project
    const hit = nearestPointAt(project.points, e.world, POINT_HIT_PX / ctx.scale())
    if (!hit) return false

    if (e.shiftKey) {
      editor.toggleSelectedPoint(hit.id)
      return true
    }
    if (!editor.selectedPointIds.includes(hit.id)) editor.selectPoints([hit.id])
    this.drag = {
      start: e.world,
      before: { x: hit.position[0], y: hit.position[1] },
      pointId: hit.id,
      moved: false,
    }
    return true
  }

  onMove(e: PointerInfo, ctx: ToolContext): void {
    const drag = this.drag
    if (!drag) return
    const dx = e.world.x - drag.start.x
    const dy = e.world.y - drag.start.y
    const slop = CLICK_SLOP_PX / ctx.scale()
    if (!drag.moved && Math.hypot(dx, dy) < slop) return
    drag.moved = true
    useProjectStore.getState().previewPoint(drag.pointId, [drag.before.x + dx, drag.before.y + dy])
  }

  onUp(): void {
    const drag = this.drag
    this.drag = null
    if (!drag || !drag.moved) return
    const { project, record } = useProjectStore.getState()
    const after = project.points.find((p) => p.id === drag.pointId)
    if (!after) return
    record({
      kind: 'point/replace',
      changes: [
        {
          id: drag.pointId,
          before: { ...after, position: [drag.before.x, drag.before.y] },
          after,
        },
      ],
    })
  }

  cancel(): void {
    const drag = this.drag
    this.drag = null
    if (!drag || !drag.moved) return
    useProjectStore.getState().previewPoint(drag.pointId, [drag.before.x, drag.before.y])
  }
}
