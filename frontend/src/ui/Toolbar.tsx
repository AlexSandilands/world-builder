import { useState } from 'react'
import { saveProject } from '../features/project/persistence'
import { useProjectStore } from '../state/projectStore'
import { useViewportStore } from '../state/viewportStore'

// Canvas overlay: project name plus a live zoom / resident-tile readout. The
// tile count makes the deep-zoom invariant visible — it stays small (only the
// viewport's worth of tiles) even though the artwork is 16k².
export function Toolbar() {
  const name = useProjectStore((s) => s.project.meta.name)
  const zoom = useViewportStore((s) => s.zoomPercent)
  const residentTiles = useViewportStore((s) => s.residentTiles)
  const requestFit = useViewportStore((s) => s.requestFit)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const onSave = async () => {
    setSaveState('saving')
    try {
      await saveProject()
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  return (
    <div className="toolbar">
      <span className="toolbar-title">{name}</span>
      <span className="toolbar-readout">{zoom}%</span>
      <span className="toolbar-readout">{residentTiles} tiles</span>
      <button type="button" onClick={requestFit}>
        Fit
      </button>
      <button type="button" onClick={() => void onSave()} title="Save (Ctrl/Cmd+S)">
        {saveState === 'saving' ? 'Saving…' : 'Save'}
      </button>
      {saveState === 'saved' && <span className="toolbar-readout">Saved</span>}
      {saveState === 'error' && <span className="toolbar-readout">Save failed</span>}
    </div>
  )
}
