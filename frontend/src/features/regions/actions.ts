import { removeRegionsCommand, reorderCommand, replaceRegionCommand } from '../../state/commands'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'
import { deletePolygonVertex } from './geometry'

// Region actions shared by inspector buttons, layer panel, hotkeys and the
// canvas context menu. Each is one dispatched command, so each is one undo step.

export function deleteSelectedRegions(): void {
  const editor = useEditorStore.getState()
  if (editor.regionsLocked || editor.selectedRegionIds.length === 0) return
  const { project, dispatch } = useProjectStore.getState()
  const cmd = removeRegionsCommand(project, editor.selectedRegionIds)
  if (cmd.removed.length === 0) return
  dispatch(cmd)
  editor.clearSelection()
}

export function reorderSelectedRegions(direction: 'raise' | 'lower'): void {
  const editor = useEditorStore.getState()
  if (editor.regionsLocked || editor.selectedRegionIds.length === 0) return
  const { project, dispatch } = useProjectStore.getState()
  const cmd = reorderCommand(project, editor.selectedRegionIds, direction)
  if (cmd) dispatch(cmd)
}

export function deleteRegionVertex(regionId: string, index: number): void {
  const editor = useEditorStore.getState()
  if (editor.regionsLocked) return
  const { project, dispatch } = useProjectStore.getState()
  const region = project.regions.find((r) => r.id === regionId)
  if (!region || region.geometry.kind !== 'polygon') return
  const geometry = deletePolygonVertex(region.geometry, index)
  // No-op below the 3-vertex ring minimum; leave the document untouched.
  if (geometry === region.geometry) return
  const cmd = replaceRegionCommand(project, regionId, { geometry })
  if (cmd) dispatch(cmd)
}
