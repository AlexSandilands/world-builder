import { create } from 'zustand'

// React-facing viewport readout. The authoritative pan/zoom transform lives
// imperatively inside the Pixi controller so pointer moves never trigger a
// React render; the controller pushes only the display zoom here, and React
// asks for a fit via a bumped counter.
type ViewportState = {
  zoomPercent: number
  residentTiles: number
  fitNonce: number
  setReadout: (zoomPercent: number, residentTiles: number) => void
  requestFit: () => void
}

export const useViewportStore = create<ViewportState>((set) => ({
  zoomPercent: 100,
  residentTiles: 0,
  fitNonce: 0,
  setReadout: (zoomPercent, residentTiles) => set({ zoomPercent, residentTiles }),
  requestFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
}))
