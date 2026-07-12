import type { Underlay } from '../../generated/project'

// Default placement for a freshly imported image: centred, scaled to fit
// entirely within the canvas (never cropped), aspect ratio preserved.
export function defaultPlacement(
  imageRef: string,
  imageSize: { width: number; height: number },
  canvas: { width: number; height: number },
): Underlay {
  const fit = Math.min(canvas.width / imageSize.width, canvas.height / imageSize.height, 1)
  const width = imageSize.width * fit
  const height = imageSize.height * fit
  return {
    imageRef,
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  }
}

// Intrinsic pixel size of an image file, read in-browser (no server round
// trip needed just to size the initial placement).
export async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}
