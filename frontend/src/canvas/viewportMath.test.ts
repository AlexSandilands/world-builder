import { describe, expect, test } from 'vitest'
import {
  clampScale,
  DEFAULT_SCALE_BOUNDS,
  fitToScreen,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from './viewportMath'

const view = { tx: 40, ty: -20, scale: 1.5 }

describe('viewport transforms', () => {
  test('world↔screen round-trips', () => {
    const p = { x: 320, y: 128 }
    const back = screenToWorld(view, worldToScreen(view, p))
    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
  })

  test('panBy shifts only translation', () => {
    const panned = panBy(view, 10, -5)
    expect(panned).toEqual({ tx: 50, ty: -25, scale: 1.5 })
  })

  test('clampScale respects bounds', () => {
    expect(clampScale(100)).toBe(DEFAULT_SCALE_BOUNDS.max)
    expect(clampScale(0)).toBe(DEFAULT_SCALE_BOUNDS.min)
    expect(clampScale(1)).toBe(1)
  })
})

describe('zoomAt', () => {
  test('keeps the world point under the anchor fixed', () => {
    const anchor = { x: 200, y: 150 }
    const before = screenToWorld(view, anchor)
    const after = screenToWorld(zoomAt(view, anchor, 1.7), anchor)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  test('cannot zoom past the max bound', () => {
    const zoomed = zoomAt({ tx: 0, ty: 0, scale: 7 }, { x: 0, y: 0 }, 10)
    expect(zoomed.scale).toBe(DEFAULT_SCALE_BOUNDS.max)
  })
})

test('fitToScreen centres the world within the viewport', () => {
  const fit = fitToScreen({ width: 1000, height: 1000 }, { width: 800, height: 600 })
  const topLeft = worldToScreen(fit, { x: 0, y: 0 })
  const bottomRight = worldToScreen(fit, { x: 1000, y: 1000 })
  expect(topLeft.x + bottomRight.x).toBeCloseTo(800)
  expect(topLeft.y + bottomRight.y).toBeCloseTo(600)
})
