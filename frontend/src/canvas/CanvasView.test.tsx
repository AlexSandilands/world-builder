import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { CanvasView } from './CanvasView'
import { createDefaultProject } from '../state/defaultProject'
import { useHistoryStore } from '../state/historyStore'
import { useProjectStore } from '../state/projectStore'

type MockController = {
  mount: ReturnType<typeof vi.fn>
  fit: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

const instances: MockController[] = []

vi.mock('./CanvasController', () => ({
  CanvasController: class {
    mount = vi.fn().mockResolvedValue(undefined)
    fit = vi.fn()
    destroy = vi.fn()
    constructor() {
      instances.push(this as unknown as MockController)
    }
  },
}))

beforeEach(() => {
  instances.length = 0
  useProjectStore.setState({ project: createDefaultProject() })
  useHistoryStore.getState().clear()
})

// Regression for PR #43 review: document mutations replace the project object
// identity; that must reach the controller via its store subscription, never
// by remounting it (a remount tears down the WebGL context and resets the
// viewport to fit).
test('project changes do not remount the controller', async () => {
  render(<CanvasView />)
  await waitFor(() => expect(instances.length).toBeGreaterThan(0))
  const controller = instances[instances.length - 1]
  await waitFor(() => expect(controller.mount).toHaveBeenCalled())
  const mountedControllers = instances.length

  act(() => {
    useProjectStore.getState().dispatch({
      kind: 'region/add',
      region: {
        id: 'r1',
        type: 'water',
        z: 0,
        geometry: { kind: 'rect', x: 0, y: 0, width: 100, height: 100 },
      },
    })
  })

  expect(instances.length).toBe(mountedControllers)
  expect(controller.destroy).not.toHaveBeenCalled()
  expect(useProjectStore.getState().project.regions).toHaveLength(1)
})
