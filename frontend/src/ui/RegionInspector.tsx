import { useState } from 'react'
import type { Region, RegionTypeDef } from '../generated/project'
import { deleteSelectedRegions, reorderSelectedRegions } from '../features/regions/actions'
import { isBelowMinSize } from '../features/regions/minSize'
import { MIN_REGION_SIDE_OUTPUT_PX } from '../features/regions/minSize'
import { replaceRegionCommand } from '../state/commands'
import { useEditorStore } from '../state/editorStore'
import { useProjectStore } from '../state/projectStore'
import { TypePicker } from './TypePicker'

// Right-hand tagging panel for the selected region(s): display label, type
// (with default-prompt preview), custom prompt with extend/override mode,
// z-order controls, min-size warning, delete.
export function RegionInspector() {
  const project = useProjectStore((s) => s.project)
  const selectedIds = useEditorStore((s) => s.selectedRegionIds)
  const locked = useEditorStore((s) => s.regionsLocked)

  const regionTypes = project.vocabulary.filter((t): t is RegionTypeDef => t.category === 'region')
  const selected = project.regions.filter((r) => selectedIds.includes(r.id))

  return (
    <aside className="inspector">
      <div className="panel-section-header">
        <h2>Region</h2>
        {selected.length > 1 && <span className="layer-kind">{selected.length} selected</span>}
      </div>
      {selected.length === 0 && (
        <p className="inspector-hint">
          Select a region, or draw one with the lasso, rectangle or ellipse tool.
        </p>
      )}
      {selected.length === 1 && (
        <SingleRegion
          key={selected[0].id}
          region={selected[0]}
          regionTypes={regionTypes}
          locked={locked}
        />
      )}
      {selected.length > 1 && <MultiRegion count={selected.length} locked={locked} />}
    </aside>
  )
}

function SingleRegion({
  region,
  regionTypes,
  locked,
}: {
  region: Region
  regionTypes: RegionTypeDef[]
  locked: boolean
}) {
  const project = useProjectStore((s) => s.project)
  const dispatch = useProjectStore((s) => s.dispatch)
  const type = regionTypes.find((t) => t.id === region.type)
  const belowMin = isBelowMinSize(region.geometry, project.global)
  const [promptMode, setPromptMode] = useState(region.prompt?.mode ?? 'extend')
  // Resync the local mode when the document's prompt changes (undo, external
  // edit) — adjust-during-render, not an effect.
  const [lastPrompt, setLastPrompt] = useState(region.prompt)
  if (region.prompt !== lastPrompt) {
    setLastPrompt(region.prompt)
    if (region.prompt) setPromptMode(region.prompt.mode)
  }

  const patch = (p: Partial<Region>) => {
    const cmd = replaceRegionCommand(useProjectStore.getState().project, region.id, p)
    if (cmd) dispatch(cmd)
  }

  const commitPrompt = (text: string, mode: 'extend' | 'override') => {
    const trimmed = text.trim()
    const next = trimmed ? { mode, text: trimmed } : undefined
    if (JSON.stringify(next) !== JSON.stringify(region.prompt)) patch({ prompt: next })
  }

  return (
    <fieldset className="inspector-body" disabled={locked}>
      <label className="field">
        <span className="field-label">Name</span>
        <CommitInput
          value={region.label ?? ''}
          placeholder={type?.displayName ?? region.type}
          onCommit={(text) => patch({ label: text.trim() ? text.trim() : undefined })}
        />
      </label>

      <div className="field-row">
        <div className="field">
          <span className="field-label">Type</span>
          <TypePicker
            types={regionTypes}
            value={region.type}
            onChange={(typeId) => {
              patch({ type: typeId })
              // Remember the pick: newly drawn regions default to it.
              useEditorStore.getState().setDrawType(typeId)
            }}
          />
        </div>
        <div className="field field-z">
          <span className="field-label">Z-order</span>
          <div className="z-controls">
            <CommitInput
              value={String(region.z)}
              aria-label="Z-order value"
              onCommit={(text) => {
                // Schema v1 requires integer z; round so a typed 1.5 can't
                // serialise an invalid document.
                const z = Number(text)
                if (Number.isFinite(z)) patch({ z: Math.round(z) })
              }}
            />
            <button
              type="button"
              title="Raise (])"
              aria-label="Raise"
              onClick={() => reorderSelectedRegions('raise')}
            >
              ▲
            </button>
            <button
              type="button"
              title="Lower ([)"
              aria-label="Lower"
              onClick={() => reorderSelectedRegions('lower')}
            >
              ▼
            </button>
          </div>
        </div>
      </div>

      <div className="field">
        <span className="field-label">Type prompt</span>
        <p className="prompt-preview">{type?.promptFragment ?? '—'}</p>
      </div>

      <div className="field">
        <div className="field-label-row">
          <span className="field-label">Custom prompt</span>
          <div className="segmented" role="radiogroup" aria-label="Prompt mode">
            {(['extend', 'override'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={promptMode === mode}
                className={promptMode === mode ? 'segment active' : 'segment'}
                onClick={() => {
                  setPromptMode(mode)
                  if (region.prompt) commitPrompt(region.prompt.text, mode)
                }}
              >
                {mode === 'extend' ? 'Extend' : 'Override'}
              </button>
            ))}
          </div>
        </div>
        <CommitInput
          multiline
          value={region.prompt?.text ?? ''}
          placeholder={
            promptMode === 'extend'
              ? 'Appended after the type prompt…'
              : 'Replaces the type prompt…'
          }
          onCommit={(text) => commitPrompt(text, promptMode)}
        />
      </div>

      {belowMin && (
        <p className="inspector-warning" role="alert">
          Below minimum render size (&lt;{MIN_REGION_SIDE_OUTPUT_PX}px² at output resolution) — this
          region is too small to render reliably.
        </p>
      )}

      <button type="button" className="danger-button" onClick={deleteSelectedRegions}>
        Delete region
      </button>
    </fieldset>
  )
}

function MultiRegion({ count, locked }: { count: number; locked: boolean }) {
  return (
    <fieldset className="inspector-body" disabled={locked}>
      <p className="inspector-hint">{count} regions selected.</p>
      <div className="z-controls">
        <button type="button" onClick={() => reorderSelectedRegions('raise')}>
          ▲ Raise
        </button>
        <button type="button" onClick={() => reorderSelectedRegions('lower')}>
          ▼ Lower
        </button>
      </div>
      <button type="button" className="danger-button" onClick={deleteSelectedRegions}>
        Delete {count} regions
      </button>
    </fieldset>
  )
}

// Text input that keeps local state while typing and commits one undoable
// command on blur/Enter — keystrokes must not each become an undo step.
function CommitInput({
  value,
  placeholder,
  multiline = false,
  onCommit,
  'aria-label': ariaLabel,
}: {
  value: string
  placeholder?: string
  multiline?: boolean
  onCommit: (text: string) => void
  'aria-label'?: string
}) {
  const [text, setText] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }
  const commit = () => {
    if (text !== value) onCommit(text)
  }
  if (multiline) {
    return (
      <textarea
        value={text}
        rows={3}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
    )
  }
  return (
    <input
      type="text"
      value={text}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
