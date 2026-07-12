import { beforeEach, describe, expect, test } from 'vitest'
import type { Underlay } from '../../generated/project'
import { createDefaultProject } from '../../state/defaultProject'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'
import { UnderlayInteraction } from './interaction'

const UNDERLAY: Underlay = { imageRef: 'a'.repeat(64), x: 100, y: 100, width: 200, height: 100 }
const ctx = { scale: () => 1, setDraft: () => {} }

function down(x: number, y: number) {
  return { world: { x, y }, shiftKey: false, altKey: false }
}

beforeEach(() => {
  useProjectStore.setState({ project: { ...createDefaultProject(), underlay: UNDERLAY } })
  useEditorStore.setState({
    underlayVisible: true,
    underlayLocked: false,
    underlaySelected: false,
  })
})

describe('UnderlayInteraction', () => {
  test('declines when locked', () => {
    useEditorStore.setState({ underlayLocked: true })
    const tool = new UnderlayInteraction()
    expect(tool.onDown(down(150, 150), ctx)).toBe(false)
  })

  test('declines when hidden', () => {
    useEditorStore.setState({ underlayVisible: false })
    const tool = new UnderlayInteraction()
    expect(tool.onDown(down(150, 150), ctx)).toBe(false)
  })

  test('declines when there is no underlay', () => {
    useProjectStore.setState((s) => ({ project: { ...s.project, underlay: undefined } }))
    const tool = new UnderlayInteraction()
    expect(tool.onDown(down(150, 150), ctx)).toBe(false)
  })

  test('a body click selects and drags translate a moved underlay on release', () => {
    const tool = new UnderlayInteraction()
    expect(tool.onDown(down(150, 150), ctx)).toBe(true)
    expect(useEditorStore.getState().underlaySelected).toBe(true)

    tool.onMove(down(170, 160), ctx) // dx=20, dy=10
    expect(useProjectStore.getState().project.underlay).toMatchObject({ x: 120, y: 110 })

    tool.onUp()
    expect(useProjectStore.getState().project.underlay).toMatchObject({ x: 120, y: 110 })
  })

  test('a miss outside the body does not consume the event, and deselects', () => {
    useEditorStore.setState({ underlaySelected: true })
    const tool = new UnderlayInteraction()
    expect(tool.onDown(down(-500, -500), ctx)).toBe(false)
    expect(useEditorStore.getState().underlaySelected).toBe(false)
  })

  test('dragging a corner handle resizes from the opposite corner', () => {
    useEditorStore.setState({ underlaySelected: true })
    const tool = new UnderlayInteraction()
    // Bottom-right corner is at (300, 200).
    expect(tool.onDown(down(300, 200), ctx)).toBe(true)
    tool.onMove(down(320, 220), ctx)
    const underlay = useProjectStore.getState().project.underlay!
    expect(underlay.x).toBe(100)
    expect(underlay.y).toBe(100)
    expect(underlay.width).toBe(220)
    expect(underlay.height).toBe(120)
  })

  test('cancel reverts an in-progress drag', () => {
    const tool = new UnderlayInteraction()
    tool.onDown(down(150, 150), ctx)
    tool.onMove(down(500, 500), ctx)
    expect(useProjectStore.getState().project.underlay).not.toMatchObject(UNDERLAY)
    tool.cancel()
    expect(useProjectStore.getState().project.underlay).toEqual(UNDERLAY)
  })

  test('a click without movement does not record a command', () => {
    const tool = new UnderlayInteraction()
    tool.onDown(down(150, 150), ctx)
    tool.onUp()
    // No throw, and the document is untouched.
    expect(useProjectStore.getState().project.underlay).toEqual(UNDERLAY)
  })
})
