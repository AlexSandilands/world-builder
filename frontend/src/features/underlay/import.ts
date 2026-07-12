import { uploadAsset } from '../../api/assets'
import type { WorldBuilderProject } from '../../generated/project'
import type { UnderlaySet } from '../../state/commands'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'
import { defaultPlacement, readImageSize } from './placement'

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export function isAcceptedImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type)
}

// Uploads the file to the orchestrator asset store and builds the command
// that places it centred-and-fit on the canvas. Replaces any existing
// underlay (v1 scope: at most one).
export async function buildImportUnderlayCommand(
  file: File,
  project: WorldBuilderProject,
): Promise<UnderlaySet> {
  const [{ digest }, size] = await Promise.all([uploadAsset(file), readImageSize(file)])
  const after = defaultPlacement(digest, size, project.global.canvas)
  return { kind: 'underlay/set', before: project.underlay, after }
}

// Shared by the file-picker and canvas drag-drop entry points: upload,
// dispatch, and select+unlock so the placement handles are immediately
// available to fit the image.
export async function importUnderlay(file: File): Promise<void> {
  if (!isAcceptedImage(file)) return
  const project = useProjectStore.getState().project
  const cmd = await buildImportUnderlayCommand(file, project)
  useProjectStore.getState().dispatch(cmd)
  useEditorStore.getState().setUnderlayLocked(false)
  useEditorStore.getState().setUnderlaySelected(true)
}
