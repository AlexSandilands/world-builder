import type { Geometry, GlobalSettings } from '../../generated/project'
import { areaOf } from './geometry'

// Placeholder pending the Phase 0 synthesis (#8): regions smaller than this
// on the rendered output get too few latent pixels for regional prompting to
// hold. Replace with the minimum-region-size rule from
// docs/pipeline/DECISIONS.md the moment it exists.
export const MIN_REGION_SIDE_OUTPUT_PX = 128

// The warning fires at draw time (design rule: amber fill + badge), comparing
// the region's area at output resolution against a MIN_SIDE² threshold.
export function isBelowMinSize(g: Geometry, global: GlobalSettings): boolean {
  const outputPerCanvas = global.output.width / global.canvas.width
  const areaOutputPx = areaOf(g) * outputPerCanvas * outputPerCanvas
  return areaOutputPx < MIN_REGION_SIDE_OUTPUT_PX * MIN_REGION_SIDE_OUTPUT_PX
}
