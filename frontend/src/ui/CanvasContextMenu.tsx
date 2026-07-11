import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ContextMenuRequest } from '../canvas/CanvasController'
import {
  deleteRegionVertex,
  deleteSelectedRegions,
  reorderSelectedRegions,
} from '../features/regions/actions'
import { useEditorStore } from '../state/editorStore'

type MenuItem = { label: string; run: () => void; danger?: boolean }

// Right-click menu over the canvas. Items are derived from the hit the
// controller reported: vertex deletion when on a vertex, z-order and delete
// when on a region. All actions route through the shared command-backed
// helpers, so each is a single undo step.
export function CanvasContextMenu({
  request,
  onClose,
}: {
  request: ContextMenuRequest
  onClose: () => void
}) {
  const locked = useEditorStore((s) => s.regionsLocked)
  const ref = useRef<HTMLUListElement>(null)
  const [pos, setPos] = useState({ left: request.x, top: request.y })

  // Keep the menu inside the canvas stage (which clips overflow) when it opens
  // near an edge. Runs before paint, so there is no visible jump.
  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return
    const pad = 4
    const left = Math.max(pad, Math.min(request.x, parent.clientWidth - el.offsetWidth - pad))
    const top = Math.max(pad, Math.min(request.y, parent.clientHeight - el.offsetHeight - pad))
    setPos({ left, top })
  }, [request])

  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Any pointer press elsewhere, wheel, or blur dismisses the menu.
    window.addEventListener('pointerdown', close)
    window.addEventListener('wheel', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('wheel', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const items: MenuItem[] = []
  if (!locked) {
    if (request.regionId && request.vertexIndex !== null) {
      const { regionId, vertexIndex } = request
      items.push({ label: 'Delete vertex', run: () => deleteRegionVertex(regionId, vertexIndex) })
    }
    if (request.regionId) {
      items.push({ label: 'Bring forward', run: () => reorderSelectedRegions('raise') })
      items.push({ label: 'Send backward', run: () => reorderSelectedRegions('lower') })
      items.push({ label: 'Delete region', run: deleteSelectedRegions, danger: true })
    }
  }
  if (items.length === 0) return null

  return (
    <ul
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      // The menu sits inside the canvas; keep its own press from re-closing it.
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <li key={item.label} role="none">
          <button
            type="button"
            role="menuitem"
            className={item.danger ? 'context-menu-item danger' : 'context-menu-item'}
            onClick={() => {
              item.run()
              onClose()
            }}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
