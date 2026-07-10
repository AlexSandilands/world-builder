import { create } from 'zustand'

export type ToolId = 'select' | 'lasso' | 'rect' | 'ellipse'

// UI-only editor state: active tool, selection, and per-layer view flags.
// None of this is project data — it never serialises into the document.
type EditorState = {
  tool: ToolId
  selectedRegionIds: string[]
  regionsVisible: boolean
  regionsLocked: boolean
  artworkVisible: boolean
  // Region-type id assigned to newly drawn regions; remembers the last pick.
  drawType: string
  setTool: (tool: ToolId) => void
  select: (ids: string[]) => void
  toggleSelected: (id: string) => void
  clearSelection: () => void
  setRegionsVisible: (visible: boolean) => void
  setRegionsLocked: (locked: boolean) => void
  setArtworkVisible: (visible: boolean) => void
  setDrawType: (typeId: string) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'select',
  selectedRegionIds: [],
  regionsVisible: true,
  regionsLocked: false,
  artworkVisible: true,
  drawType: 'residential-dense',
  setTool: (tool) => set({ tool }),
  select: (ids) => set({ selectedRegionIds: ids }),
  toggleSelected: (id) =>
    set((s) => ({
      selectedRegionIds: s.selectedRegionIds.includes(id)
        ? s.selectedRegionIds.filter((x) => x !== id)
        : [...s.selectedRegionIds, id],
    })),
  clearSelection: () => set({ selectedRegionIds: [] }),
  setRegionsVisible: (regionsVisible) => set({ regionsVisible }),
  setRegionsLocked: (regionsLocked) => set({ regionsLocked }),
  setArtworkVisible: (artworkVisible) => set({ artworkVisible }),
  setDrawType: (drawType) => set({ drawType }),
}))
