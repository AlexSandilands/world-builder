import { useProjectStore } from '../state/projectStore'

const KIND_LABEL: Record<string, string> = {
  artwork: 'Artwork',
  region: 'Region',
  line: 'Line',
}

// Layer panel skeleton: lists the project's layers with visibility toggles and
// selection. Wired straight to the project store so it reflects schema-shaped
// state; reordering, grouping and add/remove arrive with the editing issues.
export function LayerPanel() {
  const layers = useProjectStore((s) => s.project.layers)
  const selectedId = useProjectStore((s) => s.selectedLayerId)
  const toggle = useProjectStore((s) => s.toggleLayerVisibility)
  const select = useProjectStore((s) => s.selectLayer)

  return (
    <aside className="layer-panel">
      <h2>Layers</h2>
      <ul>
        {layers.map((layer) => (
          <li
            key={layer.id}
            className={layer.id === selectedId ? 'layer selected' : 'layer'}
            onClick={() => select(layer.id)}
          >
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={(e) => {
                e.stopPropagation()
                toggle(layer.id)
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Toggle ${layer.name}`}
            />
            <span className="layer-name">{layer.name}</span>
            <span className="layer-kind">{KIND_LABEL[layer.kind]}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
