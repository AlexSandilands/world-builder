import { describe, expect, test } from 'vitest'
import type { Geometry, GlobalSettings } from '../../generated/project'
import {
  areaOf,
  boundsOf,
  deletePolygonVertex,
  insertPolygonVertex,
  movePolygonVertex,
  outlineOf,
  rotateAbout,
  simplifyPolyline,
  snapToVertex,
  translateGeometry,
} from './geometry'
import { applyHandleDrag, handlesFor } from './handles'
import { nearestOutlinePoint, pointInGeometry, topRegionAt } from './hitTest'
import { MIN_REGION_SIDE_OUTPUT_PX, isBelowMinSize } from './minSize'

const square: Geometry = {
  kind: 'polygon',
  points: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
}
const rect: Geometry = { kind: 'rect', x: 10, y: 20, width: 200, height: 100 }
const ellipse: Geometry = { kind: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 20 }

describe('area', () => {
  test('polygon shoelace, rect, ellipse', () => {
    expect(areaOf(square)).toBe(10000)
    expect(areaOf(rect)).toBe(20000)
    expect(areaOf(ellipse)).toBeCloseTo(Math.PI * 600)
  })

  test('rotation does not change area or fool bounds', () => {
    const rotated: Geometry = { ...rect, kind: 'rect', rotation: 90 }
    expect(areaOf(rotated)).toBe(20000)
    const b = boundsOf(rotated)
    // A 200x100 rect rotated 90 degrees about its centre spans 100x200.
    expect(b.maxX - b.minX).toBeCloseTo(100)
    expect(b.maxY - b.minY).toBeCloseTo(200)
  })
})

describe('rotation convention', () => {
  test('positive degrees rotate clockwise in y-down space', () => {
    const p = rotateAbout({ x: 1, y: 0 }, { x: 0, y: 0 }, 90)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(1)
  })
})

describe('vertex editing', () => {
  test('move, insert, delete', () => {
    const moved = movePolygonVertex(square, 1, { x: 150, y: -10 })
    expect(moved.kind === 'polygon' && moved.points[1]).toEqual([150, -10])

    const inserted = insertPolygonVertex(square, 0, { x: 50, y: -5 })
    expect(inserted.kind === 'polygon' && inserted.points[1]).toEqual([50, -5])
    expect(inserted.kind === 'polygon' && inserted.points).toHaveLength(5)

    const deleted = deletePolygonVertex(inserted, 1)
    expect(deleted).toEqual(square)
  })

  test('delete refuses to go below a 3-point ring', () => {
    const triangle: Geometry = {
      kind: 'polygon',
      points: [
        [0, 0],
        [10, 0],
        [5, 8],
      ],
    }
    expect(deletePolygonVertex(triangle, 0)).toBe(triangle)
  })
})

describe('translate and handle drags', () => {
  test('translate shifts every kind', () => {
    expect(translateGeometry(square, 5, -5)).toMatchObject({
      points: expect.arrayContaining([[5, -5]]),
    })
    expect(translateGeometry(rect, 5, -5)).toMatchObject({ x: 15, y: 15 })
    expect(translateGeometry(ellipse, 5, -5)).toMatchObject({ cx: 55, cy: 45 })
  })

  test('polygon bbox-corner drag scales about the opposite corner', () => {
    const corner = handlesFor(square).find((h) => h.kind === 'resize' && h.index === 2)!
    const scaled = applyHandleDrag(square, corner, { x: 200, y: 50 })
    expect(scaled.kind === 'polygon' && scaled.points[2]).toEqual([200, 50])
    expect(scaled.kind === 'polygon' && scaled.points[0]).toEqual([0, 0])
  })

  test('rect corner drag keeps the opposite corner fixed', () => {
    const corner = handlesFor(rect).find((h) => h.index === 2)!
    const resized = applyHandleDrag(rect, corner, { x: 310, y: 220 })
    expect(resized).toMatchObject({ kind: 'rect', x: 10, y: 20, width: 300, height: 200 })
  })

  test('rotated rect resize happens in local space', () => {
    const r: Geometry = { kind: 'rect', x: 0, y: 0, width: 100, height: 50, rotation: 30 }
    const corner = handlesFor(r).find((h) => h.index === 2)!
    const resized = applyHandleDrag(r, corner, corner.at)
    expect(resized).toMatchObject({ kind: 'rect', rotation: 30 })
    if (resized.kind === 'rect') {
      expect(resized.width).toBeCloseTo(100)
      expect(resized.height).toBeCloseTo(50)
    }
  })

  test('ellipse axis handles set rx/ry', () => {
    const axis = handlesFor(ellipse).find((h) => h.index === 0)!
    const resized = applyHandleDrag(ellipse, axis, { x: 95, y: 50 })
    expect(resized).toMatchObject({ kind: 'ellipse', rx: 45, ry: 20 })
  })
})

