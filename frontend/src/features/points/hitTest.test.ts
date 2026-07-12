import { describe, expect, test } from 'vitest'
import type { Point } from '../../generated/project'
import { nearestPointAt } from './hitTest'

const cathedral: Point = { id: 'cathedral', type: 'landmark', position: [100, 100] }
const gate: Point = { id: 'gate', type: 'gate', position: [200, 100] }

describe('nearestPointAt', () => {
  test('hits within tolerance', () => {
    expect(nearestPointAt([cathedral, gate], { x: 105, y: 100 }, 10)?.id).toBe('cathedral')
  })

  test('misses outside tolerance', () => {
    expect(nearestPointAt([cathedral], { x: 200, y: 200 }, 10)).toBeNull()
  })

  test('picks the closer point when two are in range', () => {
    expect(nearestPointAt([cathedral, gate], { x: 150, y: 100 }, 60)?.id).toBe('cathedral')
    expect(nearestPointAt([cathedral, gate], { x: 160, y: 100 }, 60)?.id).toBe('gate')
  })
})
