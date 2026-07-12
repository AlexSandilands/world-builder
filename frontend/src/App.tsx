import { useEffect } from 'react'
import { CanvasView } from './canvas/CanvasView'
import { loadPersistedProject } from './features/project/persistence'
import { Inspector } from './ui/Inspector'
import { LayerPanel } from './ui/LayerPanel'
import { ToolRail } from './ui/ToolRail'
import { Toolbar } from './ui/Toolbar'
import { useEditorHotkeys } from './ui/useEditorHotkeys'

// Authoring shell (mockup: docs/design/mockups/authoring-canvas.png): tool
// rail, layers panel, pan/zoom canvas with overlay toolbar, and the
// selection-routed inspector (region/line/point).
function App() {
  useEditorHotkeys()
  // Load the last-saved project (if any) once on mount; a fresh browser or
  // an unreachable orchestrator just leaves the in-memory default in place.
  useEffect(() => {
    void loadPersistedProject()
  }, [])
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>World Builder</h1>
        <span className="app-subtitle">authoring</span>
      </header>
      <div className="app-body">
        <ToolRail />
        <LayerPanel />
        <main className="canvas-stage">
          <CanvasView />
          <Toolbar />
        </main>
        <Inspector />
      </div>
    </div>
  )
}

export default App
