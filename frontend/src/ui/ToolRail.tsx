import type { ReactNode } from 'react'
import type { ToolId } from '../state/editorStore'
import { useEditorStore } from '../state/editorStore'
import { useHistoryStore } from '../state/historyStore'
import { useProjectStore } from '../state/projectStore'

// Icons follow the design language: single-weight 1.5px strokes, no fills.
const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const TOOL_ICONS: Record<ToolId, ReactNode> = {
  select: <path {...STROKE} d="M5 3l8 7-4.4.6L6 15z" />,
  hand: (
    <path
      {...STROKE}
      d="M6.4 9V5.4a0.8 0.8 0 0 1 1.6 0V8M8 8V4.4a0.8 0.8 0 0 1 1.6 0V8M9.6 8V5a0.8 0.8 0 0 1 1.6 0V10.5c0 2-1.5 3.7-3.7 3.7-1 0-1.9-.3-2.6-1L4 10.7a0.9 0.9 0 0 1 1.3-1.3L6.4 10.6"
    />
  ),
  lasso: <path {...STROKE} d="M9 3.5l5 2.5.5 5-4 4.5L5 14l-1-6z" />,
  rect: <rect {...STROKE} x="3.5" y="4.5" width="11" height="9" />,
  ellipse: <ellipse {...STROKE} cx="9" cy="9" rx="5.5" ry="4.5" />,
}

const TOOLS: { id: ToolId; label: string; hotkey: string }[] = [
  { id: 'select', label: 'Select', hotkey: 'V' },
  { id: 'hand', label: 'Hand (pan)', hotkey: 'H' },
  { id: 'lasso', label: 'Lasso polygon', hotkey: 'L' },
  { id: 'rect', label: 'Rectangle', hotkey: 'R' },
  { id: 'ellipse', label: 'Ellipse', hotkey: 'E' },
]

export function ToolRail() {
  const tool = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)
  const canUndo = useHistoryStore((s) => s.past.length > 0)
  const canRedo = useHistoryStore((s) => s.future.length > 0)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)

  return (
    <nav className="tool-rail" aria-label="Tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tool === t.id ? 'tool active' : 'tool'}
          title={`${t.label} (${t.hotkey})`}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          onClick={() => setTool(t.id)}
        >
          <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
            {TOOL_ICONS[t.id]}
          </svg>
        </button>
      ))}
      <div className="tool-rail-gap" />
      <button
        type="button"
        className="tool"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={undo}
      >
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
          <path {...STROKE} d="M7 4L3.5 7.5 7 11" />
          <path {...STROKE} d="M3.5 7.5H11a3.5 3.5 0 0 1 0 7H8" />
        </svg>
      </button>
      <button
        type="button"
        className="tool"
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={redo}
      >
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
          <path {...STROKE} d="M11 4l3.5 3.5L11 11" />
          <path {...STROKE} d="M14.5 7.5H7a3.5 3.5 0 0 0 0 7h3" />
        </svg>
      </button>
    </nav>
  )
}
