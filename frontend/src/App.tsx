import { CanvasView } from './canvas/CanvasView'
import { LayerPanel } from './ui/LayerPanel'
import { Toolbar } from './ui/Toolbar'

// App shell for the canvas spike: header, layer panel, and the pan/zoom canvas
// with its overlay toolbar. Styled by the #37 design tokens (docs/design/).
function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>World Builder</h1>
        <span className="app-subtitle">canvas spike</span>
      </header>
      <div className="app-body">
        <LayerPanel />
        <main className="canvas-stage">
          <CanvasView />
          <Toolbar />
        </main>
      </div>
    </div>
  )
}

export default App
