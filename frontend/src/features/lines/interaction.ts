import type { Line } from '../../generated/project'
import type { PointerInfo, Tool, ToolContext } from '../../canvas/tools/toolTypes'
import type { XY } from '../regions/geometry'
import type { Handle } from '../regions/handles'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'
import { replaceLineCommand } from '../../state/commands'
import { applyLineHandleDrag, handlesForLine } from './handles'
import {
  deletePolylineVertex,
  insertPolylineVertex,
  nearestOpenSegment,
  translateLine,
} from './geometry'
import { nearestLineAt } from './hitTest'

const HANDLE_HIT_PX = 7
const LINE_HIT_PX = 6
const CLICK_SLOP_PX = 3

type DragState =
  | { mode: 'translate'; start: XY; before: Line['points']; lineId: string; moved: boolean }
  | { mode: 'handle'; lineId: string; handle: Handle; before: Line['points']; moved: boolean }

// Select/edit for lines: click/shift-click select, drag the stroke to
// translate, drag a vertex to move it, alt-click a vertex deletes it,
// double-click an edge inserts one. Tried as a select-tool candidate before
// region hit-testing (mirrors features/underlay/interaction.ts) so a click on
// a line's stroke wins over a region marquee beneath it.
export class LineInteraction implements Tool {
  private drag: DragState | null = null

  onDown(e: PointerInfo, ctx: ToolContext): boolean {
    const editor = useEditorStore.getState()
    if (!editor.linesVisible || editor.linesLocked) return false
    const project = useProjectStore.getState().project
    const tolerance = HANDLE_HIT_PX / ctx.scale()

    if (editor.selectedLineIds.length === 1) {
      const line = project.lines.find((l) => l.id === editor.selectedLineIds[0])
      const handle = line ? this.handleAt(line, e.world, tolerance) : null
      if (line && handle) {
        if (e.altKey) {
          const points = deletePolylineVertex(line.points, handle.index)
          if (points !== line.points) this.dispatchPoints(line.id, points)
          return true
        }
        this.drag = { mode: 'handle', lineId: line.id, handle, before: line.points, moved: false }
        return true
      }
    }

    const hit = nearestLineAt(project.lines, e.world, LINE_HIT_PX / ctx.scale())
    if (!hit) return false

    if (e.shiftKey) {
      editor.toggleSelectedLine(hit.line.id)
      return true
    }
    if (!editor.selectedLineIds.includes(hit.line.id)) editor.selectLines([hit.line.id])
    this.drag = {
      mode: 'translate',
      start: e.world,
      before: hit.line.points,
      lineId: hit.line.id,
      moved: false,
    }
    return true
  }

  onMove(e: PointerInfo, ctx: ToolContext): void {
    const drag = this.drag
    if (!drag) return
    const slop = CLICK_SLOP_PX / ctx.scale()

    if (drag.mode === 'translate') {
      const dx = e.world.x - drag.start.x
      const dy = e.world.y - drag.start.y
      if (!drag.moved && Math.hypot(dx, dy) < slop) return
      drag.moved = true
      useProjectStore.getState().previewLine(drag.lineId, translateLine(drag.before, dx, dy))
      return
    }

    drag.moved = true
    useProjectStore
      .getState()
      .previewLine(drag.lineId, applyLineHandleDrag(drag.before, drag.handle, e.world))
  }

  onUp(): void {
    const drag = this.drag
    this.drag = null
    if (!drag || !drag.moved) return
    const { project, record } = useProjectStore.getState()
    const after = project.lines.find((l) => l.id === drag.lineId)
    if (!after) return
    record({
      kind: 'line/replace',
      changes: [{ id: drag.lineId, before: { ...after, points: drag.before }, after }],
    })
  }

  onDoubleClick(e: PointerInfo, ctx: ToolContext): void {
    const editor = useEditorStore.getState()
    if (!editor.linesVisible || editor.linesLocked) return
    if (editor.selectedLineIds.length !== 1) return
    const project = useProjectStore.getState().project
    const line = project.lines.find((l) => l.id === editor.selectedLineIds[0])
    if (!line) return
    const xy = line.points.map(([x, y]) => ({ x, y }))
    const { distance, index } = nearestOpenSegment(xy, e.world)
    if (distance > LINE_HIT_PX / ctx.scale()) return
    this.dispatchPoints(line.id, insertPolylineVertex(line.points, index, e.world))
  }

  cancel(): void {
    const drag = this.drag
    this.drag = null
    if (!drag || !drag.moved) return
    useProjectStore.getState().previewLine(drag.lineId, drag.before)
  }

  private handleAt(line: Line, p: XY, tolerance: number): Handle | null {
    let best: Handle | null = null
    let bestDist = tolerance
    for (const handle of handlesForLine(line.points)) {
      const d = Math.hypot(handle.at.x - p.x, handle.at.y - p.y)
      if (d <= bestDist) {
        bestDist = d
        best = handle
      }
    }
    return best
  }

  private dispatchPoints(id: string, points: Line['points']): void {
    const { project, dispatch } = useProjectStore.getState()
    const cmd = replaceLineCommand(project, id, { points })
    if (cmd) dispatch(cmd)
  }
}
