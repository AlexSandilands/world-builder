import { useRef, useState } from 'react'
import { importUnderlay } from '../features/underlay/import'
import { replaceUnderlayCommand } from '../state/commands'
import { useEditorStore } from '../state/editorStore'
import { useProjectStore } from '../state/projectStore'
import { EyeClosedIcon, EyeIcon, LockIcon, UnlockIcon } from './LayerPanel'

const ACCEPT = 'image/png,image/jpeg,image/webp'

// The tracing-underlay layer: import (file picker), show/hide, lock/unlock,
// opacity, rotation and remove. Placement (move/resize) happens by dragging
// directly on the canvas with the select tool (features/underlay/interaction.ts)
// once unlocked — this panel is for the controls that aren't a drag gesture.
export function UnderlaySection() {
  const underlay = useProjectStore((s) => s.project.underlay)
  const dispatch = useProjectStore((s) => s.dispatch)
  const visible = useEditorStore((s) => s.underlayVisible)
  const locked = useEditorStore((s) => s.underlayLocked)
  const opacity = useEditorStore((s) => s.underlayOpacity)
  const editor = useEditorStore.getState()
  const fileInput = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const onFile = async (file: File | null | undefined) => {
    if (!file) return
    setImporting(true)
    try {
      await importUnderlay(file)
    } finally {
      setImporting(false)
    }
  }

  const setRotation = (degrees: number) => {
    const project = useProjectStore.getState().project
    const cmd = replaceUnderlayCommand(project, { rotation: degrees })
    if (cmd) dispatch(cmd)
  }

  const remove = () => {
    const project = useProjectStore.getState().project
    if (!project.underlay) return
    dispatch({ kind: 'underlay/set', before: project.underlay, after: undefined })
    editor.setUnderlaySelected(false)
  }

  return (
    <div className="layer-group">
      <div className="layer-group-header">
        <button
          type="button"
          className="icon-toggle"
          aria-label={visible ? 'Hide underlay layer' : 'Show underlay layer'}
          aria-pressed={visible}
          title="Show/hide underlay"
          onClick={() => editor.setUnderlayVisible(!visible)}
        >
          {visible ? <EyeIcon /> : <EyeClosedIcon />}
        </button>
        <button
          type="button"
          className="icon-toggle"
          aria-label={locked ? 'Unlock underlay layer' : 'Lock underlay layer'}
          aria-pressed={locked}
          title="Lock/unlock underlay"
          disabled={!underlay}
          onClick={() => editor.setUnderlayLocked(!locked)}
        >
          {locked ? <LockIcon /> : <UnlockIcon />}
        </button>
        <span className="layer-group-name">Underlay</span>
        <span className="layer-kind">{underlay ? 'reference' : 'none'}</span>
      </div>

      <div className="underlay-controls">
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="visually-hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={importing}>
          {importing ? 'Importing…' : underlay ? 'Replace image…' : 'Import image…'}
        </button>

        {underlay && (
          <>
            <label className="field">
              <span className="field-label">Opacity ({Math.round(opacity * 100)}%)</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={opacity}
                aria-label="Underlay opacity"
                onChange={(e) => editor.setUnderlayOpacity(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span className="field-label">Rotation (°)</span>
              <input
                type="number"
                value={underlay.rotation ?? 0}
                aria-label="Underlay rotation in degrees"
                disabled={locked}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isFinite(n)) setRotation(n)
                }}
              />
            </label>
            <button type="button" className="danger-button" disabled={locked} onClick={remove}>
              Remove underlay
            </button>
          </>
        )}
      </div>
    </div>
  )
}
