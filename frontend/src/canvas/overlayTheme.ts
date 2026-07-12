// Canvas overlay colours come from the design tokens (docs/design/tokens.css)
// so the Pixi layer stays in step with the CSS theme. Fallbacks cover
// headless test environments where the stylesheet is not applied.
export type OverlayTheme = {
  selection: string
  selectionFill: string
  warning: string
  warningFill: string
  handle: string
  draft: string
  // Point/landmark marker fill. Not one of the design doc's fixed accent
  // roles (brass/ink/verdigris/seal/amber) — points have no vocabulary
  // colour like region maskColor, so this reuses the warm "brand" text tone.
  marker: string
}

const FALLBACK: OverlayTheme = {
  selection: '#58a6d4',
  selectionFill: 'rgba(88, 166, 212, 0.12)',
  warning: '#d98a3f',
  warningFill: 'rgba(217, 138, 63, 0.2)',
  handle: '#f2ede2',
  draft: '#c9a45c',
  marker: '#d6b877',
}

export function readOverlayTheme(): OverlayTheme {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    selection: token('--overlay-selection', FALLBACK.selection),
    selectionFill: token('--overlay-selection-fill', FALLBACK.selectionFill),
    warning: token('--overlay-dirty', FALLBACK.warning),
    warningFill: token('--overlay-warning-fill', FALLBACK.warningFill),
    handle: token('--overlay-handle', FALLBACK.handle),
    draft: token('--accent-brass', FALLBACK.draft),
    marker: token('--text-brand', FALLBACK.marker),
  }
}
