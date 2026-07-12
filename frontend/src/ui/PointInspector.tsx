import type { Point, PointTypeDef } from '../generated/project'
import { deleteSelectedPoints } from '../features/points/actions'
import { replacePointCommand } from '../state/commands'
import { useEditorStore } from '../state/editorStore'
import { useProjectStore } from '../state/projectStore'
import { CommitInput } from './CommitInput'
import { TypePicker } from './TypePicker'

const SIZE_HINTS = ['small', 'medium', 'large'] as const

// Right-hand tagging panel for the selected point(s): display label, type
// (with default-prompt preview), footprint size hint, delete. Mirrors
// RegionInspector's pattern (docs/design conventions from #17); drag-to-move
// happens on the canvas (features/points/interaction.ts), not here.
export function PointInspector() {
  const project = useProjectStore((s) => s.project)
  const selectedIds = useEditorStore((s) => s.selectedPointIds)
  const locked = useEditorStore((s) => s.pointsLocked)

  const pointTypes = project.vocabulary.filter((t): t is PointTypeDef => t.category === 'point')
  const selected = project.points.filter((p) => selectedIds.includes(p.id))

  return (
    <aside className="inspector">
      <div className="panel-section-header">
        <h2>Point</h2>
        {selected.length > 1 && <span className="layer-kind">{selected.length} selected</span>}
      </div>
      {selected.length === 1 && (
        <SinglePoint
          key={selected[0].id}
          point={selected[0]}
          pointTypes={pointTypes}
          locked={locked}
        />
      )}
      {selected.length > 1 && <MultiPoint count={selected.length} locked={locked} />}
    </aside>
  )
}

function SinglePoint({
  point,
  pointTypes,
  locked,
}: {
  point: Point
  pointTypes: PointTypeDef[]
  locked: boolean
}) {
  const dispatch = useProjectStore((s) => s.dispatch)
  const type = pointTypes.find((t) => t.id === point.type)

  const patch = (p: Partial<Point>) => {
    const cmd = replacePointCommand(useProjectStore.getState().project, point.id, p)
    if (cmd) dispatch(cmd)
  }

  return (
    <fieldset className="inspector-body" disabled={locked}>
      <label className="field">
        <span className="field-label">Name</span>
        <CommitInput
          value={point.label ?? ''}
          placeholder={type?.displayName ?? point.type}
          onCommit={(text) => patch({ label: text.trim() ? text.trim() : undefined })}
        />
      </label>

      <div className="field">
        <span className="field-label">Type</span>
        <TypePicker
          types={pointTypes}
          value={point.type}
          label="Point type"
          onChange={(typeId) => {
            patch({ type: typeId })
            useEditorStore.getState().setDrawPointType(typeId)
          }}
        />
      </div>

      <div className="field">
        <span className="field-label">Type prompt</span>
        <p className="prompt-preview">{type?.promptFragment ?? '—'}</p>
      </div>

      <div className="field">
        <span className="field-label">Footprint size</span>
        <div className="segmented" role="radiogroup" aria-label="Point size">
          {SIZE_HINTS.map((size) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={(point.sizeHint ?? 'medium') === size}
              className={(point.sizeHint ?? 'medium') === size ? 'segment active' : 'segment'}
              onClick={() => patch({ sizeHint: size })}
            >
              {size[0].toUpperCase() + size.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="danger-button" onClick={deleteSelectedPoints}>
        Delete point
      </button>
    </fieldset>
  )
}

function MultiPoint({ count, locked }: { count: number; locked: boolean }) {
  return (
    <fieldset className="inspector-body" disabled={locked}>
      <p className="inspector-hint">{count} points selected.</p>
      <button type="button" className="danger-button" onClick={deleteSelectedPoints}>
        Delete {count} points
      </button>
    </fieldset>
  )
}
