import type { PointTypeDef } from '../generated/project'
import { useEditorStore } from '../state/editorStore'
import { useProjectStore } from '../state/projectStore'
import { EyeClosedIcon, EyeIcon, LockIcon, UnlockIcon } from './LayerPanel'

// Points layer group in the Layers panel: show/hide/lock plus a flat list
// (points carry no z, like lines — there is no stacking order to mirror).
export function PointsSection() {
  const project = useProjectStore((s) => s.project)
  const selectedIds = useEditorStore((s) => s.selectedPointIds)
  const visible = useEditorStore((s) => s.pointsVisible)
  const locked = useEditorStore((s) => s.pointsLocked)
  const editor = useEditorStore.getState()

  const typeById = new Map(
    project.vocabulary
      .filter((t): t is PointTypeDef => t.category === 'point')
      .map((t) => [t.id, t]),
  )

  const onRowClick = (id: string, shiftKey: boolean) => {
    if (shiftKey) editor.toggleSelectedPoint(id)
    else editor.selectPoints([id])
  }

  return (
    <div className="layer-group">
      <div className="layer-group-header">
        <button
          type="button"
          className="icon-toggle"
          aria-label={visible ? 'Hide points layer' : 'Show points layer'}
          aria-pressed={visible}
          title="Show/hide points"
          onClick={() => editor.setPointsVisible(!visible)}
        >
          {visible ? <EyeIcon /> : <EyeClosedIcon />}
        </button>
        <button
          type="button"
          className="icon-toggle"
          aria-label={locked ? 'Unlock points layer' : 'Lock points layer'}
          aria-pressed={locked}
          title="Lock/unlock points"
          onClick={() => editor.setPointsLocked(!locked)}
        >
          {locked ? <LockIcon /> : <UnlockIcon />}
        </button>
        <span className="layer-group-name">Points</span>
        <span className="layer-kind">{project.points.length}</span>
      </div>
      <ul>
        {project.points.map((point) => {
          const type = typeById.get(point.type)
          return (
            <li key={point.id}>
              <button
                type="button"
                className={selectedIds.includes(point.id) ? 'layer selected' : 'layer'}
                onClick={(e) => onRowClick(point.id, e.shiftKey)}
              >
                <span className="type-swatch point-swatch" />
                <span className="layer-name">{point.label ?? type?.displayName ?? point.type}</span>
                <span className="layer-kind">{type?.displayName ?? point.type}</span>
              </button>
            </li>
          )
        })}
        {project.points.length === 0 && <li className="layer-empty">No points yet — place one</li>}
      </ul>
    </div>
  )
}
