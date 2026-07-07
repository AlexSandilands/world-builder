import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { CanvasView } from './CanvasView'
import { sampleProject, useProjectStore } from '../state/projectStore'

type MockController = {
  mount: ReturnType<typeof vi.fn>
  setLayers: ReturnType<typeof vi.fn>
  fit: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

const instances: MockController[] = []

vi.mock('./CanvasController', () => ({
  CanvasController: class {
    mount = vi.fn().mockResolvedValue(undefined)
    setLayers = vi.fn()
    fit = vi.fn()
    destroy = vi.fn()
    constructor() {
      instances.push(this as unknown as MockController)
    }
  },
}))

beforeEach(() => {
  instances.length = 0
  useProjectStore.setState({ project: sampleProject, selectedLayerId: null })
})

// Regression for PR #43 review: toggling a layer replaces the project object
// identity; that must flow through setLayers, never remount the controller
// (a remount tears down the WebGL context and resets the viewport to fit).
test('layer toggle updates the live controller instead of remounting it', async () => {
  render(<CanvasView />)
  await waitFor(() => expect(instances.length).toBeGreaterThan(0))
  const controller = instances[instances.length - 1]
  await waitFor(() => expect(controller.mount).toHaveBeenCalled())
  const mountedControllers = instances.length

  act(() => {
    useProjectStore.getState().toggleLayerVisibility('line-high-road')
  })

  expect(instances.length).toBe(mountedControllers)
  expect(controller.destroy).not.toHaveBeenCalled()
  await waitFor(() => {
    const lastCall = controller.setLayers.mock.calls.at(-1)?.[0]
    expect(lastCall.find((l: { id: string }) => l.id === 'line-high-road')?.visible).toBe(false)
  })
})
