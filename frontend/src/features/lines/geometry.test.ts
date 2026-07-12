import { describe, expect, test } from 'vitest'
import type { Line } from '../../generated/project'
import {
  dashSegments,
  deletePolylineVertex,
  distanceToLine,
  insertPolylineVertex,
  movePolylineVertex,
  nearestOpenSegment,
  translateLine,
} from './geometry'

const points: Line['points'] = [
  [0, 0],
  [100, 0],
  [100, 100],
]

describe('polyline vertex editing', () => {
  test('translate shifts every vertex', () => {
    expect(translateLine(points, 5, -5)).toEqual([
      [5, -5],
      [105, -5],
      [105, 95],
    ])
  })

  test('move, insert, delete', () => {
    const moved = movePolylineVertex(points, 1, { x: 150, y: 10 })
    expect(moved[1]).toEqual([150, 10])

    const inserted = insertPolylineVertex(points, 0, { x: 50, y: -5 })
    expect(inserted).toHaveLength(4)
    expect(inserted[1]).toEqual([50, -5])

    const deleted = deletePolylineVertex(inserted, 1)
    expect(deleted).toEqual(points)
  })

  test('delete refuses to go below a 2-point line', () => {
    const two: Line['points'] = [
      [0, 0],
      [10, 0],
    ]
    expect(deletePolylineVertex(two, 0)).toBe(two)
  })
})

describe('open-segment hit testing', () => {
  test('nearest segment has no wraparound (unlike a closed ring)', () => {
    // Closest to the start->end chord would be segment 1 (100,0)->(100,100)
    // if wraparound existed; without it, segment 1 is still nearest here.
    const near = nearestOpenSegment(
      points.map(([x, y]) => ({ x, y })),
      { x: 100, y: 50 },
    )
    expect(near.index).toBe(1)
    expect(near.distance).toBeCloseTo(0)
  })

  test('distanceToLine matches the nearest-segment distance', () => {
    const xy = points.map(([x, y]) => ({ x, y }))
    expect(distanceToLine(xy, { x: 50, y: 10 })).toBeCloseTo(10)
  })
})

describe('dash segmentation', () => {
  test('alternates dash/gap along a straight line', () => {
    const straight: readonly { x: number; y: number }[] = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ]
    const segments = dashSegments(straight, 10, 5)
    // dash 0-10, gap 10-15, dash 15-25, gap 25-30 -> two dash segments
    expect(segments).toHaveLength(2)
    expect(segments[0]).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ])
    expect(segments[1][0].x).toBeCloseTo(15)
    expect(segments[1][1].x).toBeCloseTo(25)
  })
})
