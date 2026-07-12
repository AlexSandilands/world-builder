import { describe, expect, test } from 'vitest'
import type { Line } from '../../generated/project'
import { nearestLineAt } from './hitTest'

const wall: Line = {
  id: 'wall-1',
  type: 'wall',
  width: 8,
  points: [
    [0, 0],
    [100, 0],
  ],
}
const road: Line = {
  id: 'road-1',
  type: 'road',
  width: 4,
  points: [
    [0, 50],
    [100, 50],
  ],
}

describe('nearestLineAt', () => {
  test('a click on the stroke hits the line, accounting for its width', () => {
    // wall.width is 8, so half-width 4 covers y=3 with zero extra tolerance.
    expect(nearestLineAt([wall, road], { x: 50, y: 3 }, 0)?.line.id).toBe('wall-1')
  })

  test('outside width + tolerance misses', () => {
    expect(nearestLineAt([wall], { x: 50, y: 20 }, 2)).toBeNull()
  })

  test('picks the closer line when two are in range', () => {
    // y=30: distance to road (y=50) is 20, to wall (y=0) is 30 — road wins.
    const hit = nearestLineAt([wall, road], { x: 50, y: 30 }, 30)
    expect(hit?.line.id).toBe('road-1')
  })
})
