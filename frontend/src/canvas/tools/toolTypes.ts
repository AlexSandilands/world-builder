import type { XY } from '../../features/regions/geometry'

export type PointerInfo = {
  world: XY
  shiftKey: boolean
  altKey: boolean
}

// In-progress drawing geometry (and the select tool's marquee), rendered by
// VectorLayer until committed. `line`'s last point is the live cursor
// position (not yet a committed vertex).
export type Draft =
  | { kind: 'lasso'; points: XY[] }
  | { kind: 'rect'; a: XY; b: XY }
  | { kind: 'ellipse'; a: XY; b: XY }
  | { kind: 'marquee'; a: XY; b: XY }
  | { kind: 'line'; points: XY[] }

// What tools need from the canvas: screen-tolerance conversion and draft
// display. Document/selection access goes straight to the zustand stores —
// tools run outside React.
export type ToolContext = {
  // Current world→screen scale; screen-px tolerances divide by this.
  scale: () => number
  setDraft: (draft: Draft | null) => void
}

export interface Tool {
  // Return true when the event is consumed; false lets the canvas pan.
  onDown(e: PointerInfo, ctx: ToolContext): boolean
  onMove(e: PointerInfo, ctx: ToolContext): void
  onUp(e: PointerInfo, ctx: ToolContext): void
  onDoubleClick?(e: PointerInfo, ctx: ToolContext): void
  // Completes a multi-click gesture (line tool: Enter finishes the polyline).
  finish?(ctx: ToolContext): void
  cancel(ctx: ToolContext): void
}
