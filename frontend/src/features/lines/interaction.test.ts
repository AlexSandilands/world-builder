import { beforeEach, describe, expect, test } from 'vitest'
import type { Line } from '../../generated/project'
import { createDefaultProject } from '../../state/defaultProject'
import { useEditorStore } from '../../state/editorStore'
import { useHistoryStore } from '../../state/historyStore'
import { useProjectStore } from '../../state/projectStore'
import { LineInteraction } from './interaction'

const ctx = { scale: () => 1, setDraft: () => {} }

function down(x: number, y: number, mods: { shiftKey?: boolean; altKey?: boolean } = {}) {
  return { world: { x, y }, shiftKey: false, altKey: false, ...mods }
}

const WALL: Line = {
  id: 'wall-1',
  type: 'wall',
  width: 8,
  points: [
    [0, 0],
    [100, 0],
    [100, 100],
  ],
}

function lines(): Line[] {
  return useProjectStore.getState().project.lines
}

beforeEach(() => {
  useProjectStore.setState({ project: { ...createDefaultProject(), lines: [WALL] } })
  useHistoryStore.getState().clear()
  useEditorStore.setState({
    selectedLineIds: [],
    selectedRegionIds: [],
    selectedPointIds: [],
    linesVisible: true,
    linesLocked: false,
  })
})

describe('LineInteraction', () => {
  test('declines when locked, hidden, or missing the stroke', () => {
    useEditorStore.setState({ linesLocked: true })
    expect(new LineInteraction().onDown(down(50, 0), ctx)).toBe(false)
    useEditorStore.setState({ linesLocked: false, linesVisible: false })
    expect(new LineInteraction().onDown(down(50, 0), ctx)).toBe(false)
    useEditorStore.setState({ linesVisible: true })
    expect(new LineInteraction().onDown(down(500, 500), ctx)).toBe(false)
  })

  test('a click on the stroke selects it', () => {
    const tool = new LineInteraction()
    expect(tool.onDown(down(50, 0), ctx)).toBe(true)
    tool.onUp()
    expect(useEditorStore.getState().selectedLineIds).toEqual(['wall-1'])
  })

  test('shift-click toggles membership', () => {
    const tool = new LineInteraction()
    tool.onDown(down(50, 0), ctx)
    tool.onUp()
    tool.onDown(down(50, 0, { shiftKey: true }), ctx)
    tool.onUp()
    expect(useEditorStore.getState().selectedLineIds).toEqual([])
  })

  test('dragging the stroke translates the whole line as one undo step', () => {
    const tool = new LineInteraction()
    tool.onDown(down(50, 0), ctx)
    tool.onMove(down(60, 10), ctx)
    tool.onUp()
    expect(lines()[0].points).toEqual([
      [10, 10],
      [110, 10],
      [110, 110],
    ])
    expect(useHistoryStore.getState().past).toHaveLength(1)

    useProjectStore.getState().undo()
    expect(lines()[0].points).toEqual(WALL.points)
  })

  test('dragging a selected vertex handle moves it', () => {
    useEditorStore.getState().selectLines(['wall-1'])
    const tool = new LineInteraction()
    expect(tool.onDown(down(100, 0), ctx)).toBe(true)
    tool.onMove(down(150, -20), ctx)
    tool.onUp()
    expect(lines()[0].points[1]).toEqual([150, -20])
  })

  test('alt-click a vertex deletes it', () => {
    useEditorStore.getState().selectLines(['wall-1'])
    const tool = new LineInteraction()
    tool.onDown(down(100, 0, { altKey: true }), ctx)
    expect(lines()[0].points).toHaveLength(2)
  })

  test('double-click on the selected edge inserts a vertex', () => {
    useEditorStore.getState().selectLines(['wall-1'])
    const tool = new LineInteraction()
    tool.onDoubleClick!(down(50, 0), ctx)
    expect(lines()[0].points).toHaveLength(4)
    expect(lines()[0].points[1]).toEqual([50, 0])
  })

  test('cancel reverts an in-flight drag without recording history', () => {
    const tool = new LineInteraction()
    tool.onDown(down(50, 0), ctx)
    tool.onMove(down(90, 40), ctx)
    tool.cancel()
    expect(lines()[0].points).toEqual(WALL.points)
    expect(useHistoryStore.getState().past).toHaveLength(0)
  })

  test('a click without movement does not record a command', () => {
    const tool = new LineInteraction()
    tool.onDown(down(50, 0), ctx)
    tool.onUp()
    expect(useHistoryStore.getState().past).toHaveLength(0)
  })
})
