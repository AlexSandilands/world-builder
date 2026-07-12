import { removePointsCommand } from '../../state/commands'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'

// Point actions shared by the inspector, layer panel and hotkeys. Each is one
// dispatched command, so each is one undo step.
export function deleteSelectedPoints(): void {
  const editor = useEditorStore.getState()
  if (editor.pointsLocked || editor.selectedPointIds.length === 0) return
  const { project, dispatch } = useProjectStore.getState()
  const cmd = removePointsCommand(project, editor.selectedPointIds)
  if (cmd.removed.length === 0) return
  dispatch(cmd)
  editor.clearSelection()
}
