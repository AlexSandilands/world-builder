import { isBelowMinSize } from '../features/regions/minSize'
import { stackingOrder } from '../state/commands'
import { useEditorStore } from '../state/editorStore'
import { useProjectStore } from '../state/projectStore'
import { UnderlaySection } from './UnderlaySection'

// Layers panel: the regions layer (show/hide/lock) with its regions listed
// top-of-stack first, plus the artwork layer's visibility. Row order mirrors
// compiler stacking so raise/lower reads directly here.
export function LayerPanel() {
  const project = useProjectStore((s) => s.project)
  const selectedIds = useEditorStore((s) => s.selectedRegionIds)
  const regionsVisible = useEditorStore((s) => s.regionsVisible)
  const regionsLocked = useEditorStore((s) => s.regionsLocked)
  const artworkVisible = useEditorStore((s) => s.artworkVisible)
  const editor = useEditorStore.getState()

  const typeById = new Map(project.vocabulary.map((t) => [t.id, t]))
  const topFirst = stackingOrder(project.regions).reverse()

  const onRowClick = (id: string, shiftKey: boolean) => {
    if (shiftKey) editor.toggleSelected(id)
    else editor.select([id])
  }

  return (
    <aside className="layer-panel">
      <div className="panel-section-header">
        <h2>Layers</h2>
      </div>

      <div className="layer-group">
        <div className="layer-group-header">
          <button
            type="button"
            className="icon-toggle"
            aria-label={regionsVisible ? 'Hide regions layer' : 'Show regions layer'}
            aria-pressed={regionsVisible}
            title="Show/hide regions"
            onClick={() => editor.setRegionsVisible(!regionsVisible)}
          >
            {regionsVisible ? <EyeIcon /> : <EyeClosedIcon />}
          </button>
          <button
            type="button"
            className="icon-toggle"
            aria-label={regionsLocked ? 'Unlock regions layer' : 'Lock regions layer'}
            aria-pressed={regionsLocked}
            title="Lock/unlock regions"
            onClick={() => editor.setRegionsLocked(!regionsLocked)}
          >
            {regionsLocked ? <LockIcon /> : <UnlockIcon />}
          </button>
          <span className="layer-group-name">Regions</span>
          <span className="layer-kind">{project.regions.length}</span>
        </div>
        <ul>
          {topFirst.map((region) => {
            const type = typeById.get(region.type)
            const warning = isBelowMinSize(region.geometry, project.global)
            return (
              <li key={region.id}>
                <button
                  type="button"
                  className={selectedIds.includes(region.id) ? 'layer selected' : 'layer'}
                  onClick={(e) => onRowClick(region.id, e.shiftKey)}
                >
                  <span
                    className="type-swatch"
                    style={{
                      background: type && type.category === 'region' ? type.maskColor : '#888',
                    }}
                  />
                  <span className="layer-name">
                    {region.label ?? type?.displayName ?? region.type}
                  </span>
                  {warning && <span className="warning-dot" title="Below minimum render size" />}
                  <span className="layer-kind">{type?.displayName ?? region.type}</span>
                </button>
              </li>
            )
          })}
          {topFirst.length === 0 && <li className="layer-empty">No regions yet — draw one</li>}
        </ul>
      </div>

      <div className="layer-group">
        <div className="layer-group-header">
          <button
            type="button"
            className="icon-toggle"
            aria-label={artworkVisible ? 'Hide artwork layer' : 'Show artwork layer'}
            aria-pressed={artworkVisible}
            title="Show/hide artwork"
            onClick={() => editor.setArtworkVisible(!artworkVisible)}
          >
            {artworkVisible ? <EyeIcon /> : <EyeClosedIcon />}
          </button>
          <span className="layer-group-name">Artwork</span>
          <span className="layer-kind">tiles</span>
        </div>
      </div>

      <UnderlaySection />
    </aside>
  )
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path {...STROKE} d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4S1.5 8 1.5 8z" />
      <circle {...STROKE} cx="8" cy="8" r="1.8" />
    </svg>
  )
}

export function EyeClosedIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path {...STROKE} d="M2.5 9.5C4 11 5.8 12 8 12s4-1 5.5-2.5" />
      <path {...STROKE} d="M3 12l1.2-1.6M13 12l-1.2-1.6M8 12.2V14" />
    </svg>
  )
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect {...STROKE} x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path {...STROKE} d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  )
}

export function UnlockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect {...STROKE} x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path {...STROKE} d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7" />
    </svg>
  )
}
