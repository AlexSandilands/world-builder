import { removeLinesCommand, replaceLineCommand } from '../../state/commands'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'
import { deletePolylineVertex } from './geometry'

// Line actions shared by inspector buttons, layer panel and hotkeys. Each is
// one dispatched command, so each is one undo step.

export function deleteSelectedLines(): void {
  const editor = useEditorStore.getState()
  if (editor.linesLocked || editor.selectedLineIds.length === 0) return
  const { project, dispatch } = useProjectStore.getState()
  const cmd = removeLinesCommand(project, editor.selectedLineIds)
  if (cmd.removed.length === 0) return
  dispatch(cmd)
  editor.clearSelection()
}

export function deleteLineVertex(lineId: string, index: number): void {
  const editor = useEditorStore.getState()
  if (editor.linesLocked) return
  const { project, dispatch } = useProjectStore.getState()
  const line = project.lines.find((l) => l.id === lineId)
  if (!line) return
  const points = deletePolylineVertex(line.points, index)
  // No-op below the 2-vertex line minimum; leave the document untouched.
  if (points === line.points) return
  const cmd = replaceLineCommand(project, lineId, { points })
  if (cmd) dispatch(cmd)
}
