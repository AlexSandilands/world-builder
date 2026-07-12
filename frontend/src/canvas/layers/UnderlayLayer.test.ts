import { Texture } from 'pixi.js'
import { describe, expect, test, vi } from 'vitest'
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

// A minimal stand-in for a loaded Texture: distinct per call (unlike the
// shared, must-never-be-destroyed Texture.WHITE singleton the placement
// tests use above), with a spy-able destroy so the tests below can assert
// exactly-once destruction of superseded/replaced textures.
function fakeTexture(): Texture {
  return { orig: { width: 16, height: 16 }, dynamic: false, destroy: vi.fn() } as unknown as Texture
}

const REF_B = 'b'.repeat(64)
const REF_C = 'c'.repeat(64)

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

describe('UnderlayLayer texture lifecycle (issue #56)', () => {
  test('the first load never destroys anything (sprite starts on the shared default texture)', async () => {
    const textureA = fakeTexture()
    const layer = new UnderlayLayer(theme, () => Promise.resolve(textureA))
    layer.redraw(scene(UNDERLAY), 1)
    await textureLoaded()

    expect(textureA.destroy).not.toHaveBeenCalled()
  })

  test('same-slot replacement: re-importing destroys the previous texture exactly once', async () => {
    const textureA = fakeTexture()
    const textureB = fakeTexture()
    const textures = [textureA, textureB]
    let i = 0
    const layer = new UnderlayLayer(theme, () => Promise.resolve(textures[i++]))

    layer.redraw(scene(UNDERLAY), 1)
    await textureLoaded()
    expect(textureA.destroy).not.toHaveBeenCalled()

    // Re-import: same underlay slot, new imageRef.
    layer.redraw(scene({ ...UNDERLAY, imageRef: REF_B }), 1)
    await textureLoaded()

    expect(textureA.destroy).toHaveBeenCalledTimes(1)
    expect(textureA.destroy).toHaveBeenCalledWith(true)
    expect(textureB.destroy).not.toHaveBeenCalled()
    expect(layer.getChildAt(0).getBounds().width).toBeCloseTo(400)
  })

  test('a superseded in-flight load is destroyed once and never becomes use-after-destroy for the live one', async () => {
    const textureA = fakeTexture()
    const textureB = fakeTexture()
    const textureC = fakeTexture()
    const textures = [textureA, textureB, textureC]
    let i = 0
    const layer = new UnderlayLayer(theme, () => Promise.resolve(textures[i++]))

    // Three re-imports fired before any fetch resolves — the middle one
    // (B) is superseded before it's ever applied to the sprite.
    layer.redraw(scene(UNDERLAY), 1)
    layer.redraw(scene({ ...UNDERLAY, imageRef: REF_B }), 1)
    layer.redraw(scene({ ...UNDERLAY, imageRef: REF_C }), 1)
    await textureLoaded()

    expect(textureA.destroy).toHaveBeenCalledTimes(1)
    expect(textureB.destroy).toHaveBeenCalledTimes(1)
    expect(textureC.destroy).not.toHaveBeenCalled()
  })

  test('destroying the layer destroys the currently-owned texture exactly once, even with a load in flight', async () => {
    const textureA = fakeTexture()
    let resolveB: (t: Texture) => void = () => {}
    const textureB = fakeTexture()
    let calls = 0
    const layer = new UnderlayLayer(theme, () => {
      calls += 1
      return calls === 1
        ? Promise.resolve(textureA)
        : new Promise((resolve) => (resolveB = resolve))
    })

    layer.redraw(scene(UNDERLAY), 1)
    await textureLoaded()
    expect(textureA.destroy).not.toHaveBeenCalled()

    // Start a second load, then destroy the layer before it resolves.
    layer.redraw(scene({ ...UNDERLAY, imageRef: REF_B }), 1)
    layer.destroy()
    expect(textureA.destroy).toHaveBeenCalledTimes(1)

    // The in-flight load resolving after destroy must not touch the
    // already-destroyed A, and must clean up its own now-orphaned texture.
    resolveB(textureB)
    await textureLoaded()

    expect(textureA.destroy).toHaveBeenCalledTimes(1)
    expect(textureB.destroy).toHaveBeenCalledTimes(1)
  })
})
