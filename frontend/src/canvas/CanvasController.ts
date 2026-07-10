import { Application, Container } from 'pixi.js'
import type { ToolId } from '../state/editorStore'
import { useEditorStore } from '../state/editorStore'
import { useProjectStore } from '../state/projectStore'
import type { Viewport } from './viewportMath'
import { fitToScreen, panBy, screenToWorld, zoomAt } from './viewportMath'
import { VectorLayer } from './layers/VectorLayer'
import { SyntheticTileSource } from './tiles/TileSource'
import { TileLayer } from './tiles/TileLayer'
import { readOverlayTheme } from './overlayTheme'
import { BoxTool, LassoTool } from './tools/drawTools'
import { SelectTool } from './tools/selectTool'
import type { Draft, PointerInfo, Tool, ToolContext } from './tools/toolTypes'

type Readout = (zoomPercent: number, residentTiles: number) => void

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
  private vectors: VectorLayer | null = null
  private view: Viewport = { tx: 0, ty: 0, scale: 1 }
  private worldSize = { width: 1, height: 1 }
  private draft: Draft | null = null
  private panning = false
  private toolDragging = false
  private last = { x: 0, y: 0 }
  private disposers: Array<() => void> = []
  private readonly onReadout: Readout
  private readonly tools: Record<ToolId, Tool> = {
    select: new SelectTool(),
    lasso: new LassoTool(),
    rect: new BoxTool('rect'),
    ellipse: new BoxTool('ellipse'),
  }
  private readonly toolContext: ToolContext = {
    scale: () => this.view.scale,
    setDraft: (draft) => {
      this.draft = draft
      this.renderVectors()
    },
  }

  constructor(onReadout: Readout) {
    this.onReadout = onReadout
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
    this.vectors = new VectorLayer(readOverlayTheme())
    this.world.addChild(this.tiles)
    this.world.addChild(this.vectors)
    this.app.stage.addChild(this.world)

    this.bindInput()
    this.disposers.push(useProjectStore.subscribe(() => this.renderVectors()))
    this.disposers.push(
      useEditorStore.subscribe((state, prev) => {
        if (state.tool !== prev.tool) this.cancelActive(prev.tool)
        this.renderVectors()
      }),
    )
    this.fit()
  }

  fit(): void {
    this.view = fitToScreen(this.worldSize, this.app.screen)
    this.apply()
  }

  private activeTool(): Tool {
    return this.tools[useEditorStore.getState().tool]
  }

  private cancelActive(tool: ToolId): void {
    this.toolDragging = false
    this.tools[tool].cancel(this.toolContext)
  }

  private pointerInfo(e: PointerEvent | MouseEvent): PointerInfo {
    return {
      world: screenToWorld(this.view, { x: e.offsetX, y: e.offsetY }),
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    }
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
      canvas.setPointerCapture(e.pointerId)
      this.last = { x: e.clientX, y: e.clientY }
      // Middle/right button always pans; left offers the event to the tool.
      if (e.button === 0 && this.activeTool().onDown(this.pointerInfo(e), this.toolContext)) {
        this.toolDragging = true
        this.renderVectors()
        return
      }
      this.panning = true
    }
    const onMove = (e: PointerEvent) => {
      if (this.toolDragging) {
        this.activeTool().onMove(this.pointerInfo(e), this.toolContext)
        return
      }
      if (!this.panning) return
      this.view = panBy(this.view, e.clientX - this.last.x, e.clientY - this.last.y)
      this.last = { x: e.clientX, y: e.clientY }
      this.apply()
    }
    const onUp = (e: PointerEvent) => {
      if (this.toolDragging) {
        this.toolDragging = false
        this.activeTool().onUp(this.pointerInfo(e), this.toolContext)
        this.renderVectors()
      }
      this.panning = false
    }
    const onDoubleClick = (e: MouseEvent) => {
      this.activeTool().onDoubleClick?.(this.pointerInfo(e), this.toolContext)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      this.cancelActive(useEditorStore.getState().tool)
      this.renderVectors()
    }
    const onResize = () => this.apply()

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onUp)
    canvas.addEventListener('dblclick', onDoubleClick)
    window.addEventListener('keydown', onKeyDown)
    this.app.renderer.on('resize', onResize)
    this.disposers.push(() => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onUp)
      canvas.removeEventListener('dblclick', onDoubleClick)
      window.removeEventListener('keydown', onKeyDown)
      this.app.renderer.off('resize', onResize)
    })
  }

  private renderVectors(): void {
    const editor = useEditorStore.getState()
    if (this.tiles) this.tiles.visible = editor.artworkVisible
    this.vectors?.redraw(
      {
        project: useProjectStore.getState().project,
        selectedRegionIds: editor.selectedRegionIds,
        regionsVisible: editor.regionsVisible,
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
    this.app.destroy(true, { children: true })
  }
}
