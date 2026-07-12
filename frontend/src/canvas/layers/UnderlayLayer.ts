import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import { assetUrl } from '../../api/assets'
import type { Underlay } from '../../generated/project'
import { handlesFor } from '../../features/regions/handles'
import { toRect } from '../../features/underlay/rect'
import type { OverlayTheme } from '../overlayTheme'

export type UnderlayScene = {
  underlay: Underlay | null
  visible: boolean
  opacity: number
  locked: boolean
  selected: boolean
}

// Fetch + createImageBitmap rather than Assets.load/Texture.from(url):
// /api/assets/{digest} has no file extension for Pixi's loader to key its
// format detection on, and this path already works (features/underlay's
// import flow uses the same call to size a freshly picked file).
async function fetchImageTexture(url: string): Promise<Texture> {
  const res = await fetch(url)
  const bitmap = await createImageBitmap(await res.blob())
  return Texture.from(bitmap)
}

// Renders the tracing-reference image as one Sprite (never tiled — it is an
// authoring aid, not artwork, so the "never one 16k texture" rule does not
// apply: a hand sketch is a few megapixels at most) plus selection chrome
// when unlocked and selected. Sits between the artwork tile pyramid and the
// semantic vector layer in CanvasController's world container, so regions
// trace on top of it.
export class UnderlayLayer extends Container {
  private readonly sprite = new Sprite()
  private readonly chrome = new Graphics()
  private readonly theme: OverlayTheme
  private readonly fetchTexture: (url: string) => Promise<Texture>
  private loadedRef: string | null = null
  private lastScene: UnderlayScene | null = null
  private lastScale = 1

  constructor(theme: OverlayTheme, fetchTexture = fetchImageTexture) {
    super()
    this.theme = theme
    this.fetchTexture = fetchTexture
    // Anchor, not pivot, for centre-rotation: anchor is normalised texture
    // space, so it stays the rect centre whatever the image's pixel size.
    // (pivot is in *pre-scale texture pixels*; setting it in world units put
    // the sprite off its chrome box by (w/2)(1 - w/texWidth) — the offset
    // defect human-verify caught on PR #54.)
    this.sprite.anchor.set(0.5)
    this.addChild(this.sprite)
    this.addChild(this.chrome)
  }

  redraw(scene: UnderlayScene, scale: number): void {
    this.lastScene = scene
    this.lastScale = scale
    const { underlay } = scene
    this.chrome.clear()
    if (!underlay || !scene.visible) {
      this.sprite.visible = false
      return
    }
    this.sprite.visible = true
    this.sprite.alpha = scene.opacity
    this.loadTexture(underlay.imageRef)
    // width/height set scale relative to the current texture; position is
    // the rect centre (anchor 0.5) and rotation is about it, matching the
    // schema's rotate-about-centre convention.
    this.sprite.width = underlay.width
    this.sprite.height = underlay.height
    this.sprite.position.set(underlay.x + underlay.width / 2, underlay.y + underlay.height / 2)
    this.sprite.angle = underlay.rotation ?? 0

    if (scene.selected && !scene.locked) this.drawChrome(underlay, scale)
  }

  private loadTexture(imageRef: string): void {
    if (this.loadedRef === imageRef) return
    this.loadedRef = imageRef
    this.fetchTexture(assetUrl(imageRef))
      .then((texture) => {
        // A newer import may have started loading before this one resolved;
        // only apply the texture that's still current.
        if (this.loadedRef !== imageRef || this.destroyed) {
          texture.destroy(true)
          return
        }
        this.sprite.texture = texture
        // width/height were set against the previous (possibly empty)
        // texture; the new texture changes the scale they imply, so re-lay-
        // out now rather than waiting for the next unrelated redraw.
        if (this.lastScene) this.redraw(this.lastScene, this.lastScale)
      })
      .catch(() => {
        // Missing/unreachable asset: leave the sprite blank rather than throw
        // from a detached promise.
      })
  }

  private drawChrome(underlay: Underlay, scale: number): void {
    const px = (n: number) => n / scale
    // handlesFor returns the (already rotated) corners for a rect — draw the
    // true rotated quad from them rather than an axis-aligned rect, which
    // would mismatch the sprite whenever rotation is non-zero.
    const corners = handlesFor(toRect(underlay))
    this.chrome
      .poly(corners.flatMap((h) => [h.at.x, h.at.y]))
      .stroke({ width: px(2), color: this.theme.selection })
    for (const handle of corners) {
      const r = px(5)
      this.chrome
        .rect(handle.at.x - r, handle.at.y - r, r * 2, r * 2)
        .fill({ color: this.theme.selection })
        .stroke({ width: px(1.5), color: this.theme.handle })
    }
  }

  destroy(): void {
    super.destroy({ children: true })
  }
}
