// Placeholder domain types for the canvas spike.
//
// The project document's real types are generated from schema/ by #10 into
// src/generated/. Until that lands, this module carries a minimal, hand-written
// subset so the store and canvas can be wired end-to-end. When the generated
// module exists, replace these shapes with imports from it — do not grow this
// file into a parallel source of truth.

export type Point = { x: number; y: number }

export type LayerKind = 'artwork' | 'region' | 'line'

export type ArtworkLayer = {
  id: string
  kind: 'artwork'
  name: string
  visible: boolean
  // Pixel size of the full-resolution artwork this tile pyramid represents.
  // The layer never loads this as one texture; tiles are streamed per viewport.
  width: number
  height: number
  tileSize: number
}

export type RegionLayer = {
  id: string
  kind: 'region'
  name: string
  visible: boolean
  color: number
  polygon: Point[]
}

export type LineLayer = {
  id: string
  kind: 'line'
  name: string
  visible: boolean
  color: number
  points: Point[]
}

export type Layer = ArtworkLayer | RegionLayer | LineLayer

export type Project = {
  name: string
  // World-coordinate bounds all layers share; the viewport transform is the
  // only place these coordinates are turned into screen pixels.
  world: { width: number; height: number }
  layers: Layer[]
}
