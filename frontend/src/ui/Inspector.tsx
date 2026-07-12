import { useEditorStore } from '../state/editorStore'
import { LineInspector } from './LineInspector'
import { PointInspector } from './PointInspector'
import { RegionInspector } from './RegionInspector'

// Routes to whichever tagging panel matches the current selection. Selection
// is mutually exclusive across kinds (state/editorStore.ts), so at most one
// of these ever has anything selected; RegionInspector is the default (and
// owns the "nothing selected" empty state) when nothing is.
export function Inspector() {
  const hasLines = useEditorStore((s) => s.selectedLineIds.length > 0)
  const hasPoints = useEditorStore((s) => s.selectedPointIds.length > 0)
  if (hasLines) return <LineInspector />
  if (hasPoints) return <PointInspector />
  return <RegionInspector />
}
