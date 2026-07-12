import { create } from 'zustand'

export type ToolId = 'select' | 'hand' | 'lasso' | 'rect' | 'ellipse'

// UI-only editor state: active tool, selection, and per-layer view flags.
// None of this is project data — it never serialises into the document.
// Underlay visibility/opacity/lock live here rather than in the schema
// (docs/schema/project-v1.md): only its placement is worth persisting.
type EditorState = {
  tool: ToolId
  selectedRegionIds: string[]
  regionsVisible: boolean
  regionsLocked: boolean
  artworkVisible: boolean
  underlayVisible: boolean
  underlayLocked: boolean
  underlayOpacity: number
  underlaySelected: boolean
  // Region-type id assigned to newly drawn regions; remembers the last pick.
  drawType: string
  setTool: (tool: ToolId) => void
  select: (ids: string[]) => void
  toggleSelected: (id: string) => void
  clearSelection: () => void
  setRegionsVisible: (visible: boolean) => void
  setRegionsLocked: (locked: boolean) => void
  setArtworkVisible: (visible: boolean) => void
  setUnderlayVisible: (visible: boolean) => void
  setUnderlayLocked: (locked: boolean) => void
  setUnderlayOpacity: (opacity: number) => void
  setUnderlaySelected: (selected: boolean) => void
  setDrawType: (typeId: string) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'select',
  selectedRegionIds: [],
  regionsVisible: true,
  regionsLocked: false,
  artworkVisible: true,
  underlayVisible: true,
  underlayLocked: true,
  underlayOpacity: 0.5,
  underlaySelected: false,
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
  setUnderlayVisible: (underlayVisible) => set({ underlayVisible }),
  setUnderlayLocked: (underlayLocked) => set({ underlayLocked }),
  setUnderlayOpacity: (underlayOpacity) =>
    set({ underlayOpacity: Math.min(1, Math.max(0, underlayOpacity)) }),
  setUnderlaySelected: (underlaySelected) => set({ underlaySelected }),
  setDrawType: (drawType) => set({ drawType }),
}))
