import { Application, Container } from 'pixi.js'
import type { XY } from '../features/regions/geometry'
import { handlesFor } from '../features/regions/handles'
import { topRegionAt } from '../features/regions/hitTest'
import { LineInteraction } from '../features/lines/interaction'
import { PointInteraction } from '../features/points/interaction'
import { UnderlayInteraction } from '../features/underlay/interaction'
import type { ToolId } from '../state/editorStore'
import { useEditorStore } from '../state/editorStore'
import { useProjectStore } from '../state/projectStore'
import type { Viewport } from './viewportMath'
import { fitToScreen, panBy, screenToWorld, zoomAt } from './viewportMath'
import { UnderlayLayer } from './layers/UnderlayLayer'
import { VectorLayer } from './layers/VectorLayer'
import { SyntheticTileSource } from './tiles/TileSource'
import { TileLayer } from './tiles/TileLayer'
import { readOverlayTheme } from './overlayTheme'
import { BoxTool, LassoTool, LineTool, PointTool } from './tools/drawTools'
import { SelectTool } from './tools/selectTool'
import type { Draft, PointerInfo, Tool, ToolContext } from './tools/toolTypes'

type Readout = (zoomPercent: number, residentTiles: number) => void

// A right-click hit, handed to React so it can render the canvas context menu.
// `regionId`/`vertexIndex` are null when nothing actionable is under the cursor.
export type ContextMenuRequest = {
  x: number
  y: number
  regionId: string | null
  vertexIndex: number | null
}

type ContextMenuHandler = (request: ContextMenuRequest) => void

const VERTEX_HIT_PX = 7

// The hand tool pans; the controller's pan gesture does the work, so the tool
// itself consumes nothing.
const HAND_TOOL: Tool = {
  onDown: () => false,
  onMove: () => {},
  onUp: () => {},
  cancel: () => {},
}

// Space is the temporary-pan key only when not typing into a field.
function isTypingTarget(el: Element | null): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  )
}

// Owns the PixiJS scene graph: one `world` container (the shared canvas-unit
// coordinate system) holding the artwork tile pyramid at the bottom and the
// semantic vector layer above it. Pointer input routes to the active editing
// tool; unconsumed drags pan. Pan/zoom mutate the world transform
// imperatively, and the controller subscribes to the stores directly, so
// neither path round-trips through React.
export class CanvasController {
  private app = new Application()
  private world = new Container()
  private tiles: TileLayer | null = null
  private underlay: UnderlayLayer | null = null
  private vectors: VectorLayer | null = null
  private view: Viewport = { tx: 0, ty: 0, scale: 1 }
  private worldSize = { width: 1, height: 1 }
  private draft: Draft | null = null
  private panning = false
  // The specific Tool instance mid-gesture (may be underlayInteraction, not
  // necessarily this.tools[tool]) — null when no drag is in progress.
  private activeDrag: Tool | null = null
  private spaceHeld = false
  private last = { x: 0, y: 0 }
  private disposers: Array<() => void> = []
  private readonly onReadout: Readout
  private readonly onContextMenu: ContextMenuHandler
  private readonly underlayInteraction = new UnderlayInteraction()
  private readonly lineInteraction = new LineInteraction()
  private readonly pointInteraction = new PointInteraction()
  private readonly tools: Record<ToolId, Tool> = {
    select: new SelectTool(),
    hand: HAND_TOOL,
    lasso: new LassoTool(),
    rect: new BoxTool('rect'),
    ellipse: new BoxTool('ellipse'),
    line: new LineTool(),
    point: new PointTool(),
  }
  private readonly toolContext: ToolContext = {
    scale: () => this.view.scale,
    setDraft: (draft) => {
      this.draft = draft
      this.renderVectors()
    },
  }

  constructor(onReadout: Readout, onContextMenu: ContextMenuHandler = () => {}) {
    this.onReadout = onReadout
    this.onContextMenu = onContextMenu
  }

