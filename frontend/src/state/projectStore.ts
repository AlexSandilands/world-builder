import { create } from 'zustand'
import type { Geometry, Underlay, WorldBuilderProject } from '../generated/project'
import type { Command } from './commands'
import { applyCommand, undoCommand } from './commands'
import { createDefaultProject } from './defaultProject'
import { useHistoryStore } from './historyStore'

// The project-document store. The document always has the generated schema
// shape (WorldBuilderProject); every durable mutation goes through dispatch()
// or record() as a Command so it is undoable from day one.
type ProjectState = {
  project: WorldBuilderProject
  // Apply a command and push it onto the undo history.
  dispatch: (cmd: Command) => void
  // Push a command whose `after` state the document already shows (used when
  // a drag previewed via previewGeometry commits on pointer-up).
  record: (cmd: Command) => void
  // Transient, non-undoable geometry update for live drag feedback; the drag
  // commits a single region/replace command when it ends.
  previewGeometry: (id: string, geometry: Geometry) => void
  // Same, for the underlay transform (move/resize drag); commits a single
  // underlay/set command on release.
  previewUnderlay: (underlay: Underlay) => void
  setProject: (project: WorldBuilderProject) => void
  undo: () => void
  redo: () => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: createDefaultProject(),
  dispatch: (cmd) => {
    set((s) => ({ project: applyCommand(s.project, cmd) }))
    useHistoryStore.getState().push(cmd)
  },
  record: (cmd) => {
    useHistoryStore.getState().push(cmd)
  },
  previewGeometry: (id, geometry) =>
    set((s) => ({
      project: {
        ...s.project,
        regions: s.project.regions.map((r) => (r.id === id ? { ...r, geometry } : r)),
      },
    })),
  previewUnderlay: (underlay) => set((s) => ({ project: { ...s.project, underlay } })),
  // Replaces the whole document (project open/reload) without going through
  // the undo stack — a freshly loaded document has no history to undo into.
  setProject: (project) => {
    useHistoryStore.getState().clear()
    set({ project })
  },
  undo: () => {
    const cmd = useHistoryStore.getState().takeUndo()
    if (cmd) set((s) => ({ project: undoCommand(s.project, cmd) }))
  },
  redo: () => {
    const cmd = useHistoryStore.getState().takeRedo()
    if (cmd) set((s) => ({ project: applyCommand(s.project, cmd) }))
  },
}))
