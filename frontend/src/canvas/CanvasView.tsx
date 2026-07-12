import { useEffect, useRef, useState } from 'react'
import { importUnderlay } from '../features/underlay/import'
import { useEditorStore } from '../state/editorStore'
import { useViewportStore } from '../state/viewportStore'
import { CanvasContextMenu } from '../ui/CanvasContextMenu'
import type { ContextMenuRequest } from './CanvasController'
import { CanvasController } from './CanvasController'

// Thin React wrapper: mounts the imperative Pixi controller into a div. The
// controller subscribes to the project/editor stores itself, so document and
// selection changes never remount it (a remount tears down the WebGL context
// and resets the viewport).
export function CanvasView() {
  const hostRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<CanvasController | null>(null)
  const fitNonce = useViewportStore((s) => s.fitNonce)
  const tool = useEditorStore((s) => s.tool)
  const [menu, setMenu] = useState<ContextMenuRequest | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    const controller = new CanvasController(
      (zoom, tiles) => useViewportStore.getState().setReadout(zoom, tiles),
      (request) => setMenu(request),
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

  return (
    <>
      <div
        ref={hostRef}
        className="canvas-host"
        data-testid="canvas-host"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file) void importUnderlay(file)
        }}
      />
      {tool === 'line' && (
        // Multi-click gestures need their exit spelled out (PR #59 round 1:
        // completion was undiscoverable).
        <div className="canvas-hint" role="status">
          Click to place vertices — double-click or Enter finishes, Esc cancels
        </div>
      )}
      {menu && <CanvasContextMenu request={menu} onClose={() => setMenu(null)} />}
    </>
  )
}
