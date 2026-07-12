import { create } from 'zustand'
import type { Line } from '../generated/project'

export type ToolId = 'select' | 'hand' | 'lasso' | 'rect' | 'ellipse' | 'line' | 'point'

// UI-only editor state: active tool, selection, and per-layer view flags.
// None of this is project data — it never serialises into the document.
// Underlay visibility/opacity/lock live here rather than in the schema
// (docs/schema/project-v1.md): only its placement is worth persisting.
//
// Selection is mutually exclusive across kinds (one inspector panel shows at
// a time): selecting regions clears the line/point selection and vice versa.
type EditorState = {
  tool: ToolId
  selectedRegionIds: string[]
  selectedLineIds: string[]
  selectedPointIds: string[]
  regionsVisible: boolean
  regionsLocked: boolean
  linesVisible: boolean
  linesLocked: boolean
  pointsVisible: boolean
  pointsLocked: boolean
  artworkVisible: boolean
  underlayVisible: boolean
  underlayLocked: boolean
  underlayOpacity: number
  underlaySelected: boolean
  // Region-type id assigned to newly drawn regions; remembers the last pick.
  drawType: string
  // Line type + width assigned to newly drawn lines; remembers the last pick.
  drawLineType: Line['type']
  drawLineWidth: number
  // Point-type id assigned to newly placed points; remembers the last pick.
  drawPointType: string
  setTool: (tool: ToolId) => void
  select: (ids: string[]) => void
  toggleSelected: (id: string) => void
  selectLines: (ids: string[]) => void
  toggleSelectedLine: (id: string) => void
  selectPoints: (ids: string[]) => void
  toggleSelectedPoint: (id: string) => void
  clearSelection: () => void
  setRegionsVisible: (visible: boolean) => void
  setRegionsLocked: (locked: boolean) => void
  setLinesVisible: (visible: boolean) => void
  setLinesLocked: (locked: boolean) => void
  setPointsVisible: (visible: boolean) => void
  setPointsLocked: (locked: boolean) => void
  setArtworkVisible: (visible: boolean) => void
  setUnderlayVisible: (visible: boolean) => void
  setUnderlayLocked: (locked: boolean) => void
  setUnderlayOpacity: (opacity: number) => void
  setUnderlaySelected: (selected: boolean) => void
  setDrawType: (typeId: string) => void
  setDrawLineType: (type: Line['type']) => void
  setDrawLineWidth: (width: number) => void
  setDrawPointType: (typeId: string) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'select',
  selectedRegionIds: [],
  selectedLineIds: [],
  selectedPointIds: [],
  regionsVisible: true,
  regionsLocked: false,
  linesVisible: true,
  linesLocked: false,
  pointsVisible: true,
  pointsLocked: false,
  artworkVisible: true,
  underlayVisible: true,
  underlayLocked: true,
  underlayOpacity: 0.5,
  underlaySelected: false,
  drawType: 'residential-dense',
  drawLineType: 'wall',
  drawLineWidth: 8,
  drawPointType: 'landmark',
  setTool: (tool) => set({ tool }),
  select: (ids) => set({ selectedRegionIds: ids, selectedLineIds: [], selectedPointIds: [] }),
  toggleSelected: (id) =>
    set((s) => ({
      selectedRegionIds: s.selectedRegionIds.includes(id)
        ? s.selectedRegionIds.filter((x) => x !== id)
        : [...s.selectedRegionIds, id],
      selectedLineIds: [],
      selectedPointIds: [],
    })),
  selectLines: (ids) => set({ selectedLineIds: ids, selectedRegionIds: [], selectedPointIds: [] }),
  toggleSelectedLine: (id) =>
    set((s) => ({
      selectedLineIds: s.selectedLineIds.includes(id)
        ? s.selectedLineIds.filter((x) => x !== id)
        : [...s.selectedLineIds, id],
      selectedRegionIds: [],
      selectedPointIds: [],
    })),
  selectPoints: (ids) => set({ selectedPointIds: ids, selectedRegionIds: [], selectedLineIds: [] }),
  toggleSelectedPoint: (id) =>
    set((s) => ({
      selectedPointIds: s.selectedPointIds.includes(id)
        ? s.selectedPointIds.filter((x) => x !== id)
        : [...s.selectedPointIds, id],
      selectedRegionIds: [],
      selectedLineIds: [],
    })),
  clearSelection: () => set({ selectedRegionIds: [], selectedLineIds: [], selectedPointIds: [] }),
  setRegionsVisible: (regionsVisible) => set({ regionsVisible }),
  setRegionsLocked: (regionsLocked) => set({ regionsLocked }),
  setLinesVisible: (linesVisible) => set({ linesVisible }),
  setLinesLocked: (linesLocked) => set({ linesLocked }),
  setPointsVisible: (pointsVisible) => set({ pointsVisible }),
  setPointsLocked: (pointsLocked) => set({ pointsLocked }),
  setArtworkVisible: (artworkVisible) => set({ artworkVisible }),
  setUnderlayVisible: (underlayVisible) => set({ underlayVisible }),
  setUnderlayLocked: (underlayLocked) => set({ underlayLocked }),
  setUnderlayOpacity: (underlayOpacity) =>
    set({ underlayOpacity: Math.min(1, Math.max(0, underlayOpacity)) }),
  setUnderlaySelected: (underlaySelected) => set({ underlaySelected }),
  setDrawType: (drawType) => set({ drawType }),
  setDrawLineType: (drawLineType) => set({ drawLineType }),
  setDrawLineWidth: (drawLineWidth) => set({ drawLineWidth: Math.max(0.01, drawLineWidth) }),
  setDrawPointType: (drawPointType) => set({ drawPointType }),
}))
