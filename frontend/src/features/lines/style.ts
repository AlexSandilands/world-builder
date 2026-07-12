import type { Line } from '../../generated/project'

// Line types are a fixed v1 enum, not vocabulary data (docs/schema/project-v1.md:
// the compiler handles each structurally), so their colours and default
// widths are code, not project data. Shared by VectorLayer (render) and
// LineInspector (type picker swatch) so the two never drift apart.
export const LINE_COLORS: Record<Line['type'], string> = {
  wall: '#6e6558',
  road: '#a59b88',
  river: '#58a6d4',
  canal: '#58a6d4',
  coastline: '#7a8a94',
}

export const LINE_TYPES: Line['type'][] = ['wall', 'road', 'river', 'canal', 'coastline']

export const LINE_TYPE_LABELS: Record<Line['type'], string> = {
  wall: 'Wall',
  road: 'Road',
  river: 'River',
  canal: 'Canal',
  coastline: 'Coastline',
}

// Short structural-handling hint per type (docs/schema/project-v1.md: "the
// compiler handles each line type structurally"), shown in the type picker
// in place of a vocabulary promptFragment — lines have none.
export const LINE_TYPE_HINTS: Record<Line['type'], string> = {
  wall: 'closes into a ring and gets thickness',
  road: 'joins the street graph',
  river: 'interacts with water regions',
  canal: 'interacts with water regions',
  coastline: 'interacts with water regions',
}

// Sensible per-type starting stroke width (canvas units) for newly drawn
// lines, echoing schema/fixtures/valid/test-city.json's proportions.
export const DEFAULT_LINE_WIDTH: Record<Line['type'], number> = {
  wall: 8,
  road: 5,
  river: 10,
  canal: 8,
  coastline: 12,
}
