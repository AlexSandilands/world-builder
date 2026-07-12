import { describe, expect, test, vi } from 'vitest'
import { defaultPlacement, readImageSize } from './placement'

describe('defaultPlacement', () => {
  test('centres and scales down an oversized image to fit the canvas', () => {
    const placed = defaultPlacement(
      'a'.repeat(64),
      { width: 4000, height: 2000 },
      {
        width: 1000,
        height: 1000,
      },
    )
    // fit = min(1000/4000, 1000/2000, 1) = 0.25
    expect(placed).toEqual({
      imageRef: 'a'.repeat(64),
      x: 0,
      y: 250,
      width: 1000,
      height: 500,
    })
  })

  test('never scales up a small image (fit is capped at 1)', () => {
    const placed = defaultPlacement(
      'b'.repeat(64),
      { width: 100, height: 50 },
      {
        width: 1000,
        height: 1000,
      },
    )
    expect(placed.width).toBe(100)
    expect(placed.height).toBe(50)
    expect(placed.x).toBe(450)
    expect(placed.y).toBe(475)
  })
})

describe('readImageSize', () => {
  test('reads intrinsic pixel dimensions via createImageBitmap', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 640, height: 480, close }),
    )
    const size = await readImageSize(new File([], 'sketch.png', { type: 'image/png' }))
    expect(size).toEqual({ width: 640, height: 480 })
    expect(close).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
