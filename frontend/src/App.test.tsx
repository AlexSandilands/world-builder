import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

// WebGL is unavailable under jsdom, so the canvas cannot draw here; these
// assertions cover the app shell wiring. The live pan/zoom render is verified
// in the browser (screenshot in the PR).
test('renders the app shell with header, layer panel, and canvas host', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'World Builder' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Layers' })).toBeInTheDocument()
  expect(screen.getByText('Old Town')).toBeInTheDocument()
  expect(screen.getByTestId('canvas-host')).toBeInTheDocument()
})
