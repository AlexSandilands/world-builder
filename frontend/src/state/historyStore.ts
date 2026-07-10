import { create } from 'zustand'
import type { Command } from './commands'

// Linear undo/redo over project commands. #19 (project management) grows this
// into the full system (persistence, autosave coalescing); the integration
// point it relies on — every mutation arrives here as a Command — is fixed now.
type HistoryState = {
  past: Command[]
  future: Command[]
  push: (cmd: Command) => void
  takeUndo: () => Command | undefined
  takeRedo: () => Command | undefined
  clear: () => void
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  push: (cmd) => set((s) => ({ past: [...s.past, cmd], future: [] })),
  takeUndo: () => {
    const { past, future } = get()
    const cmd = past.at(-1)
    if (cmd) set({ past: past.slice(0, -1), future: [cmd, ...future] })
    return cmd
  },
  takeRedo: () => {
    const { past, future } = get()
    const cmd = future[0]
    if (cmd) set({ past: [...past, cmd], future: future.slice(1) })
    return cmd
  },
  clear: () => set({ past: [], future: [] }),
}))
