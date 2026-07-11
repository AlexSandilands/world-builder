import type { Geometry, Region } from '../../generated/project'
import type { Bounds, XY } from '../../features/regions/geometry'
import {
  boundsOf,
  deletePolygonVertex,
  insertPolygonVertex,
  snapToVertex,
  translateGeometry,
} from '../../features/regions/geometry'
import type { Handle } from '../../features/regions/handles'
import { applyHandleDrag, handlesFor } from '../../features/regions/handles'
import { nearestOutlinePoint, topRegionAt } from '../../features/regions/hitTest'
import { replaceRegionCommand } from '../../state/commands'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'
import type { PointerInfo, Tool, ToolContext } from './toolTypes'

const HANDLE_HIT_PX = 7
const EDGE_HIT_PX = 6
const SNAP_PX = 8
const CLICK_SLOP_PX = 3

type DragState =
  | { mode: 'translate'; start: XY; before: Map<string, Geometry>; moved: boolean; hitId: string }
  | { mode: 'handle'; regionId: string; handle: Handle; before: Geometry; moved: boolean }
  | { mode: 'marquee'; start: XY; to: XY; moved: boolean; additive: boolean }

// Selection and geometry editing: click/shift-click select, drag empty canvas
// to rubber-band marquee, drag a region to translate the selection, drag
// handles to move vertices or scale, alt-click deletes a vertex, double-click
// an edge inserts one. Drags preview transiently and commit exactly one
// undoable command on release.
export class SelectTool implements Tool {
  private drag: DragState | null = null

  onDown(e: PointerInfo, ctx: ToolContext): boolean {
    const editor = useEditorStore.getState()
    if (!editor.regionsVisible || editor.regionsLocked) return false
    const project = useProjectStore.getState().project
    const tolerance = HANDLE_HIT_PX / ctx.scale()

    const selectedIds = editor.selectedRegionIds
    if (selectedIds.length === 1) {
      const region = project.regions.find((r) => r.id === selectedIds[0])
      const handle = region ? this.handleAt(region.geometry, e.world, tolerance) : null
      if (region && handle) {
        if (e.altKey && handle.kind === 'vertex') {
          const geometry = deletePolygonVertex(region.geometry, handle.index)
          if (geometry !== region.geometry) this.dispatchGeometry(region.id, geometry)
          return true
        }
        this.drag = {
          mode: 'handle',
          regionId: region.id,
          handle,
          before: region.geometry,
          moved: false,
        }
        return true
      }
    }

    const hit = topRegionAt(project.regions, e.world)
    if (!hit) {
      // A near-miss on the selected outline is kept: it is the double-click
      // insert-vertex target, which must not clear the selection first.
      if (selectedIds.length === 1) {
        const region = project.regions.find((r) => r.id === selectedIds[0])
        if (
          region &&
          nearestOutlinePoint(region.geometry, e.world).distance <= EDGE_HIT_PX / ctx.scale()
        ) {
          return true
        }
      }
      // Empty canvas: begin a marquee. A plain click (no drag) clears the
      // selection on release; a drag rubber-band selects.
      this.drag = {
        mode: 'marquee',
        start: e.world,
        to: e.world,
        moved: false,
        additive: e.shiftKey,
      }
      return true
    }
    if (e.shiftKey) {
      editor.toggleSelected(hit.id)
      return true
    }
    if (!selectedIds.includes(hit.id)) editor.select([hit.id])
    const before = new Map<string, Geometry>()
    for (const r of project.regions) {
      if (useEditorStore.getState().selectedRegionIds.includes(r.id)) before.set(r.id, r.geometry)
    }
    this.drag = { mode: 'translate', start: e.world, before, moved: false, hitId: hit.id }
    return true
  }

  onMove(e: PointerInfo, ctx: ToolContext): void {
    const drag = this.drag
    if (!drag) return
    const slop = CLICK_SLOP_PX / ctx.scale()

    if (drag.mode === 'marquee') {
      drag.to = e.world
      if (!drag.moved && Math.hypot(e.world.x - drag.start.x, e.world.y - drag.start.y) < slop) {
        return
      }
      drag.moved = true
      ctx.setDraft({ kind: 'marquee', a: drag.start, b: e.world })
      return
    }

    if (drag.mode === 'translate') {
      const dx = e.world.x - drag.start.x
      const dy = e.world.y - drag.start.y
      if (!drag.moved && Math.hypot(dx, dy) < slop) return
      drag.moved = true
      const preview = useProjectStore.getState().previewGeometry
      for (const [id, geometry] of drag.before) preview(id, translateGeometry(geometry, dx, dy))
      return
    }

    drag.moved = true
    let target = e.world
    if (drag.handle.kind === 'vertex') {
      const others = useProjectStore.getState().project.regions
      target = snapToVertex(others, drag.regionId, e.world, SNAP_PX / ctx.scale()) ?? e.world
    }
    useProjectStore
      .getState()
      .previewGeometry(drag.regionId, applyHandleDrag(drag.before, drag.handle, target))
  }

