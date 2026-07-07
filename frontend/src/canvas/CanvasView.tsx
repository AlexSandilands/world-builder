import { useEffect, useRef } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useViewportStore } from '../state/viewportStore'
import { CanvasController } from './CanvasController'

// Thin React wrapper: mounts the imperative Pixi controller into a div and
// bridges the zustand stores to it. All rendering happens in the controller.
export function CanvasView() {
  const hostRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<CanvasController | null>(null)
  const layers = useProjectStore((s) => s.project.layers)
  const fitNonce = useViewportStore((s) => s.fitNonce)

  // Mount exactly once: store mutations (layer toggles replace the project
  // object identity) must flow through setLayers, never tear down the WebGL
  // context or reset the viewport. Loading a different project will need an
  // explicit remount path when that feature lands.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    const controller = new CanvasController((zoom, tiles) =>
      useViewportStore.getState().setReadout(zoom, tiles),
    )
    // WebGL is unavailable under jsdom; a failed init must not crash the app
    // shell (unit tests render this component headless).
    controller
      .mount(host, useProjectStore.getState().project)
      .then(() => {
        if (cancelled) {
          controller.destroy()
          return
        }
        controllerRef.current = controller
        // Catch up on toggles that happened while init was in flight.
        controller.setLayers(useProjectStore.getState().project.layers)
      })
      .catch(() => {})

    return () => {
      cancelled = true
      controllerRef.current?.destroy()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    controllerRef.current?.setLayers(layers)
  }, [layers])

  useEffect(() => {
    if (fitNonce > 0) controllerRef.current?.fit()
  }, [fitNonce])

  return <div ref={hostRef} className="canvas-host" data-testid="canvas-host" />
}
