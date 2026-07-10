import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'
import App from './App'
import { createDefaultProject } from './state/defaultProject'
import { useEditorStore } from './state/editorStore'
import { useProjectStore } from './state/projectStore'

beforeEach(() => {
  useProjectStore.setState({ project: createDefaultProject() })
  useEditorStore.setState({ selectedRegionIds: [], tool: 'select' })
})

// WebGL is unavailable under jsdom, so the canvas cannot draw here; these
// assertions cover the authoring shell wiring. Live canvas interaction is
// verified in the browser (evidence in the PR).
test('renders the authoring shell: tool rail, layers, canvas, inspector', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'World Builder' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Tools' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Layers' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Region' })).toBeInTheDocument()
  expect(screen.getByTestId('canvas-host')).toBeInTheDocument()
})

test('selecting a region shows its tagging panel', () => {
  useProjectStore.getState().dispatch({
    kind: 'region/add',
    region: {
      id: 'r1',
      type: 'market-district',
      z: 0,
      label: 'the Great Shambles',
      geometry: { kind: 'rect', x: 100, y: 100, width: 400, height: 300 },
    },
  })
  useEditorStore.getState().select(['r1'])
  render(<App />)
  expect(screen.getByDisplayValue('the Great Shambles')).toBeInTheDocument()
  // Appears in both the layer row's type tag and the type picker trigger.
  expect(screen.getAllByText('Market district').length).toBeGreaterThan(0)
  expect(
    screen.getByText('market squares, stalls, guildhalls, dense shopfronts'),
  ).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Extend' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Override' })).toBeInTheDocument()
})