  onUp(_e?: PointerInfo, ctx?: ToolContext): void {
    const drag = this.drag
    this.drag = null
    if (!drag) return
    const { project, record } = useProjectStore.getState()

    if (drag.mode === 'marquee') {
      ctx?.setDraft(null)
      this.commitMarquee(drag)
      return
    }

    if (!drag.moved) {
      // Plain click (no drag) on a region inside a multi-selection collapses
      // the selection to that region.
      if (drag.mode === 'translate' && drag.before.size > 1) {
        useEditorStore.getState().select([drag.hitId])
      }
      return
    }

    const beforeById =
      drag.mode === 'translate' ? drag.before : new Map([[drag.regionId, drag.before]])
    const changes: { id: string; before: Region; after: Region }[] = []
    for (const [id, beforeGeometry] of beforeById) {
      const after = project.regions.find((r) => r.id === id)
      if (!after || after.geometry === beforeGeometry) continue
      changes.push({ id, before: { ...after, geometry: beforeGeometry }, after })
    }
    if (changes.length > 0) record({ kind: 'region/replace', changes })
  }

  onDoubleClick(e: PointerInfo, ctx: ToolContext): void {
    const editor = useEditorStore.getState()
    if (!editor.regionsVisible || editor.regionsLocked) return
    if (editor.selectedRegionIds.length !== 1) return
    const project = useProjectStore.getState().project
    const region = project.regions.find((r) => r.id === editor.selectedRegionIds[0])
    if (!region || region.geometry.kind !== 'polygon') return
    const { distance, segmentIndex } = nearestOutlinePoint(region.geometry, e.world)
    if (distance > EDGE_HIT_PX / ctx.scale()) return
    this.dispatchGeometry(region.id, insertPolygonVertex(region.geometry, segmentIndex, e.world))
  }

  cancel(ctx?: ToolContext): void {
    const drag = this.drag
    this.drag = null
    if (!drag) return
    if (drag.mode === 'marquee') {
      ctx?.setDraft(null)
      return
    }
    if (!drag.moved) return
    const preview = useProjectStore.getState().previewGeometry
    if (drag.mode === 'translate') {
      for (const [id, geometry] of drag.before) preview(id, geometry)
    } else {
      preview(drag.regionId, drag.before)
    }
  }

  private commitMarquee(drag: Extract<DragState, { mode: 'marquee' }>): void {
    const editor = useEditorStore.getState()
    if (!drag.moved) {
      // A plain empty click deselects (unless shift-held for additive intent).
      if (!drag.additive) editor.clearSelection()
      return
    }
    const rect = marqueeBounds(drag.start, drag.to)
    const inside = useProjectStore
      .getState()
      .project.regions.filter((r) => boundsIntersect(boundsOf(r.geometry), rect))
      .map((r) => r.id)
    if (!drag.additive) {
      editor.select(inside)
      return
    }
    const merged = [...editor.selectedRegionIds]
    for (const id of inside) if (!merged.includes(id)) merged.push(id)
    editor.select(merged)
  }

  private handleAt(g: Geometry, p: XY, tolerance: number): Handle | null {
    let best: Handle | null = null
    let bestDist = tolerance
    for (const handle of handlesFor(g)) {
      const d = Math.hypot(handle.at.x - p.x, handle.at.y - p.y)
      // Vertex handles win ties so bbox-corner scaling never shadows them.
      if (d < bestDist || (d <= bestDist && handle.kind === 'vertex')) {
        bestDist = d
        best = handle
      }
    }
    return best
  }

  private dispatchGeometry(id: string, geometry: Geometry): void {
    const { project, dispatch } = useProjectStore.getState()
    const cmd = replaceRegionCommand(project, id, { geometry })
    if (cmd) dispatch(cmd)
  }
}

function marqueeBounds(a: XY, b: XY): Bounds {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  }
}

function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}