  async mount(parent: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: parent,
      antialias: true,
      background: 0x121110,
      preference: 'webgl',
    })
    parent.appendChild(this.app.canvas)

    const { global } = useProjectStore.getState().project
    this.worldSize = global.canvas
    this.tiles = new TileLayer(
      new SyntheticTileSource({
        width: global.output.width,
        height: global.output.height,
        tileSize: 256,
      }),
    )
    // The pyramid is output pixels; the world is canvas units. One uniform
    // scale maps between them (schema invariant I6: equal aspect ratios).
    this.tiles.scale.set(global.canvas.width / global.output.width)
    // Between tiles and vectors: a reference sits above the artwork and
    // below the regions traced over it (docs/guidelines/frontend.md's layer
    // order, extended one slot for the underlay).
    this.underlay = new UnderlayLayer(readOverlayTheme())
    this.vectors = new VectorLayer(readOverlayTheme())
    this.world.addChild(this.tiles)
    this.world.addChild(this.underlay)
    this.world.addChild(this.vectors)
    this.app.stage.addChild(this.world)

    this.bindInput()
    this.disposers.push(useProjectStore.subscribe(() => this.renderVectors()))
    this.disposers.push(useEditorStore.subscribe(this.onEditorChange))
    this.fit()
  }

  // Class field (not a mount-time closure) so regression tests can drive the
  // exact handler the store subscription registers, without a WebGL mount.
  private readonly onEditorChange = (state: { tool: ToolId }, prev: { tool: ToolId }): void => {
    if (state.tool !== prev.tool) {
      this.cancelActive()
      // A multi-click draw tool (line) can be mid-gesture between
      // pointer-up events, when it is not `activeDrag` — cancel the tool
      // being left explicitly so switching away mid-draw discards it.
      this.tools[prev.tool].cancel(this.toolContext)
      this.updateCursor()
    }
    this.renderVectors()
  }

  fit(): void {
    this.view = fitToScreen(this.worldSize, this.app.screen)
    this.apply()
  }

  private activeTool(): Tool {
    return this.tools[useEditorStore.getState().tool]
  }

  private cancelActive(): void {
    const drag = this.activeDrag
    this.activeDrag = null
    drag?.cancel(this.toolContext)
  }

  // The select tool also owns points, lines and the underlay: try them first
  // in visual top-to-bottom order (each declines fast — hidden/locked/miss —
  // when it's not the pointer's target) so a click on the topmost thing under
  // the cursor wins over broader hit-tests beneath it (a region marquee,
  // ultimately). Other tools (draw, hand) never touch them.
  private pointerDownCandidates(): Tool[] {
    if (useEditorStore.getState().tool !== 'select') return [this.activeTool()]
    return [
      this.pointInteraction,
      this.lineInteraction,
      this.underlayInteraction,
      this.activeTool(),
    ]
  }

  private pointerInfo(e: PointerEvent | MouseEvent): PointerInfo {
    return {
      world: screenToWorld(this.view, { x: e.offsetX, y: e.offsetY }),
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    }
  }

  // Pan when the gesture is a pan gesture: middle-drag always, or a left-drag
  // with the hand tool active or space held (the standard temporary-pan key).
  private isPanGesture(e: PointerEvent): boolean {
    if (e.button === 1) return true
    if (e.button !== 0) return false
    return this.spaceHeld || useEditorStore.getState().tool === 'hand'
  }

  private updateCursor(): void {
    // No renderer before mount (handler regression tests run unmounted).
    if (!this.app.renderer) return
    const style = this.app.canvas.style
    if (this.panning) style.cursor = 'grabbing'
    else if (this.spaceHeld || useEditorStore.getState().tool === 'hand') style.cursor = 'grab'
    else style.cursor = ''
  }

  private bindInput(): void {
    const canvas = this.app.canvas
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.0015)
      this.view = zoomAt(this.view, { x: e.offsetX, y: e.offsetY }, factor)
      this.apply()
    }
    const onDown = (e: PointerEvent) => {
      // Right button is reserved for the context menu (contextmenu event).
      if (e.button === 2) return
      canvas.setPointerCapture(e.pointerId)
      this.last = { x: e.clientX, y: e.clientY }
      if (this.isPanGesture(e)) {
        this.panning = true
        this.updateCursor()
        return
      }
      if (e.button === 0) {
        const info = this.pointerInfo(e)
        for (const candidate of this.pointerDownCandidates()) {
          if (candidate.onDown(info, this.toolContext)) {
            this.activeDrag = candidate
            this.renderVectors()
            break
          }
        }
      }
    }
    const onMove = (e: PointerEvent) => {
      if (this.activeDrag) {
        this.activeDrag.onMove(this.pointerInfo(e), this.toolContext)
        return
      }
      if (!this.panning) {
        // Hover (no button held): a multi-click tool's rubber band (line)
        // must track the cursor between clicks. Other tools' onMove no-ops
        // without an in-progress gesture, so routing every hover is safe.
        this.activeTool().onMove(this.pointerInfo(e), this.toolContext)
        return
      }
      this.view = panBy(this.view, e.clientX - this.last.x, e.clientY - this.last.y)
      this.last = { x: e.clientX, y: e.clientY }
      this.apply()
    }
    const onUp = (e: PointerEvent) => {
      if (this.activeDrag) {
        const drag = this.activeDrag
        this.activeDrag = null
        drag.onUp(this.pointerInfo(e), this.toolContext)
        this.renderVectors()
      }
      this.panning = false
      this.updateCursor()
    }
    const onDoubleClick = (e: MouseEvent) => {
      const info = this.pointerInfo(e)
      // Try every select-tool candidate, not just activeTool(): line-vertex
      // insertion lives on lineInteraction, a separate instance from the
      // region SelectTool. Each candidate no-ops unless its own selection
      // guard matches, so trying all of them is safe.
      for (const candidate of this.pointerDownCandidates()) {
        candidate.onDoubleClick?.(info, this.toolContext)
      }
    }
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      this.openContextMenu(e)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && this.spaceHeld) {
        this.spaceHeld = false
        this.updateCursor()
      }
    }
    const onResize = () => this.apply()

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onUp)
    canvas.addEventListener('dblclick', onDoubleClick)
    canvas.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    this.app.renderer.on('resize', onResize)
    this.disposers.push(() => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onUp)
      canvas.removeEventListener('dblclick', onDoubleClick)
      canvas.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', this.onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      this.app.renderer.off('resize', onResize)
    })
  }

  // Class field (not a mount-time closure) so regression tests can drive the
  // exact handler bindInput registers, without a WebGL mount. Escape and
  // Enter must route through activeTool(), not just activeDrag: a multi-click
  // tool (line) is mid-gesture *between* clicks, when nothing is activeDrag.
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.cancelActive()
      this.activeTool().cancel(this.toolContext)
      this.renderVectors()
      return
    }
    if (e.key === 'Enter' && !isTypingTarget(document.activeElement)) {
      // Finish a multi-click gesture (line tool). Tools without one have
      // no finish() and the keypress falls through untouched.
      this.activeTool().finish?.(this.toolContext)
      this.renderVectors()
      return
    }
    if (e.code === 'Space' && !this.spaceHeld && !isTypingTarget(document.activeElement)) {
      e.preventDefault()
      this.spaceHeld = true
      this.updateCursor()
    }
  }

  // Right-click selects the region under the cursor (so the menu acts on it)
  // and reports what actions apply: vertex deletion when on a vertex of the
  // lone selected polygon, z-order/delete when on a region.
  private openContextMenu(e: MouseEvent): void {
    const world = screenToWorld(this.view, { x: e.offsetX, y: e.offsetY })
    const editor = useEditorStore.getState()
    if (!editor.regionsVisible) {
      this.onContextMenu({ x: e.offsetX, y: e.offsetY, regionId: null, vertexIndex: null })
      return
    }
    const project = useProjectStore.getState().project
    const hit = topRegionAt(project.regions, world)
    if (hit && !editor.selectedRegionIds.includes(hit.id)) editor.select([hit.id])
    const selected = useEditorStore.getState().selectedRegionIds
    const regionId = hit?.id ?? (selected.length === 1 ? selected[0] : null)
    this.onContextMenu({
      x: e.offsetX,
      y: e.offsetY,
      regionId,
      vertexIndex: this.vertexAt(world, regionId),
    })
  }

  private vertexAt(world: XY, regionId: string | null): number | null {
    if (!regionId) return null
    const selected = useEditorStore.getState().selectedRegionIds
    if (selected.length !== 1 || selected[0] !== regionId) return null
    const region = useProjectStore.getState().project.regions.find((r) => r.id === regionId)
    if (!region || region.geometry.kind !== 'polygon') return null
    let best: number | null = null
    let bestDist = VERTEX_HIT_PX / this.view.scale
    for (const handle of handlesFor(region.geometry)) {
      if (handle.kind !== 'vertex') continue
      const d = Math.hypot(handle.at.x - world.x, handle.at.y - world.y)
      if (d <= bestDist) {
        bestDist = d
        best = handle.index
      }
    }
    return best
  }

  private renderVectors(): void {
    const editor = useEditorStore.getState()
    if (this.tiles) this.tiles.visible = editor.artworkVisible
    this.underlay?.redraw(
      {
        underlay: useProjectStore.getState().project.underlay ?? null,
        visible: editor.underlayVisible,
        opacity: editor.underlayOpacity,
        locked: editor.underlayLocked,
        selected: editor.underlaySelected,
      },
      this.view.scale,
    )
    this.vectors?.redraw(
      {
        project: useProjectStore.getState().project,
        selectedRegionIds: editor.selectedRegionIds,
        selectedLineIds: editor.selectedLineIds,
        selectedPointIds: editor.selectedPointIds,
        regionsVisible: editor.regionsVisible,
        linesVisible: editor.linesVisible,
        pointsVisible: editor.pointsVisible,
        draft: this.draft,
      },
      this.view.scale,
    )
  }

  private apply(): void {
    this.world.position.set(this.view.tx, this.view.ty)
    this.world.scale.set(this.view.scale)
    this.tiles?.update(
      { ...this.view, scale: this.view.scale * this.tiles.scale.x },
      this.app.screen,
    )
    this.renderVectors()
    this.onReadout(Math.round(this.view.scale * 100), this.tiles?.residentTileCount ?? 0)
  }

  destroy(): void {
    for (const dispose of this.disposers) dispose()
    this.disposers = []
    this.tiles?.destroy()
    this.underlay?.destroy()
    this.app.destroy(true, { children: true })
  }
}
