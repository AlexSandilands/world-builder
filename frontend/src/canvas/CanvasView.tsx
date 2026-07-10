import { useEffect, useRef } from 'react'
import { useViewportStore } from '../state/viewportStore'
import { CanvasController } from './CanvasController'

// Thin React wrapper: mounts the imperative Pixi controller into a div. The
// controller subscribes to the project/editor stores itself, so document and
// selection changes never remount it (a remount tears down the WebGL context
// and resets the viewport).
export function CanvasView() {
  const hostRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<CanvasController | null>(null)
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
      .mount(host)
      .then(() => {
        if (cancelled) {
          controller.destroy()
          return
        }
        controllerRef.current = controller
      })
      .catch(() => {})

    return () => {
      cancelled = true
      controllerRef.current?.destroy()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (fitNonce > 0) controllerRef.current?.fit()
  }, [fitNonce])

  return <div ref={hostRef} className="canvas-host" data-testid="canvas-host" />
}
