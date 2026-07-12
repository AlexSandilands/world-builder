import { Texture } from 'pixi.js'
import { describe, expect, test } from 'vitest'
import type { Underlay } from '../../generated/project'
import type { OverlayTheme } from '../overlayTheme'
import type { UnderlayScene } from './UnderlayLayer'
import { UnderlayLayer } from './UnderlayLayer'

const theme: OverlayTheme = {
  selection: '#58a6d4',
  selectionFill: 'rgba(88, 166, 212, 0.12)',
  warning: '#d98a3f',
  warningFill: 'rgba(217, 138, 63, 0.2)',
  handle: '#f2ede2',
  draft: '#c9a45c',
  marker: '#d6b877',
}

const UNDERLAY: Underlay = { imageRef: 'a'.repeat(64), x: 100, y: 200, width: 400, height: 300 }

function scene(underlay: Underlay): UnderlayScene {
  return { underlay, visible: true, opacity: 0.5, locked: true, selected: false }
}

// Texture.WHITE is 16×16 — deliberately nothing like the 400×300 placement.
// The PR #54 human-verify defect (sprite offset from its chrome box) only
// appears when texture pixel size differs from the placed size, so these
// tests must never use a texture that matches the placement.
function layerWithWhiteTexture(): UnderlayLayer {
  return new UnderlayLayer(theme, () => Promise.resolve(Texture.WHITE))
}

async function textureLoaded(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('UnderlayLayer sprite placement (PR #54 human-verify defect)', () => {
  test('sprite bounds equal the underlay rect exactly, texture size notwithstanding', async () => {
    const layer = layerWithWhiteTexture()
    layer.redraw(scene(UNDERLAY), 1)
    await textureLoaded()

    // Child 0 is the image sprite (chrome draws above it).
    const bounds = layer.getChildAt(0).getBounds()
    expect(bounds.x).toBeCloseTo(100)
    expect(bounds.y).toBeCloseTo(200)
    expect(bounds.width).toBeCloseTo(400)
    expect(bounds.height).toBeCloseTo(300)
  })

  test('re-layout happens when the texture arrives, not just on the next redraw', async () => {
    const layer = layerWithWhiteTexture()
    // Single redraw before the texture resolves: the initial width/height were
    // set against the empty placeholder texture, so without the on-load
    // re-layout the implied scale would be stale.
    layer.redraw(scene(UNDERLAY), 1)
    await textureLoaded()

    const bounds = layer.getChildAt(0).getBounds()
    expect(bounds.width).toBeCloseTo(400)
    expect(bounds.height).toBeCloseTo(300)
  })

  test('rotation is about the rect centre (schema convention)', async () => {
    const layer = layerWithWhiteTexture()
    layer.redraw(scene({ ...UNDERLAY, rotation: 90 }), 1)
    await textureLoaded()

    // 400×300 rotated 90° about its centre (300, 350) → 300×400 bounds
    // around the same centre.
    const bounds = layer.getChildAt(0).getBounds()
    expect(bounds.x).toBeCloseTo(150)
    expect(bounds.y).toBeCloseTo(150)
    expect(bounds.width).toBeCloseTo(300)
    expect(bounds.height).toBeCloseTo(400)
  })
})
