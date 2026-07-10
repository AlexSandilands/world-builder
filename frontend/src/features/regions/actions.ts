import { removeRegionsCommand, reorderCommand } from '../../state/commands'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'

// Region actions shared by inspector buttons, layer panel and hotkeys.
// Each is one dispatched command, so each is one undo step.

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