describe('lasso simplification and snapping', () => {
  test('collinear samples collapse, corners survive', () => {
    const samples = [
      { x: 0, y: 0 },
      { x: 25, y: 0.2 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
    ]
    const simplified = simplifyPolyline(samples, 1)
    expect(simplified).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ])
  })

  test('a jittery freehand edge collapses at a realistic epsilon', () => {
    // A near-straight drag sampled with sub-epsilon hand tremor: RDP should
    // reduce it to a handful of vertices, not keep every wobble.
    const samples = Array.from({ length: 40 }, (_, i) => ({
      x: i * 5,
      y: i % 2 === 0 ? 0 : 3,
    }))
    const simplified = simplifyPolyline(samples, 4)
    expect(simplified.length).toBeLessThanOrEqual(3)
    expect(simplified[0]).toEqual({ x: 0, y: 0 })
    expect(simplified.at(-1)).toEqual({ x: 195, y: 3 })
  })

  test('snaps to another region vertex within tolerance only', () => {
    const candidates = [{ id: 'other', geometry: square }]
    expect(snapToVertex(candidates, 'self', { x: 98, y: 3 }, 5)).toEqual({ x: 100, y: 0 })
    expect(snapToVertex(candidates, 'self', { x: 80, y: 20 }, 5)).toBeNull()
    expect(snapToVertex(candidates, 'other', { x: 98, y: 3 }, 5)).toBeNull()
  })
})

describe('hit testing', () => {
  test('point in polygon / rect / rotated ellipse', () => {
    expect(pointInGeometry(square, { x: 50, y: 50 })).toBe(true)
    expect(pointInGeometry(square, { x: 150, y: 50 })).toBe(false)
    expect(pointInGeometry(rect, { x: 200, y: 110 })).toBe(true)
    const rotated: Geometry = { ...ellipse, kind: 'ellipse', rotation: 90 }
    // (50, 78) is outside the unrotated ellipse (ry=20) but inside rotated.
    expect(pointInGeometry(ellipse, { x: 50, y: 78 })).toBe(false)
    expect(pointInGeometry(rotated, { x: 50, y: 78 })).toBe(true)
  })

  test('click selects the topmost region by z, ties by array order', () => {
    const regions = [
      { id: 'bottom', type: 't', z: 0, geometry: square },
      { id: 'top', type: 't', z: 5, geometry: square },
      { id: 'tie-late', type: 't', z: 5, geometry: square },
    ]
    expect(topRegionAt(regions, { x: 50, y: 50 })?.id).toBe('tie-late')
    expect(topRegionAt(regions, { x: 500, y: 500 })).toBeNull()
  })

  test('nearest outline segment locates the insert-vertex edge', () => {
    const near = nearestOutlinePoint(square, { x: 50, y: -4 })
    expect(near.segmentIndex).toBe(0)
    expect(near.distance).toBeCloseTo(4)
  })
})

describe('minimum-size rule (placeholder threshold pending #8)', () => {
  const global: GlobalSettings = {
    artStylePrompt: '',
    canvas: { width: 2048, height: 1536 },
    output: { width: 12288, height: 9216 },
    scale: { metersPerUnit: 1.5 },
    defaultFillType: 'farmland',
    seed: 0,
  }

  test('flags regions under the output-pixel threshold', () => {
    // 10x10 canvas units = 60x60 output px, well under 128^2.
    expect(isBelowMinSize({ kind: 'rect', x: 0, y: 0, width: 10, height: 10 }, global)).toBe(true)
    // 90x70 canvas units = 540x420 output px (smallest fixture region).
    expect(isBelowMinSize({ kind: 'rect', x: 0, y: 0, width: 90, height: 70 }, global)).toBe(false)
  })

  test('threshold is exactly MIN_SIDE^2 at output resolution', () => {
    const side = (MIN_REGION_SIDE_OUTPUT_PX / 6) * (1 + 1e-9) // output = 6x canvas here
    expect(isBelowMinSize({ kind: 'rect', x: 0, y: 0, width: side, height: side }, global)).toBe(
      false,
    )
    expect(
      isBelowMinSize({ kind: 'rect', x: 0, y: 0, width: side * 0.9, height: side }, global),
    ).toBe(true)
  })
})

describe('outline', () => {
  test('rect outline honours rotation', () => {
    const r: Geometry = { kind: 'rect', x: -50, y: -25, width: 100, height: 50, rotation: 90 }
    const ring = outlineOf(r)
    expect(ring[0].x).toBeCloseTo(25)
    expect(ring[0].y).toBeCloseTo(-50)
  })
})
