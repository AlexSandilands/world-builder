import { Application, Container } from 'pixi.js'
import type { Layer, Project } from '../state/types'
import type { Viewport } from './viewportMath'
import { fitToScreen, panBy, zoomAt } from './viewportMath'
import { VectorLayer } from './layers/VectorLayer'
import { SyntheticTileSource } from './tiles/TileSource'
import { TileLayer } from './tiles/TileLayer'

type Readout = (zoomPercent: number, residentTiles: number) => void

// Owns the PixiJS scene graph: one `world` container (the shared coordinate
// system) holding the artwork tile pyramid at the bottom and the semantic
// vector layers above it. Pan/zoom mutate the world transform imperatively so
// pointer input never round-trips through React.
export class CanvasController {
  private app = new Application()
  private world = new Container()
  private tiles: TileLayer | null = null
  private vectors = new VectorLayer()
  private view: Viewport = { tx: 0, ty: 0, scale: 1 }
  private layers: Layer[] = []
  private world_size = { width: 1, height: 1 }
  private dragging = false
  private last = { x: 0, y: 0 }
  private disposers: Array<() => void> = []
  private readonly onReadout: Readout

  constructor(onReadout: Readout) {
    this.onReadout = onReadout
  }

  async mount(parent: HTMLElement, project: Project): Promise<void> {
    await this.app.init({
      resizeTo: parent,
      antialias: true,
      background: 0x0f1116,
      preference: 'webgl',
    })
    parent.appendChild(this.app.canvas)

    const artwork = project.layers.find((l) => l.kind === 'artwork')
    this.tiles = new TileLayer(
      new SyntheticTileSource(
        artwork && artwork.kind === 'artwork'
          ? { width: artwork.width, height: artwork.height, tileSize: artwork.tileSize }
          : { width: project.world.width, height: project.world.height, tileSize: 256 },
      ),
    )
    this.world.addChild(this.tiles)
    this.world.addChild(this.vectors)
    this.app.stage.addChild(this.world)

    this.world_size = project.world
    this.layers = project.layers
    this.bindInput()
    this.fit()
  }

  setLayers(layers: Layer[]): void {
    this.layers = layers
    this.apply()
  }

  fit(): void {
    this.view = fitToScreen(this.world_size, this.app.screen)
    this.apply()
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
      this.dragging = true
      this.last = { x: e.clientX, y: e.clientY }
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!this.dragging) return
      this.view = panBy(this.view, e.clientX - this.last.x, e.clientY - this.last.y)
      this.last = { x: e.clientX, y: e.clientY }
      this.apply()
    }
    const onUp = () => {
      this.dragging = false
    }
    const onResize = () => this.apply()

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onUp)
    this.app.renderer.on('resize', onResize)
    this.disposers.push(() => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onUp)
      this.app.renderer.off('resize', onResize)
    })
  }

  private apply(): void {
    this.world.position.set(this.view.tx, this.view.ty)
    this.world.scale.set(this.view.scale)
    this.tiles?.update(this.view, this.app.screen)
    this.vectors.redraw(this.layers, this.view.scale)
    this.onReadout(Math.round(this.view.scale * 100), this.tiles?.residentTileCount ?? 0)
  }

  destroy(): void {
    for (const dispose of this.disposers) dispose()
    this.disposers = []
    this.tiles?.destroy()
    this.app.destroy(true, { children: true })
  }
}
