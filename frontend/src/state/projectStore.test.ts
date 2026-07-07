import { beforeEach, describe, expect, test } from 'vitest'
import { sampleProject, useProjectStore } from './projectStore'

beforeEach(() => {
  useProjectStore.setState({ project: sampleProject, selectedLayerId: 'region-old-town' })
})

describe('project store', () => {
  test('sample project carries an artwork, a region, and a line layer', () => {
    const kinds = useProjectStore.getState().project.layers.map((l) => l.kind)
    expect(kinds).toEqual(['artwork', 'region', 'line'])
  })

  test('the artwork is a 16k pyramid, never a single texture', () => {
    const artwork = useProjectStore.getState().project.layers[0]
    expect(artwork.kind).toBe('artwork')
    if (artwork.kind === 'artwork') {
      expect(artwork.width).toBe(16384)
      expect(artwork.tileSize).toBe(256)
    }
  })

  test('toggleLayerVisibility flips exactly one layer', () => {
    useProjectStore.getState().toggleLayerVisibility('line-high-road')
    const layers = useProjectStore.getState().project.layers
    expect(layers.find((l) => l.id === 'line-high-road')?.visible).toBe(false)
    expect(layers.find((l) => l.id === 'artwork')?.visible).toBe(true)
  })

  test('selectLayer updates selection', () => {
    useProjectStore.getState().selectLayer('artwork')
    expect(useProjectStore.getState().selectedLayerId).toBe('artwork')
  })
})
