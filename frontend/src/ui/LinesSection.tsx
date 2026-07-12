import { LINE_COLORS, LINE_TYPE_LABELS } from '../features/lines/style'
import { useEditorStore } from '../state/editorStore'
import { useProjectStore } from '../state/projectStore'
import { EyeClosedIcon, EyeIcon, LockIcon, UnlockIcon } from './LayerPanel'

// Lines layer group in the Layers panel: show/hide/lock plus a flat list
// (lines carry no z — docs/schema/project-v1.md — so there is no stacking
// order to mirror, unlike Regions).
export function LinesSection() {
  const project = useProjectStore((s) => s.project)
  const selectedIds = useEditorStore((s) => s.selectedLineIds)
  const visible = useEditorStore((s) => s.linesVisible)
  const locked = useEditorStore((s) => s.linesLocked)
  const editor = useEditorStore.getState()

  const onRowClick = (id: string, shiftKey: boolean) => {
    if (shiftKey) editor.toggleSelectedLine(id)
    else editor.selectLines([id])
  }

  return (
    <div className="layer-group">
      <div className="layer-group-header">
        <button
          type="button"
          className="icon-toggle"
          aria-label={visible ? 'Hide lines layer' : 'Show lines layer'}
          aria-pressed={visible}
          title="Show/hide lines"
          onClick={() => editor.setLinesVisible(!visible)}
        >
          {visible ? <EyeIcon /> : <EyeClosedIcon />}
        </button>
        <button
          type="button"
          className="icon-toggle"
          aria-label={locked ? 'Unlock lines layer' : 'Lock lines layer'}
          aria-pressed={locked}
          title="Lock/unlock lines"
          onClick={() => editor.setLinesLocked(!locked)}
        >
          {locked ? <LockIcon /> : <UnlockIcon />}
        </button>
        <span className="layer-group-name">Lines</span>
        <span className="layer-kind">{project.lines.length}</span>
      </div>
      <ul>
        {project.lines.map((line) => (
          <li key={line.id}>
            <button
              type="button"
              className={selectedIds.includes(line.id) ? 'layer selected' : 'layer'}
              onClick={(e) => onRowClick(line.id, e.shiftKey)}
            >
              <span className="type-swatch" style={{ background: LINE_COLORS[line.type] }} />
              <span className="layer-name">{LINE_TYPE_LABELS[line.type]}</span>
              <span className="layer-kind">{line.points.length}pt</span>
            </button>
          </li>
        ))}
        {project.lines.length === 0 && <li className="layer-empty">No lines yet — draw one</li>}
      </ul>
    </div>
  )
}
