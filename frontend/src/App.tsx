import { CanvasView } from './canvas/CanvasView'
import { LayerPanel } from './ui/LayerPanel'
import { RegionInspector } from './ui/RegionInspector'
import { ToolRail } from './ui/ToolRail'
import { Toolbar } from './ui/Toolbar'
import { useEditorHotkeys } from './ui/useEditorHotkeys'

// Authoring shell (mockup: docs/design/mockups/authoring-canvas.png): tool
// rail, layers panel, pan/zoom canvas with overlay toolbar, region inspector.
function App() {
  useEditorHotkeys()
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
        <RegionInspector />
      </div>
    </div>
  )
}

export default App
