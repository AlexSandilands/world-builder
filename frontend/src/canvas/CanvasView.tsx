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
  const project = useProjectStore((s) => s.project)
  const fitNonce = useViewportStore((s) => s.fitNonce)

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
        if (cancelled) controller.destroy()
        else controllerRef.current = controller
      })
      .catch(() => {})

    return () => {
      cancelled = true
      controllerRef.current?.destroy()
      controllerRef.current = null
    }
  }, [project])

  useEffect(() => {
    controllerRef.current?.setLayers(layers)
  }, [layers])

  useEffect(() => {
    if (fitNonce > 0) controllerRef.current?.fit()
  }, [fitNonce])

  return <div ref={hostRef} className="canvas-host" data-testid="canvas-host" />
}
