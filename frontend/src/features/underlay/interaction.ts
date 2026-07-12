import type { Underlay } from '../../generated/project'
import type { Tool, ToolContext, PointerInfo } from '../../canvas/tools/toolTypes'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'
import type { Handle } from '../regions/handles'
import { applyHandleDrag, handlesFor } from '../regions/handles'
import { translateGeometry } from '../regions/geometry'
import { pointInGeometry } from '../regions/hitTest'
import type { RectGeometry } from './rect'
import { fromRect, toRect } from './rect'

const HANDLE_HIT_PX = 8
const CLICK_SLOP_PX = 3

type DragState =
  | { mode: 'translate'; start: { x: number; y: number }; before: Underlay; moved: boolean }
  | { mode: 'handle'; handle: Handle; before: Underlay; moved: boolean }

// Move/resize for the single underlay image, mirroring SelectTool's
// region-drag contract (drags preview transiently, commit one undoable
// command on release) but scoped to project.underlay and the editor's
// underlay visibility/lock/selection state. Rotation has no drag gesture
// here — set via a numeric field (UnderlayPanel) — so this only implements
// translate and corner-resize.
export class UnderlayInteraction implements Tool {
  private drag: DragState | null = null

  onDown(e: PointerInfo, ctx: ToolContext): boolean {
    const editor = useEditorStore.getState()
    if (!editor.underlayVisible || editor.underlayLocked) return false
    const underlay = useProjectStore.getState().project.underlay
    if (!underlay) return false
    const tolerance = HANDLE_HIT_PX / ctx.scale()

    if (editor.underlaySelected) {
      const handle = this.handleAt(underlay, e.world, tolerance)
      if (handle) {
        this.drag = { mode: 'handle', handle, before: underlay, moved: false }
        return true
      }
    }

    if (pointInGeometry(toRect(underlay), e.world)) {
      if (!editor.underlaySelected) editor.setUnderlaySelected(true)
      this.drag = { mode: 'translate', start: e.world, before: underlay, moved: false }
      return true
    }

    if (editor.underlaySelected) editor.setUnderlaySelected(false)
    return false
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
      const rect = translateGeometry(toRect(drag.before), dx, dy) as RectGeometry
      useProjectStore.getState().previewUnderlay(fromRect(drag.before, rect))
      return
    }

    drag.moved = true
    const rect = applyHandleDrag(toRect(drag.before), drag.handle, e.world) as RectGeometry
    useProjectStore.getState().previewUnderlay(fromRect(drag.before, rect))
  }

  onUp(): void {
    const drag = this.drag
    this.drag = null
    if (!drag || !drag.moved) return
    const after = useProjectStore.getState().project.underlay
    if (!after) return
    useProjectStore.getState().record({ kind: 'underlay/set', before: drag.before, after })
  }

  cancel(): void {
    const drag = this.drag
    this.drag = null
    if (!drag || !drag.moved) return
    useProjectStore.getState().previewUnderlay(drag.before)
  }

  private handleAt(
    underlay: Underlay,
    p: { x: number; y: number },
    tolerance: number,
  ): Handle | null {
    let best: Handle | null = null
    let bestDist = tolerance
    for (const handle of handlesFor(toRect(underlay))) {
      const d = Math.hypot(handle.at.x - p.x, handle.at.y - p.y)
      if (d <= bestDist) {
        bestDist = d
        best = handle
      }
    }
    return best
  }
}
