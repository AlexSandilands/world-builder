import { beforeEach, describe, expect, test } from 'vitest'
import { CanvasController } from './CanvasController'
import type { Draft, PointerInfo, Tool, ToolContext } from './tools/toolTypes'
import { createDefaultProject } from '../state/defaultProject'
import { useEditorStore } from '../state/editorStore'
import { useHistoryStore } from '../state/historyStore'
import { useProjectStore } from '../state/projectStore'

// PR #59 round 2: the controller's Escape / tool-switch teardown must reach a
// multi-click tool that is mid-gesture *between* clicks — when nothing is
// `activeDrag`, so `cancelActive()` alone would miss it. These tests drive
// the controller's real handlers (`onKeyDown`, `onEditorChange` — class
// fields precisely so this file can bind them without a WebGL mount) against
// its real tool instances and tool context. Private access goes through one
// typed seam below.

type EditorSnapshot = ReturnType<typeof useEditorStore.getState>
type Internals = {
  tools: Record<string, Tool>
  toolContext: ToolContext
  draft: Draft | null
  onKeyDown: (e: KeyboardEvent) => void
  onEditorChange: (state: EditorSnapshot, prev: EditorSnapshot) => void
}

function controller(): Internals {
  return new CanvasController(() => {}) as unknown as Internals
}

function at(x: number, y: number): PointerInfo {
  return { world: { x, y }, shiftKey: false, altKey: false }
}

// A browser click as the controller routes it: pointerdown then pointerup.
function click(c: Internals, x: number, y: number): void {
  c.tools.line.onDown(at(x, y), c.toolContext)
  c.tools.line.onUp(at(x, y), c.toolContext)
}

function lines() {
  return useProjectStore.getState().project.lines
}

function setTool(c: Internals, tool: EditorSnapshot['tool']): void {
  const prev = useEditorStore.getState()
  useEditorStore.getState().setTool(tool)
  // The exact callback mount() subscribes to the editor store.
  c.onEditorChange(useEditorStore.getState(), prev)
}

beforeEach(() => {
  useProjectStore.setState({ project: createDefaultProject() })
  useHistoryStore.getState().clear()
  useEditorStore.setState({
    tool: 'line',
    selectedRegionIds: [],
    selectedLineIds: [],
    selectedPointIds: [],
    linesVisible: true,
    linesLocked: false,
    drawLineType: 'wall',
    drawLineWidth: 8,
  })
})

describe('CanvasController gesture teardown (mid-draw, between clicks)', () => {
  test('Escape between clicks discards the in-progress line and its preview', () => {
    const c = controller()
    click(c, 0, 0)
    click(c, 100, 0)
    expect(c.draft).toMatchObject({ kind: 'line' })

    // Between clicks no button is held, so nothing is activeDrag — Escape
    // must still reach the line tool.
    c.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(c.draft).toBeNull()
    expect(lines()).toHaveLength(0)

    // The next draw starts a NEW line, not a continuation of the dead one.
    click(c, 200, 200)
    click(c, 300, 200)
    c.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(lines()).toHaveLength(1)
    expect(lines()[0].points).toEqual([
      [200, 200],
      [300, 200],
    ])
  })

  test('Enter between clicks finishes through the real keydown handler', () => {
    const c = controller()
    click(c, 0, 0)
    click(c, 100, 0)
    c.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(c.draft).toBeNull()
    expect(lines()).toHaveLength(1)
    expect(lines()[0].points).toEqual([
      [0, 0],
      [100, 0],
    ])
  })

  test('switching tools mid-draw drops the vertices and clears the ghost preview', () => {
    const c = controller()
    click(c, 0, 0)
    click(c, 100, 0)
    expect(c.draft).not.toBeNull()

    setTool(c, 'select')
    expect(c.draft).toBeNull()
    expect(lines()).toHaveLength(0)

    // Coming back to the line tool starts fresh.
    setTool(c, 'line')
    click(c, 200, 200)
    click(c, 300, 200)
    c.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(lines()).toHaveLength(1)
    expect(lines()[0].points).toEqual([
      [200, 200],
      [300, 200],
    ])
  })
})
