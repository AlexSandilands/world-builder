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
  private loadedRef: string | null = null

  constructor(theme: OverlayTheme) {
    super()
    this.theme = theme
    this.sprite.anchor.set(0)
    this.addChild(this.sprite)
    this.addChild(this.chrome)
  }

  redraw(scene: UnderlayScene, scale: number): void {
    const { underlay } = scene
    this.chrome.clear()
    if (!underlay || !scene.visible) {
      this.sprite.visible = false
      return
    }
    this.sprite.visible = true
    this.sprite.alpha = scene.opacity
    this.loadTexture(underlay.imageRef)
    this.sprite.width = underlay.width
    this.sprite.height = underlay.height
    // Pixi rotates about the sprite's own origin (top-left, anchor 0); the
    // schema rotates about the rect centre, so pivot there in local space.
    this.sprite.pivot.set(underlay.width / 2, underlay.height / 2)
    this.sprite.position.set(underlay.x + underlay.width / 2, underlay.y + underlay.height / 2)
    this.sprite.angle = underlay.rotation ?? 0

    if (scene.selected && !scene.locked) this.drawChrome(underlay, scale)
  }

  // Fetch + createImageBitmap rather than Assets.load/Texture.from(url):
  // /api/assets/{digest} has no file extension for Pixi's loader to key its
  // format detection on, and this path already works (features/underlay's
  // import flow uses the same call to size a freshly picked file).
  private loadTexture(imageRef: string): void {
    if (this.loadedRef === imageRef) return
    this.loadedRef = imageRef
    fetch(assetUrl(imageRef))
      .then((res) => res.blob())
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        // A newer import may have started loading before this one resolved;
        // only apply the texture that's still current.
        if (this.loadedRef === imageRef && !this.destroyed) {
          this.sprite.texture = Texture.from(bitmap)
        } else {
          bitmap.close()
        }
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
