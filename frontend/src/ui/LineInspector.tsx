import type { Line } from '../generated/project'
import { deleteSelectedLines } from '../features/lines/actions'
import {
  DEFAULT_LINE_WIDTH,
  LINE_COLORS,
  LINE_TYPES,
  LINE_TYPE_HINTS,
  LINE_TYPE_LABELS,
} from '../features/lines/style'
import { replaceLineCommand } from '../state/commands'
import { useEditorStore } from '../state/editorStore'
import { useProjectStore } from '../state/projectStore'
import { CommitInput } from './CommitInput'
import type { TypeOption } from './TypePicker'
import { TypePicker } from './TypePicker'

// Line types are a fixed schema enum, not vocabulary data (docs/schema/
// project-v1.md), so the picker's options are built here rather than from
// project.vocabulary.
const LINE_TYPE_OPTIONS: TypeOption[] = LINE_TYPES.map((t) => ({
  id: t,
  displayName: LINE_TYPE_LABELS[t],
  promptFragment: LINE_TYPE_HINTS[t],
  maskColor: LINE_COLORS[t],
}))

// Left-hand tagging panel for the selected line(s): type (with structural
// hint preview), stroke width, dashed/solid style, vertex count, delete.
// Mirrors RegionInspector's pattern (docs/design conventions from #17).
export function LineInspector() {
  const project = useProjectStore((s) => s.project)
  const selectedIds = useEditorStore((s) => s.selectedLineIds)
  const locked = useEditorStore((s) => s.linesLocked)
  const selected = project.lines.filter((l) => selectedIds.includes(l.id))

  return (
    <aside className="inspector">
      <div className="panel-section-header">
        <h2>Line</h2>
        {selected.length > 1 && <span className="layer-kind">{selected.length} selected</span>}
      </div>
      {selected.length === 1 && (
        <SingleLine key={selected[0].id} line={selected[0]} locked={locked} />
      )}
      {selected.length > 1 && <MultiLine count={selected.length} locked={locked} />}
    </aside>
  )
}

function SingleLine({ line, locked }: { line: Line; locked: boolean }) {
  const dispatch = useProjectStore((s) => s.dispatch)

  const patch = (p: Partial<Line>) => {
    const cmd = replaceLineCommand(useProjectStore.getState().project, line.id, p)
    if (cmd) dispatch(cmd)
  }

  return (
    <fieldset className="inspector-body" disabled={locked}>
      <div className="field-row">
        <div className="field">
          <span className="field-label">Type</span>
          <TypePicker
            types={LINE_TYPE_OPTIONS}
            value={line.type}
            label="Line type"
            onChange={(typeId) => {
              const type = typeId as Line['type']
              patch({ type })
              // Remember the pick (and its sensible default width) for the
              // next drawn line, mirroring regions' drawType convention.
              useEditorStore.getState().setDrawLineType(type)
              useEditorStore.getState().setDrawLineWidth(DEFAULT_LINE_WIDTH[type])
            }}
          />
        </div>
        <div className="field field-z">
          <span className="field-label">Width</span>
          <CommitInput
            value={String(line.width)}
            aria-label="Line width"
            onCommit={(text) => {
              const width = Number(text)
              if (Number.isFinite(width) && width > 0) patch({ width })
            }}
          />
        </div>
      </div>

      <div className="field">
        <span className="field-label">Style</span>
        <div className="segmented" role="radiogroup" aria-label="Line style">
          {(['solid', 'dashed'] as const).map((style) => (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={(line.style ?? 'solid') === style}
              className={(line.style ?? 'solid') === style ? 'segment active' : 'segment'}
              onClick={() => patch({ style })}
            >
              {style === 'solid' ? 'Solid' : 'Dashed'}
            </button>
          ))}
        </div>
      </div>

      <p className="inspector-hint">{line.points.length} vertices.</p>

      <button type="button" className="danger-button" onClick={deleteSelectedLines}>
        Delete line
      </button>
    </fieldset>
  )
}

function MultiLine({ count, locked }: { count: number; locked: boolean }) {
  return (
    <fieldset className="inspector-body" disabled={locked}>
      <p className="inspector-hint">{count} lines selected.</p>
      <button type="button" className="danger-button" onClick={deleteSelectedLines}>
        Delete {count} lines
      </button>
    </fieldset>
  )
}
